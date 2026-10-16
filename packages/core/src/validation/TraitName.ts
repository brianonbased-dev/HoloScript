/**
 * The one trait-name folding, shared by the known-trait check (KnownTraits.ts, HS1006) and the
 * likeness check (LikenessCheck.ts, HS1011), and handed to the strict layer through
 * `@holoscript/core/parser`. If the two checks folded names differently, a spelling one check
 * accepts as known could slip past the other; so both use these functions.
 *
 * `@FaceMesh`, `face-mesh`, `face_Mesh`, `FACE_MESH`, `facemesh` and `face__mesh` all fold to
 * the same key.
 */

/** `@camelCase`, `kebab-case` and `snake_case` all compare as snake_case. */
export function normalizeTraitName(name: unknown): string {
  return String(name ?? '')
    .trim()
    .replace(/^@/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

/** The comparison key: normalized, then every underscore dropped. */
export function traitNameKey(name: unknown): string {
  return normalizeTraitName(name).replace(/_/g, '');
}

/**
 * The entry of `table` that `name` is a spelling of (as written in `table`), or undefined.
 * An entry equal after normalizeTraitName wins; otherwise the first entry with the same key.
 * (lip_sync and lipsync share a key: `@lipsync`/`@LIPSYNC` stay lipsync, `@LipSync` is lip_sync;
 * both are gated, so a tie can only change which live source exempts it, never whether it is gated.)
 */
export function resolveTraitName(name: unknown, table: Iterable<string>): string | undefined {
  const normalized = normalizeTraitName(name);
  const key = normalized.replace(/_/g, '');
  if (!key) return undefined;
  const entries = [...table];
  return (
    entries.find((entry) => normalizeTraitName(entry) === normalized) ??
    entries.find((entry) => traitNameKey(entry) === key)
  );
}
