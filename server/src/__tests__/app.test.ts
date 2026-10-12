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

  it("serves the page for app routes, JSON 404 for unknown API paths, and the manifest type", async () => {
    expect((await app.inject("/some/page")).body).toContain("gomez-ui.css");
    expect((await app.inject("/api/nope")).statusCode).toBe(404);
    expect((await app.inject("/static/manifest.webmanifest")).headers["content-type"]).toContain("application/manifest+json");
  });
});
