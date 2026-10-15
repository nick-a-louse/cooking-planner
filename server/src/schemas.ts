// JSON schemas for the plan API. Fastify validates every request body against these
// before the handler runs, so bad input gets a 400 that says what's wrong instead of a 500.

const id = { type: "string", minLength: 1, maxLength: 64 } as const;
const name = { type: "string", minLength: 1, maxLength: 200 } as const;
const isoOrNull = { type: ["string", "null"], maxLength: 40 } as const;
const colour = { type: "string", pattern: "^#[0-9a-fA-F]{6}$" } as const;
/** A local date and time from a datetime-local input, e.g. "2026-12-25T13:00". */
export const localDateTime = {
  type: "string",
  pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?$",
} as const;
const minutes = { type: "integer", minimum: -100000, maximum: 100000 } as const;

const plan = {
  type: "object",
  required: ["id", "name", "mode", "anchorTime", "isTemplate", "status", "liveStartedAt"],
  properties: {
    id,
    name,
    mode: { enum: ["forward", "backward"] },
    anchorTime: localDateTime,
    isTemplate: { type: "boolean" },
    status: { enum: ["draft", "live", "done"] },
    liveStartedAt: isoOrNull,
    // Optional here so an out-of-date page gets a clear "reload" message rather than a schema error.
    revision: { type: "integer", minimum: 1 },
    alertLeadMin: { enum: [1, 2, 5, 10] },
    ovens: { type: "integer", minimum: 0, maximum: 4 },
    hobRings: { type: "integer", minimum: 0, maximum: 8 },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
} as const;

const group = {
  type: "object",
  required: ["id", "name", "color", "sortOrder"],
  properties: { id, planId: { type: "string" }, name, color: colour, sortOrder: { type: "integer" } },
} as const;

const task = {
  type: "object",
  required: [
    "id", "groupId", "kind", "name", "startMin", "durationMin", "color", "notes", "sortOrder", "status",
    "actualStartAt", "actualDoneAt",
  ],
  properties: {
    id,
    planId: { type: "string" },
    groupId: { type: ["string", "null"], maxLength: 64 },
    kind: { enum: ["task", "wait"] },
    name,
    startMin: minutes,
    durationMin: { type: "integer", minimum: 1, maximum: 100000 },
    color: { anyOf: [colour, { type: "null" }] },
    notes: { type: "string", maxLength: 10000 },
    sortOrder: { type: "integer" },
    status: { enum: ["pending", "active", "done"] },
    actualStartAt: isoOrNull,
    actualDoneAt: isoOrNull,
    equipment: { anyOf: [{ type: "string", pattern: "^(hob|oven-[1-4])$" }, { type: "null" }] },
    ovenTemp: { type: ["integer", "null"], minimum: 0, maximum: 350 },
  },
} as const;

const dep = {
  type: "object",
  required: ["predecessorId", "successorId"],
  properties: { planId: { type: "string" }, predecessorId: id, successorId: id },
} as const;

export const planDocSchema = {
  type: "object",
  required: ["plan", "groups", "tasks", "deps"],
  properties: {
    plan,
    groups: { type: "array", maxItems: 500, items: group },
    tasks: { type: "array", maxItems: 2000, items: task },
    deps: { type: "array", maxItems: 5000, items: dep },
  },
} as const;

export const createPlanSchema = {
  type: ["object", "null"],
  properties: {
    name: { type: "string", maxLength: 200 },
    mode: { enum: ["forward", "backward"] },
    anchorTime: localDateTime,
  },
} as const;

export const clonePlanSchema = {
  type: ["object", "null"],
  properties: {
    name: { type: "string", maxLength: 200 },
    asTemplate: { type: "boolean" },
    anchorTime: localDateTime,
  },
} as const;

/** "My kitchen": the default equipment copied into each new plan. */
export const kitchenSchema = {
  type: "object",
  required: ["ovens", "hobRings"],
  properties: {
    ovens: { type: "integer", minimum: 0, maximum: 4 },
    hobRings: { type: "integer", minimum: 0, maximum: 8 },
  },
} as const;

export const idParams = {
  type: "object",
  required: ["id"],
  properties: { id },
} as const;
