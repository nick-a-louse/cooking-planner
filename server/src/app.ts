import Fastify, { LogController, type FastifyError, type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { displayVersion } from "@cookplan/shared";
import { db } from "./db.js";
import { planRoutes } from "./routes/plans.js";
import { closeAllStreams, streamCount } from "./events.js";

export const VERSION = displayVersion(process.env.APP_VERSION);

/** Save counters for /metrics (since the container started). */
const saves = { ok: 0, error: 0, lastOk: true };

function stats() {
  const counts = db
    .prepare("SELECT SUM(is_template = 0) AS plans, SUM(is_template = 1) AS templates, MAX(updated_at) AS last FROM plans")
    .get() as { plans: number | null; templates: number | null; last: string | null };
  return { plans: counts.plans ?? 0, templates: counts.templates ?? 0, lastSave: counts.last };
}

export async function buildApp(opts: { clientDist?: string } = {}): Promise<FastifyInstance> {
  // One log line per event, not per request (my app standard).
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    logController: new LogController({ disableRequestLogging: true }),
  });

  // Count plan saves (the full-document PUT) for the metrics.
  app.addHook("onResponse", async (req, reply) => {
    if (req.method !== "PUT" || req.routeOptions.url !== "/api/plans/:id") return;
    // 409 means "changed on another device" or "name taken": the app handles it, the save didn't fail.
    const ok = reply.statusCode < 400 || reply.statusCode === 409;
    saves[ok ? "ok" : "error"] += 1;
    saves.lastOk = ok;
    if (!ok) req.log.warn({ status: reply.statusCode, url: req.url }, "plan save failed");
  });

  // Accept an empty body sent as JSON (Fastify's default parser answers 400). Older
  // copies of the client labelled every request as JSON, including body-less DELETEs.
  // Everything non-empty still goes through Fastify's own hardened JSON parser.
  const jsonParser = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    if ((body as string).trim() === "") return done(null, undefined);
    jsonParser(req, body as string, done);
  });

  // Every error goes back as { error: "<what's wrong>" }, which is what the client shows.
  // Fastify's own 4xx errors (e.g. schema validation) would otherwise say only "Bad Request".
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) {
      req.log.error({ err, url: req.url }, "request failed");
      return reply.code(status).send({ error: "Something went wrong on the server. Check the container log." });
    }
    const message = err.validation ? `Invalid request: ${err.message}` : err.message;
    return reply.code(status).send({ error: message });
  });

  planRoutes(app);
  // Open live-sync streams would otherwise hold the server open on shutdown.
  app.addHook("preClose", async () => closeAllStreams());

  // Kept for anything still using the old path; /healthz is the standard one.
  app.get("/api/health", () => ({ ok: true }));

  // Healthy = the database answers. There is no schedule, so nothing can go stale.
  app.get("/healthz", (_req, reply) => {
    try {
      const s = stats();
      return { ok: true, version: VERSION, plans: s.plans, templates: s.templates, last_save: s.lastSave };
    } catch (e) {
      return reply.code(503).send({ ok: false, version: VERSION, error: (e as Error).message });
    }
  });

  app.get("/metrics", (_req, reply) => {
    const s = stats();
    const last = s.lastSave ? Date.parse(s.lastSave) / 1000 : 0;
    const lines = [
      "# HELP cooking_planner_build_info Version of the running app.",
      "# TYPE cooking_planner_build_info gauge",
      `cooking_planner_build_info{version="${VERSION.replace(/"/g, "")}"} 1`,
      "# HELP cooking_planner_last_success_timestamp_seconds Time of the most recent change to any plan (last successful save).",
      "# TYPE cooking_planner_last_success_timestamp_seconds gauge",
      `cooking_planner_last_success_timestamp_seconds ${last}`,
      "# HELP cooking_planner_last_attempt_ok 1 if the last plan save worked, 0 if it failed.",
      "# TYPE cooking_planner_last_attempt_ok gauge",
      `cooking_planner_last_attempt_ok ${saves.lastOk ? 1 : 0}`,
      "# HELP cooking_planner_saves_total Plan saves since the app started, by result.",
      "# TYPE cooking_planner_saves_total counter",
      `cooking_planner_saves_total{result="ok"} ${saves.ok}`,
      `cooking_planner_saves_total{result="error"} ${saves.error}`,
      "# HELP cooking_planner_plans Saved plans and templates.",
      "# TYPE cooking_planner_plans gauge",
      `cooking_planner_plans{kind="plan"} ${s.plans}`,
      `cooking_planner_plans{kind="template"} ${s.templates}`,
      "# HELP cooking_planner_live_streams Plan screens currently connected for live sync.",
      "# TYPE cooking_planner_live_streams gauge",
      `cooking_planner_live_streams ${streamCount()}`,
    ];
    reply.type("text/plain; version=0.0.4").send(lines.join("\n") + "\n");
  });

  // In production the built SPA sits next to the server; in dev Vite serves the client.
  const clientDist = resolve(opts.clientDist ?? process.env.CLIENT_DIST ?? "../client/dist");
  if (existsSync(clientDist)) {
    await app.register(fastifyStatic, {
      root: clientDist,
      setHeaders: (res, path) => {
        if (path.endsWith(".webmanifest")) res.setHeader("content-type", "application/manifest+json");
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}
