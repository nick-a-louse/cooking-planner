/** Release number of this app. Bump it when releasing; the build adds the git sha. */
export const RELEASE = "1.1.0";

/**
 * What the footer, /healthz and the build_info metric show.
 * `build` is the image's APP_VERSION: empty or "dev" locally, "sha-<commit>" from main/master,
 * or "v1.2.0" from a git tag.
 */
export function displayVersion(build?: string | null): string {
  const b = (build ?? "").trim();
  if (!b || b === "dev" || b.replace(/^v/, "") === RELEASE) return b === "dev" ? `${RELEASE} (dev)` : RELEASE;
  if (b.startsWith("sha-")) return `${RELEASE} (${b.slice(0, 11)})`;
  return b.replace(/^v/, "");
}
