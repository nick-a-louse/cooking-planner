import type { FastifyInstance, FastifyReply } from "fastify";
import { nanoid } from "nanoid";
import type { Dep, Group, Plan, PlanDoc, PlanSummary, Task } from "@cookplan/shared";
import { db, transaction } from "../db.js";
import { publish, openStream } from "../events.js";
import { clonePlanSchema, createPlanSchema, idParams, importSchema, kitchenSchema, planDocSchema } from "../schemas.js";
import { DEFAULT_KITCHEN, type Kitchen } from "@cookplan/shared";

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
  const inconsistency = docInconsistency(d);
  if (inconsistency) return inconsistency;
  const groupIds = new Set(d.groups.map((g) => g.id));
  const taskIds = new Set(d.tasks.map((t) => t.id));
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

/** A plan document's own consistency: unique ids, and links only to its own groups and tasks. */
function docInconsistency(d: PlanDoc): string | null {
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
    ovens: r.ovens,
    hobRings: r.hob_rings,
    cooks: r.cooks,
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
    equipment: r.equipment ?? null,
    ovenTemp: r.oven_temp ?? null,
    handsOff: !!r.hands_off,
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

/** "My kitchen": the default equipment for new plans. */
export function getKitchen(): Kitchen {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'kitchen'").get() as { value: string } | undefined;
  return row ? { ...DEFAULT_KITCHEN, ...JSON.parse(row.value) } : DEFAULT_KITCHEN;
}

/** The file format for export and import. */
export const EXPORT_FORMAT = "cooking-planner";
export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: 1;
  exportedAt?: string;
  plans: PlanDoc[];
}

function sendExport(reply: FastifyReply, plans: PlanDoc[], baseName: string) {
  const file: ExportFile = { format: EXPORT_FORMAT, version: 1, exportedAt: now(), plans };
  const slug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan";
  return reply
    .header("Content-Disposition", `attachment; filename="${slug}.cookplan.json"`)
    .type("application/json")
    .send(JSON.stringify(file, null, 2));
}

/** A name not used by any plan yet: the name itself, else "<name> (imported)", "(imported 2)", … */
function freeName(name: string): string {
  if (!nameTaken(name)) return name;
  for (let n = 1; ; n++) {
    const candidate = `${name} (imported${n === 1 ? "" : ` ${n}`})`;
    if (!nameTaken(candidate)) return candidate;
  }
}

/**
 * Insert a copy of a plan document under new ids, as a fresh draft (no live run, nothing ticked off).
 * Used by clone, "use template" and import. Call inside a transaction; returns the new plan's id.
 */
function insertCopy(src: PlanDoc, opts: { name: string; isTemplate: boolean; anchorTime: string }): string {
  const ts = now();
  const planId = nanoid(10);
  const groupIds = new Map(src.groups.map((g) => [g.id, nanoid(10)]));
  const taskIds = new Map(src.tasks.map((t) => [t.id, nanoid(10)]));
  const kitchen = getKitchen();
  db.prepare(
    `INSERT INTO plans (id, name, mode, anchor_time, is_template, status, created_at, updated_at, alert_lead_min, ovens, hob_rings, cooks)
     VALUES (@id, @name, @mode, @anchorTime, @isTemplate, 'draft', @ts, @ts, @alertLeadMin, @ovens, @hobRings, @cooks)`,
  ).run({
    id: planId,
    name: opts.name,
    mode: src.plan.mode,
    anchorTime: opts.anchorTime,
    isTemplate: opts.isTemplate ? 1 : 0,
    ts,
    // Settings a copy keeps; a file from an older version may not have them.
    alertLeadMin: src.plan.alertLeadMin ?? 5,
    ovens: src.plan.ovens ?? kitchen.ovens,
    hobRings: src.plan.hobRings ?? kitchen.hobRings,
    cooks: src.plan.cooks ?? 1,
  });
  const gStmt = insertGroup();
  const tStmt = insertTask();
  const dStmt = insertDep();
  for (const g of src.groups) gStmt.run({ ...g, id: groupIds.get(g.id)!, planId });
  for (const t of src.tasks) {
    tStmt.run({
      ...t,
      id: taskIds.get(t.id)!,
      planId,
      groupId: t.groupId ? (groupIds.get(t.groupId) ?? null) : null,
      status: "pending",
      actualStartAt: null,
      actualDoneAt: null,
      equipment: t.equipment ?? null,
      ovenTemp: t.ovenTemp ?? null,
      handsOff: t.handsOff ? 1 : 0,
    });
  }
  for (const dep of src.deps) {
    dStmt.run({ planId, predecessorId: taskIds.get(dep.predecessorId)!, successorId: taskIds.get(dep.successorId)! });
  }
  return planId;
}

const insertGroup = () =>
  db.prepare(
    "INSERT INTO groups (id, plan_id, name, color, sort_order) VALUES (@id, @planId, @name, @color, @sortOrder)",
  );
const insertTask = () =>
  db.prepare(
    `INSERT INTO tasks (id, plan_id, group_id, kind, name, start_min, duration_min, color, notes, sort_order, status, actual_start_at, actual_done_at, equipment, oven_temp, hands_off)
     VALUES (@id, @planId, @groupId, @kind, @name, @startMin, @durationMin, @color, @notes, @sortOrder, @status, @actualStartAt, @actualDoneAt, @equipment, @ovenTemp, @handsOff)`,
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
      const kitchen = getKitchen();
      db.prepare(
        `INSERT INTO plans (id, name, mode, anchor_time, is_template, status, created_at, updated_at, ovens, hob_rings)
         VALUES (?, ?, ?, ?, 0, 'draft', ?, ?, ?, ?)`,
      ).run(id, finalName, mode === "backward" ? "backward" : "forward", anchorTime ?? defaultAnchor(), ts, ts, kitchen.ovens, kitchen.hobRings);
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
           alert_lead_min=COALESCE(@alertLeadMin, alert_lead_min), ovens=COALESCE(@ovens, ovens),
           hob_rings=COALESCE(@hobRings, hob_rings), cooks=COALESCE(@cooks, cooks) WHERE id=@id`,
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
          ovens: d.plan.ovens ?? null,
          hobRings: d.plan.hobRings ?? null,
          cooks: d.plan.cooks ?? null,
        });
        db.prepare("DELETE FROM deps WHERE plan_id = ?").run(planId);
        db.prepare("DELETE FROM tasks WHERE plan_id = ?").run(planId);
        db.prepare("DELETE FROM groups WHERE plan_id = ?").run(planId);
        const gStmt = insertGroup();
        const tStmt = insertTask();
        const dStmt = insertDep();
        for (const g of d.groups) gStmt.run({ ...g, planId });
        // equipment/ovenTemp may be missing from a page older than the equipment feature.
        for (const t of d.tasks) {
          tStmt.run({ ...t, equipment: t.equipment ?? null, ovenTemp: t.ovenTemp ?? null, handsOff: t.handsOff ? 1 : 0, planId });
        }
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

  // "My kitchen": the default ovens and hob rings for new plans.
  app.get("/api/settings/kitchen", () => getKitchen());
  app.put<{ Body: Kitchen }>("/api/settings/kitchen", { schema: { body: kitchenSchema } }, (req) => {
    const kitchen = { ovens: req.body.ovens, hobRings: req.body.hobRings };
    db.prepare("INSERT INTO settings (key, value) VALUES ('kitchen', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
      JSON.stringify(kitchen),
    );
    return kitchen;
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
      const newPlanId = transaction(() =>
        insertCopy(src, { name: cloneName, isTemplate: !!asTemplate, anchorTime: anchorTime ?? src.plan.anchorTime }),
      );
      reply.code(201);
      return loadDoc(newPlanId);
    },
  );

  // Export one plan or template as a file (sharing templates, backups).
  app.get<{ Params: { id: string } }>("/api/plans/:id/export", { schema: { params: idParams } }, (req, reply) => {
    const doc = loadDoc(req.params.id);
    if (!doc) return reply.code(404).send({ error: "plan not found" });
    return sendExport(reply, [doc], doc.plan.name);
  });

  // Export every plan and template in one file.
  app.get("/api/export", (_req, reply) => {
    const ids = db.prepare("SELECT id FROM plans ORDER BY is_template, name").all() as { id: string }[];
    return sendExport(reply, ids.map((r) => loadDoc(r.id)!), "cooking-planner-all");
  });

  // Import a file made by an export. Always adds new plans (fresh ids); never overwrites.
  // A name already in use gets " (imported)" added, then " (imported 2)" and so on.
  app.post<{ Body: ExportFile }>(
    "/api/import",
    { schema: { body: importSchema }, bodyLimit: 10 * 1024 * 1024, attachValidation: true },
    (req, reply) => {
      if (req.validationError) {
        const body = req.body as Partial<ExportFile> | null;
        const message =
          body?.format !== EXPORT_FORMAT
            ? "This file isn't a Cooking Planner export."
            : body.version !== 1
              ? "This file was made by a newer version of Cooking Planner. Update this app, then try again."
              : `Part of this file isn't valid (${req.validationError.message.replace(/^body\//, "")}).`;
        return reply.code(400).send({ error: message });
      }
      for (const d of req.body.plans) {
        const problem = docInconsistency(d);
        if (problem) return reply.code(400).send({ error: `"${d.plan.name}": ${problem}` });
      }
      const imported = transaction(() =>
        req.body.plans.map((d) => {
          const name = freeName(d.plan.name.trim());
          const id = insertCopy(d, { name, isTemplate: d.plan.isTemplate, anchorTime: d.plan.anchorTime });
          return { id, name, isTemplate: d.plan.isTemplate };
        }),
      );
      reply.code(201);
      return { imported };
    },
  );
}
