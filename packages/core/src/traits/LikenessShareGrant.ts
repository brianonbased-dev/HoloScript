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
import { carriesRealLikeness } from './AvatarLikeness';
import { likenessTraitName } from '../validation/LikenessCheck';

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
  // Fail closed (Release, like HS1011): a node with no bound tracked person matches no grant.
  const bound = (node as { __trackedPersonId?: unknown }).__trackedPersonId;
  if (!nonEmpty(bound) || bound !== req.trackedPersonId) return false;
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
    // likenessTraitName: the HS1006/HS1011 folding, so @FaceTracking, @facetracking, @LipSync… match.
    const name = likenessTraitName(t);
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
  if (!nonEmpty(bound) || bound !== g.trackedPersonId) return false;
  if (carriesRealLikeness(nodeTraitNames(node))) {
    const consent = (node as { __consentGateState?: { status?: string } }).__consentGateState;
    if (!consent || consent.status !== 'granted') return false;
  }
  return true;
}

// ─── Voice uses beyond live relay (Trust ruling, @collaborative voice) ───────────────────────────
/**
 * Live voice is relay-only. Each of these needs its own explicit grant from that speaker for the
 * session; live captions do not. voice_print additionally needs the render_likeness yes
 * (@consent_gate granted on the node), like any real-person likeness.
 */
export const VOICE_USES = Object.freeze(['record', 'store', 'transcribe', 'replay', 'ai', 'voice_print'] as const);
export type VoiceUse = (typeof VOICE_USES)[number] | 'live_captions';

export interface VoiceUseRequest {
  grantorId: string;
  speakerId: string;
  sessionId: string;
  use: VoiceUse;
}

const VOICE_USE_GRANTS = new WeakMap<object, Map<string, Set<VoiceUse>>>();

/** Record a speaker's explicit grant for one non-relay use. Grantor must be the speaker. */
export function grantVoiceUse(node: object, req: VoiceUseRequest): boolean {
  if (!node || !req || !nonEmpty(req.grantorId) || !nonEmpty(req.sessionId)) return false;
  if (req.grantorId !== req.speakerId) return false;
  const bound = (node as { __trackedPersonId?: unknown }).__trackedPersonId;
  if (!nonEmpty(bound) || bound !== req.speakerId) return false;
  if (!(VOICE_USES as readonly string[]).includes(req.use)) return false;
  const bySession = VOICE_USE_GRANTS.get(node) ?? new Map<string, Set<VoiceUse>>();
  const uses = bySession.get(req.sessionId) ?? new Set<VoiceUse>();
  uses.add(req.use);
  bySession.set(req.sessionId, uses);
  VOICE_USE_GRANTS.set(node, bySession);
  return true;
}

export function revokeVoiceUse(node: object, sessionId?: string, use?: VoiceUse): void {
  const bySession = VOICE_USE_GRANTS.get(node);
  if (!bySession) return;
  if (!sessionId) return void VOICE_USE_GRANTS.delete(node);
  if (!use) return void bySession.delete(sessionId);
  bySession.get(sessionId)?.delete(use);
}

/** May this speaker's voice be used this way in this session? Live captions need no extra grant. */
export function voiceUseAllowed(node: object, sessionId: unknown, use: VoiceUse): boolean {
  if (use === 'live_captions') return true;
  if (!nonEmpty(sessionId)) return false;
  if (!nonEmpty((node as { __trackedPersonId?: unknown }).__trackedPersonId)) return false;
  if (!VOICE_USE_GRANTS.get(node)?.get(sessionId)?.has(use)) return false;
  if (use === 'voice_print') {
    const consent = (node as { __consentGateState?: { status?: string } }).__consentGateState;
    if (!consent || consent.status !== 'granted') return false;
  }
  return true;
}
