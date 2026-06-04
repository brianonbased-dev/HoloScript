/**
 * Owner-scoped storage keys for scene versions & snapshots.
 *
 * SECURITY (task_1780469216849_kd86): `scene_versions` and `scene_snapshots`
 * key on a free-text `project_id` column with NO `owner_id` column. Before this
 * change, that column held the raw client-supplied sceneId (e.g. "scene-1",
 * "default"), so every authenticated user shared one global bucket per sceneId —
 * any user could read or modify any other user's scene history. This was the
 * first-production-login canary finding.
 *
 * The fix mirrors the requireAuth + owner-scoping template established for
 * /api/projects (commit c3851dcce): every read and write is scoped to the
 * authenticated user. Because these tables have no ownerId column (and the
 * sceneId itself is not a project FK — see callers, which pass literal
 * "scene-1"/"default"), we namespace the existing `project_id` text key by the
 * caller's user id. A second user querying the same sceneId resolves to a
 * different storage key and therefore sees none of the first user's data
 * (empty list / 404), satisfying the cross-user isolation requirement without a
 * schema migration or backfill.
 *
 * Format: `${userId}::${sceneId}`. The `::` separator cannot appear in a uuid
 * userId, so the namespace boundary is unambiguous. Responses re-expose the
 * bare sceneId to the client via `unscopeSceneId`, so the owner prefix is an
 * internal storage detail the client never sees.
 */

const SCOPE_SEPARATOR = '::';

/**
 * Build the owner-scoped storage key for a (userId, sceneId) pair.
 * This is the value persisted to / queried from `project_id`.
 */
export function scopedSceneKey(userId: string, sceneId: string): string {
  return `${userId}${SCOPE_SEPARATOR}${sceneId}`;
}

/**
 * Recover the bare client-facing sceneId from a stored owner-scoped key.
 * Rows written before this change (or by other paths) may carry an
 * un-prefixed key; in that case the value is returned unchanged so legacy
 * rows still render their own sceneId rather than a corrupted one.
 */
export function unscopeSceneId(storedProjectId: string, userId: string): string {
  const prefix = ownerScopePrefix(userId);
  return storedProjectId.startsWith(prefix)
    ? storedProjectId.slice(prefix.length)
    : storedProjectId;
}

/**
 * The `${userId}::` prefix that begins every owner-scoped storage key for this
 * user. Used to match all of a user's scene buckets (e.g. for a scoped DELETE
 * keyed only by row id, where the sceneId is unknown).
 */
export function ownerScopePrefix(userId: string): string {
  return `${userId}${SCOPE_SEPARATOR}`;
}

/**
 * Escape SQL-LIKE metacharacters (`%`, `_`, and the escape char itself) so a
 * value can be embedded as a literal prefix in a `like(col, escaped + '%')`
 * predicate. Drizzle/Postgres treats `\` as the default LIKE escape character.
 * userIds are uuids today (no metachars), but escaping keeps the prefix match
 * exact even if the id format ever changes.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
