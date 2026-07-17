import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { planRoutes } from "./routes/plans.js";

const app = Fastify({ logger: true });

planRoutes(app);

app.get("/api/health", () => ({ ok: true }));

// In production the built SPA sits next to the server; in dev Vite serves the client.
const clientDist = resolve(process.env.CLIENT_DIST ?? "../client/dist");
if (existsSync(clientDist)) {
  await app.register(fastifyStatic, { root: clientDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/")) return reply.code(404).send({ error: "not found" });
    return reply.sendFile("index.html");
  });
}

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host: "0.0.0.0" });
