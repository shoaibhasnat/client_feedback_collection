// Strict validation for stored media paths (see migration 20261003000001_security_storage_paths.sql).
//
// A "starts with {workspace}/" check is NOT enough: storage clients resolve "." and ".." segments
// (also written as %2e%2e) before sending the request, so "{mine}/../{theirs}/x.webp" would address
// another workspace's file. Every path the app creates has this exact shape, so anything else is refused.

const PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/[A-Za-z0-9_-]+)*\/[A-Za-z0-9_-]+(\.[A-Za-z0-9]{1,10})?$/;

/**
 * True when `path` is a well-formed storage path that starts with `prefix` (a workspace id, or a
 * folder such as "{ws}/submissions/{id}/"). Use before any service-role read, sign or delete.
 */
export function isSafeStoragePath(path: unknown, prefix: string): path is string {
  if (typeof path !== "string" || !PATH_RE.test(path)) return false;
  const p = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return path.startsWith(p);
}

/** Shape check only (any workspace). For paths that already come from a workspace-scoped query. */
export function isWellFormedStoragePath(path: unknown): path is string {
  return typeof path === "string" && PATH_RE.test(path);
}
