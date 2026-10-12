import { buildApp, VERSION } from "./app.js";

const app = await buildApp();
const port = Number(process.env.PORT ?? 8000);
await app.listen({ port, host: "0.0.0.0" });
app.log.info(`Cooking Planner v${VERSION} serving on port ${port}`);
