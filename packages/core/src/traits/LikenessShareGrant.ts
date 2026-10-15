/**
 * Sharing grant for live tracking and likeness (Trust and Consent, POLICY.md §3; Release).
 *
 * Live tracking data (pose, face, voice, body) and any real-person likeness may leave the device
 * only with the tracked person's own explicit share grant, even on a synthetic avatar:
 * - explicit opt-in only: there is no default grant, no auto-grant, and joining a session is not
 *   consent (nothing in this module is called on join);
 * - the grantor must be the tracked person;
 * - the grant is scoped to one session and one audience (a set of viewer ids) and is revocable;
 *   every broadcast re-checks it, so a revoke takes effect on the next frame;
 * - the .hs render_likeness rule must also have said yes (`renderLikenessYes`, supplied by the
 *   host from the consentRules evaluation); the grant alone is not enough;
 * - a node carrying a real-person likeness trait also needs its @consent_gate granted.
 * Without all of these, others get the generic avatar with generic motion (no live pose) and the
 * user still sees themselves in local self-preview.
 */
import { carriesRealLikeness, normalizeLikenessTrait } from './AvatarLikeness';

/** Traits whose state is a likeness or live tracking source; replicating them needs the check. */
export const LIKENESS_OR_TRACKING_TRAITS: readonly string[] = Object.freeze([
  'face_tracking',
  'body_tracking',
  'lip_sync',
  'lipsync',
  'face_mesh',
  'voice_print',
  'body_scan',
  'avatar_embodiment',
]);

export interface LikenessShareRequest {
  /** Who is granting. Must equal trackedPersonId. */
  grantorId: string;
  /** The person whose tracking / likeness this node carries. */
  trackedPersonId: string;
  sessionId: string;
  /** Viewer ids allowed to receive the stream. Must be non-empty. */
  audience: readonly string[];
  /** The .hs render_likeness rule's yes for this grant (host evaluates consentRules). */
  renderLikenessYes: boolean;
}

interface LikenessShareGrantRecord {
  trackedPersonId: string;
  sessionId: string;
  audience: ReadonlySet<string>;
  revoked: boolean;
}

export interface LikenessShareScope {
  sessionId?: string;
  /** Viewers this frame is sent to. Every one must be inside the granted audience. */
  audience?: readonly string[];
  /** The payload is live tracking (pose / face / voice / body). */
  livePose?: boolean;
}

const GRANTS = new WeakMap<object, LikenessShareGrantRecord>();

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

/**
 * Record the tracked person's explicit share grant. Returns false (and records nothing) when the
 * grantor is not the tracked person, the node is bound to a different tracked person, the scope is
 * empty, or the render_likeness rule did not say yes.
 */
export function grantLikenessShare(node: object, req: LikenessShareRequest): boolean {
  if (!node || !req) return false;
  if (!nonEmpty(req.grantorId) || !nonEmpty(req.trackedPersonId) || !nonEmpty(req.sessionId)) return false;
  if (req.grantorId !== req.trackedPersonId) return false;
  const bound = (node as { __trackedPersonId?: unknown }).__trackedPersonId;
  if (bound !== undefined && bound !== req.trackedPersonId) return false;
  if (req.renderLikenessYes !== true) return false;
  const audience = (req.audience ?? []).filter(nonEmpty);
  if (audience.length === 0) return false;
  GRANTS.set(node, {
    trackedPersonId: req.trackedPersonId,
    sessionId: req.sessionId,
    audience: new Set(audience),
    revoked: false,
  });
  return true;
}

/** Revoke the share grant. The next broadcast frame falls back to the generic avatar. */
export function revokeLikenessShare(node: object): void {
  const g = GRANTS.get(node);
  if (g) g.revoked = true;
  GRANTS.delete(node);
}

export function nodeTraitNames(node: object): string[] {
  const traits = (node as { traits?: unknown }).traits;
  if (traits instanceof Map) return [...traits.keys()].map(String);
  if (Array.isArray(traits)) return traits.map((t) => String((t as { name?: unknown })?.name ?? t));
  if (traits && typeof traits === 'object') return Object.keys(traits);
  return [];
}

/** Does this node carry a likeness or live tracking source (trait or runtime state)? */
export function carriesLikenessOrTracking(node: object, opts: { embodimentDecided?: boolean } = {}): boolean {
  const n = node as Record<string, unknown>;
  if (n.__faceTrackingState || n.__bodyTrackingState || n.__lip_sync_instance) return true;
  return nodeTraitNames(node).some((t) => {
    const name = normalizeLikenessTrait(t);
    // avatar_embodiment with runtime state is decided by that state (synthetic AI avatars stay
    // exempt); without state it fails closed like any other source.
    if (name === 'avatar_embodiment' && opts.embodimentDecided) return false;
    return LIKENESS_OR_TRACKING_TRAITS.includes(name);
  });
}

/** Is a live / likeness stream from this node allowed to reach exactly this session and audience? */
export function likenessShareAllowed(node: object, scope: LikenessShareScope | undefined): boolean {
  if (!scope || !nonEmpty(scope.sessionId)) return false;
  const g = GRANTS.get(node);
  if (!g || g.revoked || g.sessionId !== scope.sessionId) return false;
  const viewers = scope.audience ?? [];
  if (viewers.length === 0 || !viewers.every((v) => g.audience.has(v))) return false;
  const bound = (node as { __trackedPersonId?: unknown }).__trackedPersonId;
  if (bound !== undefined && bound !== g.trackedPersonId) return false;
  if (carriesRealLikeness(nodeTraitNames(node))) {
    const consent = (node as { __consentGateState?: { status?: string } }).__consentGateState;
    if (!consent || consent.status !== 'granted') return false;
  }
  return true;
}
