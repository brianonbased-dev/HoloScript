/**
 * Whose likeness an avatar carries (Trust and Consent ruling on avatar_embodiment). One rule,
 * shared by the static checker (validation/LikenessCheck.ts, HS1011) and the runtime
 * (AvatarEmbodimentTrait), so the two layers cannot drift.
 *
 * The gate depends on whose likeness the avatar carries, not on who drives it:
 * - Real-person likeness traits on the avatar (@face_mesh, @voice_print, @body_scan) are gated by
 *   themselves, regardless of source.
 * - avatar_embodiment needs a render_likeness grant when it plays back or relays a real person's
 *   tracking (tracking_source playback / remote), or when the avatar carries a real person's
 *   likeness and is not driven by the user's own live capture (headset / camera).
 * - A synthetic, non-human-derived avatar is exempt for any other source, including ai, an
 *   omitted source and an unknown one.
 * - headset / camera need no grant; the runtime still requires a verified local capture handle
 *   before the avatar is shown to others.
 */

import { resolveTraitName } from '../validation/TraitName';

/** Traits that carry a real person's likeness (kept in step with LIKENESS_SOURCES). */
export const REAL_LIKENESS_TRAITS: readonly string[] = Object.freeze(['face_mesh', 'voice_print', 'body_scan']);

export const LIVE_TRACKING_SOURCES: readonly string[] = Object.freeze(['headset', 'camera']);
/** Sources that are, by definition, a real person's recorded or remote tracking. */
export const HUMAN_TRACKING_SOURCES: readonly string[] = Object.freeze(['playback', 'remote']);

/** Normalize a trait name the way the checker does (faceMesh, face-mesh, @face_mesh -> face_mesh). */
export function normalizeLikenessTrait(name: unknown): string {
  return String(name ?? '')
    .trim()
    .replace(/^@/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

/** Does this list of trait names include a real-person likeness trait? */
export function carriesRealLikeness(traitNames: Iterable<unknown>): boolean {
  for (const name of traitNames) {
    // Same folding as HS1006 / HS1011 (TraitName.resolveTraitName, which likenessTraitName uses):
    // @FaceMesh, @facemesh, @face__mesh and @FACE_MESH all carry a face likeness.
    if (resolveTraitName(name, REAL_LIKENESS_TRAITS) !== undefined) return true;
  }
  return false;
}

/** The shared decision: does this avatar_embodiment need a render_likeness grant? */
export function avatarEmbodimentNeedsGrant(trackingSource: unknown, carriesLikeness: boolean): boolean {
  const source = typeof trackingSource === 'string' ? trackingSource.trim().toLowerCase() : '';
  if (LIVE_TRACKING_SOURCES.includes(source)) return false;
  if (HUMAN_TRACKING_SOURCES.includes(source)) return true;
  return carriesLikeness;
}
