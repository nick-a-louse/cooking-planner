import { useEffect, useState } from "react";

/** Current time, refreshed on an interval (default 10s) — the live-mode heartbeat. */
export function useNow(intervalMs = 10_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
