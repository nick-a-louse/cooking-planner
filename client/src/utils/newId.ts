/**
 * A random id for a new task or group.
 *
 * crypto.randomUUID() only exists on HTTPS or localhost, so on a home network
 * (http://192.168.x.x) it's missing and adding a task failed. crypto.getRandomValues()
 * works everywhere, so build the same kind of id (a version 4 UUID) from it.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 1
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
