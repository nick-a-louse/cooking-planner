// Smoke tests: the app answers /healthz and /metrics, counts saves and serves the page.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

const dir = mkdtempSync(join(tmpdir(), "cookplan-"));
process.env.DB_PATH = join(dir, "app.db"); // db.ts reads this when first imported
process.env.APP_VERSION = "sha-0123456789abcdef";
process.env.LOG_LEVEL = "silent";
process.env.TZ = "Europe/London"; // the container default; the date test depends on it

let app: FastifyInstance;

beforeAll(async () => {
  const dist = join(dir, "dist");
  mkdirSync(join(dist, "static"), { recursive: true });
  writeFileSync(join(dist, "index.html"), '<html><link rel="stylesheet" href="/static/gomez-ui.css"></html>');
  writeFileSync(join(dist, "static", "manifest.webmanifest"), "{}");
  const { buildApp } = await import("../app.js");
  app = await buildApp({ clientDist: dist });
});
afterAll(() => app.close());

describe("runtime contract", () => {
  it("healthz is ok and reports the version", async () => {
    const r = await app.inject("/healthz");
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: true, version: "1.1.0 (sha-0123456)", plans: 0 });
  });

  it("metrics include build info and count saves", async () => {
    const created = (await app.inject({ method: "POST", url: "/api/plans", payload: { name: "Test dinner" } })).json();
    const saved = await app.inject({ method: "PUT", url: `/api/plans/${created.plan.id}`, payload: created });
    expect(saved.statusCode).toBe(200);
    const body = (await app.inject("/metrics")).body;
    expect(body).toContain('cooking_planner_build_info{version="1.1.0 (sha-0123456)"} 1');
    expect(body).toContain('cooking_planner_saves_total{result="ok"} 1');
    expect(body).toContain('cooking_planner_plans{kind="plan"} 1');
    expect(body).toMatch(/cooking_planner_last_success_timestamp_seconds [1-9]/);
  });

  // Regression: deleting a plan returned 400 because the client labelled the body-less
  // DELETE as JSON. Both the current client (no header) and old cached ones must work.
  it.each([
    ["without a content type", {}],
    ["with an empty JSON body (older clients)", { "content-type": "application/json" }],
  ])("deletes a plan %s", async (label, headers) => {
    const created = (await app.inject({ method: "POST", url: "/api/plans", payload: { name: `To delete ${label}` } })).json();
    const url = `/api/plans/${created.plan.id}`;
    expect((await app.inject({ method: "DELETE", url, headers })).statusCode).toBe(204);
    expect((await app.inject(url)).statusCode).toBe(404);
  });

  it("still rejects malformed JSON", async () => {
    const r = await app.inject({ method: "POST", url: "/api/plans", headers: { "content-type": "application/json" }, payload: "{nope" });
    expect(r.statusCode).toBe(400);
  });

  it("serves the page for app routes, JSON 404 for unknown API paths, and the manifest type", async () => {
    expect((await app.inject("/some/page")).body).toContain("gomez-ui.css");
    expect((await app.inject("/api/nope")).statusCode).toBe(404);
    expect((await app.inject("/static/manifest.webmanifest")).headers["content-type"]).toContain("application/manifest+json");
  });
});

describe("plan validation", () => {
  const newPlan = async (name: string) =>
    (await app.inject({ method: "POST", url: "/api/plans", payload: { name } })).json();
  const task = (planId: string, id: string, extra: Record<string, unknown> = {}) => ({
    id, planId, groupId: null, kind: "task", name: id, startMin: 0, durationMin: 10, color: null,
    notes: "", sortOrder: 0, status: "pending", actualStartAt: null, actualDoneAt: null, equipment: null, ovenTemp: null, handsOff: false, ...extra,
  });
  const put = (doc: any) => app.inject({ method: "PUT", url: `/api/plans/${doc.plan.id}`, payload: doc });

  it("accepts a valid plan with a group, tasks and a dependency", async () => {
    const doc = await newPlan("Valid");
    doc.groups = [{ id: "g1", planId: doc.plan.id, name: "Roast", color: "#a03a3a", sortOrder: 0 }];
    doc.tasks = [task(doc.plan.id, "a", { groupId: "g1" }), task(doc.plan.id, "b")];
    doc.deps = [{ planId: doc.plan.id, predecessorId: "a", successorId: "b" }];
    const r = await put(doc);
    expect(r.statusCode).toBe(200);
    expect(r.json().tasks).toHaveLength(2);
  });

  it.each([
    ["a missing field", (d: any) => delete d.tasks[0].durationMin, /durationMin/],
    ["a zero duration", (d: any) => (d.tasks[0].durationMin = 0), /durationMin/],
    ["an unknown task kind", (d: any) => (d.tasks[0].kind = "boil"), /kind/],
    ["a bad colour", (d: any) => (d.tasks[0].color = "red"), /color/],
    ["a bad anchor time", (d: any) => (d.plan.anchorTime = "tomorrow"), /anchorTime/],
    ["a dependency on a task not in the plan", (d: any) => d.deps.push({ predecessorId: "a", successorId: "zzz" }), /isn't in this plan/],
    ["a task in a group not in the plan", (d: any) => (d.tasks[0].groupId = "nope"), /group that isn't in this plan/],
    ["a duplicate task id", (d: any) => d.tasks.push(task(d.plan.id, "a")), /used twice/],
  ])("rejects %s with a 400 and a clear message", async (_label, breakIt, message) => {
    const doc = await newPlan(`Invalid ${_label}`);
    doc.tasks = [task(doc.plan.id, "a")];
    breakIt(doc);
    const r = await put(doc);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(message);
  });

  it("rejects task ids that belong to another plan, leaving that plan untouched", async () => {
    const first = await newPlan("Owner");
    first.tasks = [task(first.plan.id, "owned")];
    expect((await put(first)).statusCode).toBe(200);
    const thief = await newPlan("Thief");
    thief.tasks = [task(thief.plan.id, "owned")];
    const r = await put(thief);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/another plan/);
    expect((await app.inject(`/api/plans/${first.plan.id}`)).json().tasks).toHaveLength(1);
  });
});

describe("default start time", () => {
  it("uses the local date, not the UTC one, just after midnight in summer time", async () => {
    const { defaultAnchor } = await import("../routes/plans.js");
    // 00:30 BST on 15 October is still 14 October in UTC.
    expect(defaultAnchor(new Date("2026-10-14T23:30:00Z"))).toBe("2026-10-15T18:00");
    expect(defaultAnchor(new Date("2026-12-25T10:00:00Z"))).toBe("2026-12-25T18:00");
  });
});

describe("live sync", () => {
  const newPlan = async (name: string) =>
    (await app.inject({ method: "POST", url: "/api/plans", payload: { name } })).json();
  const put = (doc: any) => app.inject({ method: "PUT", url: `/api/plans/${doc.plan.id}`, payload: doc });

  it("bumps the revision on each save and refuses a save based on an old one", async () => {
    const doc = await newPlan("Two devices");
    expect(doc.plan.revision).toBe(1);
    const phone = structuredClone(doc);
    const tablet = structuredClone(doc);

    phone.plan.name = "Two devices (phone)";
    const first = await put(phone);
    expect(first.statusCode).toBe(200);
    expect(first.json().plan.revision).toBe(2);

    tablet.plan.name = "Two devices (tablet)";
    const second = await put(tablet);
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toMatch(/another device/);
    expect(second.json().doc.plan).toMatchObject({ name: "Two devices (phone)", revision: 2 });
  });

  it("tells an out-of-date page to reload instead of overwriting", async () => {
    const doc = await newPlan("Old page");
    delete doc.plan.revision;
    const r = await put(doc);
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toMatch(/Reload/);
  });

  it("does not count a 409 as a failed save in the metrics", async () => {
    const doc = await newPlan("Metrics conflict");
    await put({ ...doc, plan: { ...doc.plan, revision: 99 } });
    expect((await app.inject("/metrics")).body).toContain("cooking_planner_last_attempt_ok 1");
  });

  it("streams each save and the delete to every open screen", async () => {
    const doc = await newPlan("Streamed");
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    const res = await fetch(`${address}/api/plans/${doc.plan.id}/events`);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    let text = "";
    const readUntil = async (marker: string) => {
      while (!text.includes(marker)) text += new TextDecoder().decode((await reader.read()).value);
    };
    await readUntil("retry:");

    doc.plan.name = "Streamed (renamed)";
    expect((await put(doc)).statusCode).toBe(200);
    await readUntil("event: plan");
    await readUntil("\n\n");
    const data = JSON.parse(text.split("event: plan\ndata: ")[1].split("\n")[0]);
    expect(data.plan).toMatchObject({ name: "Streamed (renamed)", revision: 2 });

    await app.inject({ method: "DELETE", url: `/api/plans/${doc.plan.id}` });
    await readUntil("event: deleted");
    await reader.cancel();
  });

  it("returns 404 for the stream of a plan that doesn't exist", async () => {
    expect((await app.inject("/api/plans/nope/events")).statusCode).toBe(404);
  });
});

describe("kitchen and equipment", () => {
  const newPlan = async (name: string) =>
    (await app.inject({ method: "POST", url: "/api/plans", payload: { name } })).json();

  it("copies My kitchen into each new plan, which can then differ", async () => {
    expect((await app.inject("/api/settings/kitchen")).json()).toEqual({ ovens: 1, hobRings: 4 });
    const set = await app.inject({ method: "PUT", url: "/api/settings/kitchen", payload: { ovens: 2, hobRings: 5 } });
    expect(set.json()).toEqual({ ovens: 2, hobRings: 5 });
    const doc = await newPlan("Kitchen copy");
    expect(doc.plan).toMatchObject({ ovens: 2, hobRings: 5 });
    doc.plan.ovens = 1;
    const saved = await app.inject({ method: "PUT", url: `/api/plans/${doc.plan.id}`, payload: doc });
    expect(saved.json().plan.ovens).toBe(1);
    expect((await app.inject("/api/settings/kitchen")).json().ovens).toBe(2);
    const clone = await app.inject({ method: "POST", url: `/api/plans/${doc.plan.id}/clone`, payload: { name: "Kitchen copy 2" } });
    expect(clone.json().plan).toMatchObject({ ovens: 1, hobRings: 5 });
    await app.inject({ method: "PUT", url: "/api/settings/kitchen", payload: { ovens: 1, hobRings: 4 } });
  });

  it("rejects an impossible kitchen", async () => {
    expect((await app.inject({ method: "PUT", url: "/api/settings/kitchen", payload: { ovens: 9, hobRings: 4 } })).statusCode).toBe(400);
  });

  it("saves and reloads what each task uses, and rejects unknown equipment", async () => {
    const doc = await newPlan("Equipment");
    const t = { id: "eq1", planId: doc.plan.id, groupId: null, kind: "task", name: "Roast", startMin: 0, durationMin: 60, color: null, notes: "", sortOrder: 0, status: "pending", actualStartAt: null, actualDoneAt: null, equipment: "oven-1", ovenTemp: 180 };
    doc.tasks = [t];
    const r = await app.inject({ method: "PUT", url: `/api/plans/${doc.plan.id}`, payload: doc });
    expect(r.json().tasks[0]).toMatchObject({ equipment: "oven-1", ovenTemp: 180 });
    const bad = r.json();
    bad.tasks[0].equipment = "grill";
    expect((await app.inject({ method: "PUT", url: `/api/plans/${doc.plan.id}`, payload: bad })).statusCode).toBe(400);
  });
});

describe("hands-on", () => {
  it("saves cooks and hands-off, and copies keep them", async () => {
    const doc = (await app.inject({ method: "POST", url: "/api/plans", payload: { name: "Hands" } })).json();
    expect(doc.plan.cooks).toBe(1);
    doc.plan.cooks = 2;
    doc.tasks = [{ id: "h1", planId: doc.plan.id, groupId: null, kind: "task", name: "Roast", startMin: 0, durationMin: 60, color: null, notes: "", sortOrder: 0, status: "pending", actualStartAt: null, actualDoneAt: null, equipment: null, ovenTemp: null, handsOff: true }];
    const saved = (await app.inject({ method: "PUT", url: `/api/plans/${doc.plan.id}`, payload: doc })).json();
    expect(saved.plan.cooks).toBe(2);
    expect(saved.tasks[0].handsOff).toBe(true);
    const clone = (await app.inject({ method: "POST", url: `/api/plans/${doc.plan.id}/clone`, payload: { name: "Hands 2" } })).json();
    expect(clone.plan.cooks).toBe(2);
    expect(clone.tasks[0].handsOff).toBe(true);
  });
});
