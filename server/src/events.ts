// Live sync: each open plan screen keeps a server-sent-events stream open, and every
// save or delete is pushed to all of them. Plain SSE over the existing HTTP port, so it
// needs no extra service, and browsers reconnect on their own after a drop.
import type { ServerResponse } from "node:http";

const streams = new Map<string, Set<ServerResponse>>();

/** How often an idle stream gets a comment line, so proxies and phones don't drop it. */
const HEARTBEAT_MS = 25_000;

export function openStream(planId: string, res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no", // in case it's ever put behind nginx
  });
  // Tell the browser to retry after 3 s if the connection drops.
  res.write("retry: 3000\n\n");
  let set = streams.get(planId);
  if (!set) streams.set(planId, (set = new Set()));
  set.add(res);
  const beat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS);
  res.on("close", () => {
    clearInterval(beat);
    set!.delete(res);
    if (set!.size === 0) streams.delete(planId);
  });
}

/** Send an event to every screen that has this plan open. */
export function publish(planId: string, event: "plan" | "deleted", data: unknown): void {
  const set = streams.get(planId);
  if (!set) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(msg);
}

/** Number of open streams, for /metrics. */
export function streamCount(): number {
  let n = 0;
  for (const set of streams.values()) n += set.size;
  return n;
}

/** End every stream (on shutdown, so the server can close promptly). */
export function closeAllStreams(): void {
  for (const set of streams.values()) for (const res of set) res.end();
  streams.clear();
}
