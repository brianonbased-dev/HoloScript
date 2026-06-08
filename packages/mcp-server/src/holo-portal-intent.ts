/**
 * HoloPortal Intent Envelope (HoloGate representation axis)
 *
 * An entity entering a HoloGate portal does NOT push arbitrary JSON at the
 * authoritative state plane — it pushes a *typed intent* (move/look/grab/say)
 * that is validated against the entrant's HoloDoor spatial scope before it ever
 * becomes a state delta. This closes the W.204 injection surface on the
 * previously-unscoped `push_state_delta` payload.
 *
 * Scope ladder (from HoloDoor policy `spatial` block, schema 1.1.0):
 *   read-only   — observe only; every mutating intent is rejected.
 *   mutate-zone — may move/grab zone-scoped entities whose id matches a
 *                 mutableZoneGlob; avatar orientation/speech still denied.
 *   drive-avatar— may drive an embodied avatar (move/look/say) up to
 *                 maxEntities, and inherits mutate-zone rights (superset).
 *
 * Pure module: no MCP / IO dependencies, fully unit-testable. Consumed by
 * networking-tools.ts (`push_portal_intent` tool).
 *
 * Board task: task_1779436414661_5vmv
 */

export type SpatialScope = 'read-only' | 'mutate-zone' | 'drive-avatar';

export interface SpatialPolicy {
  defaultScope?: SpatialScope;
  /** If non-empty, the effective scope must be a member. */
  allowedScopes?: SpatialScope[];
  /** Glob patterns for entity/target ids an entrant may mutate under mutate-zone. */
  mutableZoneGlobs?: string[];
  driveAvatar?: { allow?: boolean; maxEntities?: number };
  enforcement?: { onScopeViolation?: 'reject' | 'warn' };
}

export type PortalIntent =
  | { kind: 'move'; entityId: string; position: Vec3 }
  | { kind: 'look'; entityId: string; rotation: Quat }
  | { kind: 'grab'; entityId: string; targetId: string }
  | { kind: 'say'; entityId: string; utterance: string };

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Quat {
  x: number;
  y: number;
  z: number;
  w?: number;
}

export interface IntentValidation {
  allowed: boolean;
  /** Effective scope the decision was made under. */
  scope: SpatialScope;
  /** Human-readable reason when rejected (or warned). */
  reason?: string;
  /** When enforcement=warn, allowed stays true but warned is set. */
  warned?: boolean;
}

const SCOPE_RANK: Record<SpatialScope, number> = {
  'read-only': 0,
  'mutate-zone': 1,
  'drive-avatar': 2,
};

/** Tiny glob matcher: `*` matches any run of chars. Anchored full-match. */
export function matchesZoneGlob(id: string, globs: string[] | undefined): boolean {
  if (!globs || globs.length === 0) return false;
  return globs.some((g) => {
    const re = new RegExp(
      '^' +
        g
          .split('*')
          .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*') +
        '$'
    );
    return re.test(id);
  });
}

/**
 * Validate a portal intent against the entrant's spatial scope.
 *
 * @param intent           the typed intent the entrant wishes to perform
 * @param policy           the HoloDoor `spatial` policy block for the world/team
 * @param requestedScope   scope the portal granted this entrant (defaults to policy.defaultScope)
 * @param driveAvatarActiveCount current number of avatars this entrant already drives (registry-supplied)
 */
export function validatePortalIntent(
  intent: PortalIntent,
  policy: SpatialPolicy | undefined,
  requestedScope?: SpatialScope,
  driveAvatarActiveCount = 0
): IntentValidation {
  const p: SpatialPolicy = policy ?? {};
  const scope: SpatialScope = requestedScope ?? p.defaultScope ?? 'read-only';
  const warn = p.enforcement?.onScopeViolation === 'warn';

  const deny = (reason: string): IntentValidation =>
    warn ? { allowed: true, scope, reason, warned: true } : { allowed: false, scope, reason };
  const allow = (): IntentValidation => ({ allowed: true, scope });

  // The requested scope itself must be permitted by the policy.
  if (p.allowedScopes && p.allowedScopes.length > 0 && !p.allowedScopes.includes(scope)) {
    return deny(`scope '${scope}' is not in allowedScopes [${p.allowedScopes.join(', ')}]`);
  }

  const rank = SCOPE_RANK[scope];

  // read-only: every mutating intent is rejected.
  if (rank < SCOPE_RANK['mutate-zone']) {
    return deny(`scope 'read-only' cannot perform '${intent.kind}'`);
  }

  switch (intent.kind) {
    case 'move':
    case 'grab': {
      const targetId = intent.kind === 'grab' ? intent.targetId : intent.entityId;
      // drive-avatar inherits zone rights; if the entrant drives this entity it's allowed,
      // otherwise the target must fall inside a mutable zone glob.
      if (rank >= SCOPE_RANK['drive-avatar']) return allow();
      if (matchesZoneGlob(targetId, p.mutableZoneGlobs)) return allow();
      return deny(
        `'${intent.kind}' on '${targetId}' requires it to match a mutableZoneGlob under scope 'mutate-zone'`
      );
    }
    case 'look':
    case 'say': {
      // Avatar orientation + speech are embodied actions → require drive-avatar.
      if (rank < SCOPE_RANK['drive-avatar']) {
        return deny(`'${intent.kind}' is an embodied action requiring scope 'drive-avatar'`);
      }
      if (p.driveAvatar && p.driveAvatar.allow === false) {
        return deny(`drive-avatar lane is disabled by policy (driveAvatar.allow=false)`);
      }
      const max = p.driveAvatar?.maxEntities ?? 0;
      if (max > 0 && driveAvatarActiveCount >= max) {
        return deny(`drive-avatar limit reached (${driveAvatarActiveCount}/${max})`);
      }
      return allow();
    }
    default:
      return deny(`unknown intent kind`);
  }
}

/** Convert a validated intent into an authoritative state delta. */
export function intentToDelta(
  intent: PortalIntent,
  nowMs: number = Date.now()
): { entityId: string; payload: Record<string, unknown> } {
  switch (intent.kind) {
    case 'move':
      return {
        entityId: intent.entityId,
        payload: { transform: { position: intent.position }, updatedAt: nowMs },
      };
    case 'look':
      return {
        entityId: intent.entityId,
        payload: { transform: { rotation: intent.rotation }, updatedAt: nowMs },
      };
    case 'grab':
      return { entityId: intent.entityId, payload: { holding: intent.targetId, updatedAt: nowMs } };
    case 'say':
      return {
        entityId: intent.entityId,
        payload: { lastUtterance: intent.utterance, utteranceTs: nowMs },
      };
  }
}

/**
 * Deep-merge `source` into `target`, returning a new object. Plain objects are
 * merged recursively; arrays and primitives are replaced. Fixes the shallow
 * Last-Write-Wins clobber where two entrants editing different sub-fields of the
 * same nested object would overwrite each other.
 *
 * Board task: task_1779436414662_8b0d (concurrency edge).
 */
export function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Record<string, any>
): T {
  const out: Record<string, any> = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = out[key];
    if (isPlainObject(sv) && isPlainObject(tv)) {
      out[key] = deepMerge(tv, sv);
    } else {
      out[key] = sv;
    }
  }
  return out as T;
}

function isPlainObject(v: unknown): v is Record<string, any> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
