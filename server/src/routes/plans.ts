import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import type { Dep, Group, Plan, PlanDoc, PlanSummary, Task } from "@cookplan/shared";
import { db, transaction } from "../db.js";

function now(): string {
  return new Date().toISOString();
}

function rowToPlan(r: any): Plan {
  return {
    id: r.id,
    name: r.name,
    mode: r.mode,
    anchorTime: r.anchor_time,
    isTemplate: !!r.is_template,
    status: r.status,
    liveStartedAt: r.live_started_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToGroup(r: any): Group {
  return { id: r.id, planId: r.plan_id, name: r.name, color: r.color, sortOrder: r.sort_order };
}

function rowToTask(r: any): Task {
  return {
    id: r.id,
    planId: r.plan_id,
    groupId: r.group_id,
    kind: r.kind ?? "task",
    name: r.name,
    startMin: r.start_min,
    durationMin: r.duration_min,
    color: r.color,
    notes: r.notes,
    sortOrder: r.sort_order,
    status: r.status,
    actualStartAt: r.actual_start_at,
    actualDoneAt: r.actual_done_at,
  };
}

function loadDoc(planId: string): PlanDoc | null {
  const planRow = db.prepare("SELECT * FROM plans WHERE id = ?").get(planId);
  if (!planRow) return null;
  const groups = db
    .prepare("SELECT * FROM groups WHERE plan_id = ? ORDER BY sort_order")
    .all(planId)
    .map(rowToGroup);
  const tasks = db
    .prepare("SELECT * FROM tasks WHERE plan_id = ? ORDER BY sort_order")
    .all(planId)
    .map(rowToTask);
  const deps: Dep[] = db
    .prepare("SELECT * FROM deps WHERE plan_id = ?")
    .all(planId)
    .map((r: any) => ({ planId: r.plan_id, predecessorId: r.predecessor_id, successorId: r.successor_id }));
  return { plan: rowToPlan(planRow), groups, tasks, deps };
}

const insertGroup = () =>
  db.prepare(
    "INSERT INTO groups (id, plan_id, name, color, sort_order) VALUES (@id, @planId, @name, @color, @sortOrder)",
  );
const insertTask = () =>
  db.prepare(
    `INSERT INTO tasks (id, plan_id, group_id, kind, name, start_min, duration_min, color, notes, sort_order, status, actual_start_at, actual_done_at)
     VALUES (@id, @planId, @groupId, @kind, @name, @startMin, @durationMin, @color, @notes, @sortOrder, @status, @actualStartAt, @actualDoneAt)`,
  );
const insertDep = () =>
  db.prepare(
    "INSERT INTO deps (plan_id, predecessor_id, successor_id) VALUES (@planId, @predecessorId, @successorId)",
  );

export function planRoutes(app: FastifyInstance): void {
  app.get("/api/plans", () => {
    const rows = db
      .prepare("SELECT id, name, mode, anchor_time, is_template, status, updated_at FROM plans ORDER BY updated_at DESC")
      .all();
    const summaries: PlanSummary[] = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      mode: r.mode,
      anchorTime: r.anchor_time,
      isTemplate: !!r.is_template,
      status: r.status,
      updatedAt: r.updated_at,
    }));
    return summaries;
  });

  app.post<{ Body: { name?: string; mode?: string; anchorTime?: string } }>("/api/plans", (req, reply) => {
    const { name, mode, anchorTime } = req.body ?? {};
    const id = nanoid(10);
    const ts = now();
    // Default anchor: today at 18:00 local — a sensible dinner-time starting point.
    const defaultAnchor = `${ts.slice(0, 10)}T18:00`;
    db.prepare(
      `INSERT INTO plans (id, name, mode, anchor_time, is_template, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 'draft', ?, ?)`,
    ).run(id, name?.trim() || "Untitled plan", mode === "backward" ? "backward" : "forward", anchorTime ?? defaultAnchor, ts, ts);
    reply.code(201);
    return loadDoc(id);
  });

  app.get<{ Params: { id: string } }>("/api/plans/:id", (req, reply) => {
    const doc = loadDoc(req.params.id);
    if (!doc) return reply.code(404).send({ error: "plan not found" });
    return doc;
  });

  // Transactional full-document replace: plan fields + all groups/tasks/deps.
  app.put<{ Params: { id: string }; Body: PlanDoc }>("/api/plans/:id", (req, reply) => {
    const planId = req.params.id;
    const existing = db.prepare("SELECT id FROM plans WHERE id = ?").get(planId);
    if (!existing) return reply.code(404).send({ error: "plan not found" });
    const doc = req.body;
    if (!doc?.plan || doc.plan.id !== planId) {
      return reply.code(400).send({ error: "document plan id mismatch" });
    }

    transaction(() => {
      const d = doc;
      db.prepare(
        `UPDATE plans SET name=@name, mode=@mode, anchor_time=@anchorTime, is_template=@isTemplate,
         status=@status, live_started_at=@liveStartedAt, updated_at=@updatedAt WHERE id=@id`,
      ).run({
        id: planId,
        name: d.plan.name,
        mode: d.plan.mode,
        anchorTime: d.plan.anchorTime,
        isTemplate: d.plan.isTemplate ? 1 : 0,
        status: d.plan.status,
        liveStartedAt: d.plan.liveStartedAt,
        updatedAt: now(),
      });
      db.prepare("DELETE FROM deps WHERE plan_id = ?").run(planId);
      db.prepare("DELETE FROM tasks WHERE plan_id = ?").run(planId);
      db.prepare("DELETE FROM groups WHERE plan_id = ?").run(planId);
      const gStmt = insertGroup();
      const tStmt = insertTask();
      const dStmt = insertDep();
      for (const g of d.groups) gStmt.run({ ...g, planId });
      for (const t of d.tasks) tStmt.run({ ...t, planId });
      for (const dep of d.deps) dStmt.run({ ...dep, planId });
    });
    return loadDoc(planId);
  });

  app.delete<{ Params: { id: string } }>("/api/plans/:id", (req, reply) => {
    const info = db.prepare("DELETE FROM plans WHERE id = ?").run(req.params.id);
    if (info.changes === 0) return reply.code(404).send({ error: "plan not found" });
    reply.code(204).send();
  });

  // Clone a plan (optionally as/from a template). New ids throughout, live state reset.
  app.post<{ Params: { id: string }; Body: { name?: string; asTemplate?: boolean; anchorTime?: string } }>(
    "/api/plans/:id/clone",
    (req, reply) => {
      const src = loadDoc(req.params.id);
      if (!src) return reply.code(404).send({ error: "plan not found" });
      const { name, asTemplate, anchorTime } = req.body ?? {};
      const ts = now();
      const newPlanId = nanoid(10);
      const groupIdMap = new Map<string, string>();
      const taskIdMap = new Map<string, string>();
      for (const g of src.groups) groupIdMap.set(g.id, nanoid(10));
      for (const t of src.tasks) taskIdMap.set(t.id, nanoid(10));

      transaction(() => {
        db.prepare(
          `INSERT INTO plans (id, name, mode, anchor_time, is_template, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
        ).run(
          newPlanId,
          name?.trim() || `${src.plan.name} (copy)`,
          src.plan.mode,
          anchorTime ?? src.plan.anchorTime,
          asTemplate ? 1 : 0,
          ts,
          ts,
        );
        const gStmt = insertGroup();
        const tStmt = insertTask();
        const dStmt = insertDep();
        for (const g of src.groups) {
          gStmt.run({ ...g, id: groupIdMap.get(g.id)!, planId: newPlanId });
        }
        for (const t of src.tasks) {
          tStmt.run({
            ...t,
            id: taskIdMap.get(t.id)!,
            planId: newPlanId,
            groupId: t.groupId ? (groupIdMap.get(t.groupId) ?? null) : null,
            status: "pending",
            actualStartAt: null,
            actualDoneAt: null,
          });
        }
        for (const dep of src.deps) {
          dStmt.run({
            planId: newPlanId,
            predecessorId: taskIdMap.get(dep.predecessorId)!,
            successorId: taskIdMap.get(dep.successorId)!,
          });
        }
      });
      reply.code(201);
      return loadDoc(newPlanId);
    },
  );
}
