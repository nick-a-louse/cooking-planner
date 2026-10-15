import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import type { Dep, Group, Plan, PlanDoc, PlanSummary, Task } from "@cookplan/shared";
import { db, transaction } from "../db.js";
import { publish, openStream } from "../events.js";
import { clonePlanSchema, createPlanSchema, idParams, planDocSchema } from "../schemas.js";

function now(): string {
  return new Date().toISOString();
}

/**
 * Default anchor for a new plan: 18:00 on today's *local* date (the container's TZ).
 * Using the UTC date picked yesterday between midnight and 01:00 during British Summer Time.
 */
export function defaultAnchor(at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T18:00`;
}

/**
 * Checks a plan document is self-consistent and only touches this plan's rows.
 * Returns an error message, or null when the document is fine.
 */
function docProblem(planId: string, d: PlanDoc): string | null {
  const groupIds = new Set<string>();
  for (const g of d.groups) {
    if (groupIds.has(g.id)) return `Group id "${g.id}" is used twice`;
    groupIds.add(g.id);
  }
  const taskIds = new Set<string>();
  for (const t of d.tasks) {
    if (taskIds.has(t.id)) return `Task id "${t.id}" is used twice`;
    taskIds.add(t.id);
    if (t.groupId !== null && !groupIds.has(t.groupId)) return `Task "${t.name}" is in a group that isn't in this plan`;
  }
  const depKeys = new Set<string>();
  for (const dep of d.deps) {
    if (!taskIds.has(dep.predecessorId) || !taskIds.has(dep.successorId)) {
      return "A dependency links a task that isn't in this plan";
    }
    if (dep.predecessorId === dep.successorId) return "A task can't depend on itself";
    const key = `${dep.predecessorId}>${dep.successorId}`;
    if (depKeys.has(key)) return "The same dependency is listed twice";
    depKeys.add(key);
  }
  // Ids are global primary keys: refuse ids that already belong to another plan.
  const clash = (table: "tasks" | "groups", ids: Set<string>) => {
    if (ids.size === 0) return false;
    const list = [...ids];
    const row = db
      .prepare(`SELECT id FROM ${table} WHERE plan_id != ? AND id IN (${list.map(() => "?").join(",")}) LIMIT 1`)
      .get(planId, ...list);
    return row !== undefined;
  };
  if (clash("groups", groupIds)) return "A group id belongs to another plan";
  if (clash("tasks", taskIds)) return "A task id belongs to another plan";
  return null;
}

/** Plan names are unique (case-insensitive, trimmed) across plans and templates. */
function nameTaken(name: string, excludeId?: string): boolean {
  const row = excludeId
    ? db.prepare("SELECT id FROM plans WHERE lower(trim(name)) = lower(trim(?)) AND id != ?").get(name, excludeId)
    : db.prepare("SELECT id FROM plans WHERE lower(trim(name)) = lower(trim(?))").get(name);
  return row !== undefined;
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
    revision: r.revision,
    alertLeadMin: r.alert_lead_min,
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

/** Per-plan settings that a copy or a plan made from a template keeps. */
const SETTINGS_COLUMNS = ["alert_lead_min"];

function copyPlanSettings(fromId: string, toId: string): void {
  const set = SETTINGS_COLUMNS.map((c) => `${c} = (SELECT ${c} FROM plans WHERE id = @fromId)`).join(", ");
  db.prepare(`UPDATE plans SET ${set} WHERE id = @toId`).run({ fromId, toId });
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

  app.post<{ Body: { name?: string; mode?: string; anchorTime?: string } }>(
    "/api/plans",
    { schema: { body: createPlanSchema } },
    (req, reply) => {
      const { name, mode, anchorTime } = req.body ?? {};
      const finalName = name?.trim() || "Untitled plan";
      if (nameTaken(finalName)) {
        return reply.code(409).send({ error: `A plan called "${finalName}" already exists` });
      }
      const id = nanoid(10);
      const ts = now();
      db.prepare(
        `INSERT INTO plans (id, name, mode, anchor_time, is_template, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 'draft', ?, ?)`,
      ).run(id, finalName, mode === "backward" ? "backward" : "forward", anchorTime ?? defaultAnchor(), ts, ts);
      reply.code(201);
      return loadDoc(id);
    },
  );

  app.get<{ Params: { id: string } }>("/api/plans/:id", { schema: { params: idParams } }, (req, reply) => {
    const doc = loadDoc(req.params.id);
    if (!doc) return reply.code(404).send({ error: "plan not found" });
    return doc;
  });

  // Transactional full-document replace: plan fields + all groups/tasks/deps.
  app.put<{ Params: { id: string }; Body: PlanDoc }>(
    "/api/plans/:id",
    { schema: { params: idParams, body: planDocSchema } },
    (req, reply) => {
      const planId = req.params.id;
      const existing = db.prepare("SELECT id FROM plans WHERE id = ?").get(planId);
      if (!existing) return reply.code(404).send({ error: "plan not found" });
      const doc = req.body;
      if (!doc?.plan || doc.plan.id !== planId) {
        return reply.code(400).send({ error: "document plan id mismatch" });
      }
      if (nameTaken(doc.plan.name, planId)) {
        return reply.code(409).send({ error: `A plan called "${doc.plan.name}" already exists` });
      }
      if (doc.plan.revision === undefined) {
        return reply.code(409).send({ error: "This page is out of date. Reload it to get the latest version of the app." });
      }
      const current = (db.prepare("SELECT revision FROM plans WHERE id = ?").get(planId) as { revision: number }).revision;
      if (doc.plan.revision !== current) {
        // Someone else saved since this copy was loaded. Send back the latest so the client can show it.
        return reply.code(409).send({ error: "This plan was changed on another device.", doc: loadDoc(planId) });
      }
      const problem = docProblem(planId, doc);
      if (problem) return reply.code(400).send({ error: problem });

      transaction(() => {
        const d = doc;
        db.prepare(
          `UPDATE plans SET name=@name, mode=@mode, anchor_time=@anchorTime, is_template=@isTemplate,
           status=@status, live_started_at=@liveStartedAt, revision=revision + 1, updated_at=@updatedAt,
           alert_lead_min=COALESCE(@alertLeadMin, alert_lead_min) WHERE id=@id`,
        ).run({
          id: planId,
          name: d.plan.name,
          mode: d.plan.mode,
          anchorTime: d.plan.anchorTime,
          isTemplate: d.plan.isTemplate ? 1 : 0,
          status: d.plan.status,
          liveStartedAt: d.plan.liveStartedAt,
          updatedAt: now(),
          alertLeadMin: d.plan.alertLeadMin ?? null,
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
      const saved = loadDoc(planId)!;
      publish(planId, "plan", saved);
      return saved;
    },
  );

  app.delete<{ Params: { id: string } }>("/api/plans/:id", { schema: { params: idParams } }, (req, reply) => {
    const info = db.prepare("DELETE FROM plans WHERE id = ?").run(req.params.id);
    if (info.changes === 0) return reply.code(404).send({ error: "plan not found" });
    publish(req.params.id, "deleted", { id: req.params.id });
    reply.code(204).send();
  });

  // Live sync: a stream of "plan" (full document after each save) and "deleted" events.
  app.get<{ Params: { id: string } }>("/api/plans/:id/events", { schema: { params: idParams } }, (req, reply) => {
    if (!db.prepare("SELECT id FROM plans WHERE id = ?").get(req.params.id)) {
      return reply.code(404).send({ error: "plan not found" });
    }
    reply.hijack(); // Fastify hands over the raw response; events.ts writes to it from now on
    openStream(req.params.id, reply.raw);
  });

  // Clone a plan (optionally as/from a template). New ids throughout, live state reset.
  app.post<{ Params: { id: string }; Body: { name?: string; asTemplate?: boolean; anchorTime?: string } }>(
    "/api/plans/:id/clone",
    { schema: { params: idParams, body: clonePlanSchema } },
    (req, reply) => {
      const src = loadDoc(req.params.id);
      if (!src) return reply.code(404).send({ error: "plan not found" });
      const { name, asTemplate, anchorTime } = req.body ?? {};
      const cloneName = name?.trim() || `${src.plan.name} (copy)`;
      if (nameTaken(cloneName)) {
        return reply.code(409).send({ error: `A plan called "${cloneName}" already exists` });
      }
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
        copyPlanSettings(src.plan.id, newPlanId);
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
