/**
 * PortalPresenceTrait -- v1.0
 *
 * Marks a world or zone as portal-enterable and declares the spatial scopes
 * an entrant may hold. Composes with AgentPortalTrait (cross-scene messaging)
 * and security/tool-scopes (spatial permission gating).
 *
 * Per D.040: one shared trait library across HoloMesh / HoloLand NPCs / uaa2.
 * Per W.701: HoloTunnel agent-portal is dual-REPRESENTATION; @portalPresence
 * is the runtime surface that advertises enterability + scopes at the threshold.
 *
 * Spatial scopes (read-only < mutate-zone < drive-avatar):
 *   read-only    -- entrant observes scene graph + trait state, cannot push deltas
 *   mutate-zone  -- entrant may push state deltas within declared zones
 *   drive-avatar -- entrant may push intent for avatar movement/look/grab/say
 *
 * Events:
 *   portal_presence:registered    { worldId, zoneId, scopes }
 *   portal_presence:entrant_arrived   { entrantId, scopes, representation }
 *   portal_presence:entrant_departed  { entrantId, reason }
 *   portal_presence:scope_violation   { entrantId, attemptedScope, allowedScopes }
 *   portal_presence:threshold_handshake { entrantId, agentCardPresent }
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
import { extractPayload } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

/** Spatial scope levels — ordered by privilege escalation */
export type SpatialScope = 'read-only' | 'mutate-zone' | 'drive-avatar';

/** Representation mode negotiated at the portal threshold */
export type PortalRepresentation = 'semantic' | 'rendered' | 'dual';

/** An entrant that has passed through the portal threshold */
export interface PortalEntrant {
  /** Unique entrant identifier (agentId or userId) */
  entrantId: string;
  /** Display name */
  name: string;
  /** Granted spatial scopes */
  scopes: SpatialScope[];
  /** Representation mode negotiated at entry */
  representation: PortalRepresentation;
  /** Whether A2A Agent Card was present at threshold */
  agentCardPresent: boolean;
  /** Entry timestamp */
  enteredAt: number;
  /** Zone IDs the entrant is admitted to (empty = all zones) */
  admittedZones: string[];
}

/** Threshold handshake result (recorded for audit / receipt chain) */
export interface ThresholdHandshake {
  entrantId: string;
  agentCardPresent: boolean;
  representation: PortalRepresentation;
  scopes: SpatialScope[];
  timestamp: number;
  worldStateHashEntry: string;
}

// =============================================================================
// CONFIG & STATE
// =============================================================================

export interface PortalPresenceConfig {
  /** World or zone identifier that this portal guards */
  world_id: string;
  /** Zone identifier (empty = world-level portal) */
  zone_id: string;
  /** Default scopes granted to new entrants */
  default_scopes: SpatialScope[];
  /** Maximum scopes that can be granted (cannot exceed at runtime) */
  max_scopes: SpatialScope[];
  /** Whether the portal is currently accepting entrants */
  open: boolean;
  /** Maximum concurrent entrants (0 = unlimited) */
  max_entrants: number;
  /** Require A2A Agent Card for semantic/dual representation */
  require_agent_card: boolean;
  /** Representation mode for new entrants without explicit negotiation */
  default_representation: PortalRepresentation;
  /** Auto-expel entrants after this many ms of inactivity (0 = never) */
  inactivity_timeout_ms: number;
  /** Validate pushed state deltas against entrant scopes before accepting */
  validate_deltas: boolean;
  /** Record threshold handshakes for audit receipt chain */
  record_handshakes: boolean;
  /** Maximum handshake records to keep (ring buffer) */
  max_handshake_records: number;
}

export interface PortalPresenceState {
  /** Whether the portal is currently open */
  isOpen: boolean;
  /** Current entrants indexed by entrantId */
  entrants: Map<string, PortalEntrant>;
  /** Threshold handshake log for audit */
  handshakeLog: ThresholdHandshake[];
  /** Total entrants ever admitted (lifetime counter) */
  totalAdmitted: number;
  /** Total entrants departed */
  totalDeparted: number;
  /** Total scope violations detected */
  totalViolations: number;
  /** World state hash at last entrant entry (for receipt chain) */
  lastEntryStateHash: string;
}

// =============================================================================
// HELPERS
// =============================================================================

const SCOPE_PRECEDENCE: Record<SpatialScope, number> = {
  'read-only': 0,
  'mutate-zone': 1,
  'drive-avatar': 2,
};

function scopeLevel(scope: SpatialScope): number {
  return SCOPE_PRECEDENCE[scope] ?? -1;
}

function isScopeAllowed(attempted: SpatialScope, allowed: SpatialScope[]): boolean {
  const maxAllowed = Math.max(...allowed.map(scopeLevel), -1);
  return scopeLevel(attempted) <= maxAllowed;
}

function validateScopes(requested: SpatialScope[], max: SpatialScope[]): SpatialScope[] {
  return requested.filter((s) => isScopeAllowed(s, max));
}

// =============================================================================
// HANDLER
// =============================================================================

export const portalPresenceHandler: TraitHandler<PortalPresenceConfig> = {
  name: 'portal_presence',

  defaultConfig: {
    world_id: '',
    zone_id: '',
    default_scopes: ['read-only'],
    max_scopes: ['read-only', 'mutate-zone', 'drive-avatar'],
    open: true,
    max_entrants: 0,
    require_agent_card: false,
    default_representation: 'dual',
    inactivity_timeout_ms: 0,
    validate_deltas: true,
    record_handshakes: true,
    max_handshake_records: 100,
  },

  // ===========================================================================
  // onAttach -- initialize portal presence state
  // ===========================================================================
  onAttach(node: HSPlusNode, config: PortalPresenceConfig, context: TraitContext): void {
    const state: PortalPresenceState = {
      isOpen: config.open,
      entrants: new Map(),
      handshakeLog: [],
      totalAdmitted: 0,
      totalDeparted: 0,
      totalViolations: 0,
      lastEntryStateHash: '',
    };

    node.__portalPresenceState = state;

    context.emit?.('portal_presence:registered', {
      worldId: config.world_id,
      zoneId: config.zone_id,
      scopes: config.default_scopes,
    });
  },

  // ===========================================================================
  // onDetach -- close portal and expel all entrants
  // ===========================================================================
  onDetach(node: HSPlusNode, config: PortalPresenceConfig, context: TraitContext): void {
    const state = node.__portalPresenceState as PortalPresenceState | undefined;
    if (!state) return;

    // Expel all current entrants
    for (const [entrantId, entrant] of state.entrants) {
      context.emit?.('portal_presence:entrant_departed', {
        entrantId,
        name: entrant.name,
        reason: 'portal_detached',
      });
      state.totalDeparted++;
    }

    state.entrants.clear();
    state.isOpen = false;
    state.handshakeLog = [];

    context.emit?.('portal_presence:unregistered', {
      worldId: config.world_id,
      zoneId: config.zone_id,
    });

    delete node.__portalPresenceState;
  },

  // ===========================================================================
  // onUpdate -- inactivity timeout, heartbeat
  // ===========================================================================
  onUpdate(
    node: HSPlusNode,
    config: PortalPresenceConfig,
    context: TraitContext,
    delta: number
  ): void {
    const state = node.__portalPresenceState as PortalPresenceState | undefined;
    if (!state) return;

    // Inactivity timeout
    if (config.inactivity_timeout_ms > 0) {
      const now = Date.now();
      const toExpel: string[] = [];

      for (const [entrantId, entrant] of state.entrants) {
        if (now - entrant.enteredAt > config.inactivity_timeout_ms) {
          toExpel.push(entrantId);
        }
      }

      for (const entrantId of toExpel) {
        const entrant = state.entrants.get(entrantId);
        if (entrant) {
          state.entrants.delete(entrantId);
          state.totalDeparted++;
          context.emit?.('portal_presence:entrant_departed', {
            entrantId,
            name: entrant.name,
            reason: 'inactivity_timeout',
          });
        }
      }
    }
  },

  // ===========================================================================
  // onEvent -- handle portal presence events
  // ===========================================================================
  onEvent(
    node: HSPlusNode,
    config: PortalPresenceConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__portalPresenceState as PortalPresenceState | undefined;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = extractPayload(event);

    switch (eventType) {
      // ─── Portal open / close ─────────────────────────────────────────
      case 'portal_presence:open': {
        state.isOpen = true;
        context.emit?.('portal_presence:state_change', {
          worldId: config.world_id,
          zoneId: config.zone_id,
          isOpen: true,
        });
        break;
      }

      case 'portal_presence:close': {
        state.isOpen = false;
        context.emit?.('portal_presence:state_change', {
          worldId: config.world_id,
          zoneId: config.zone_id,
          isOpen: false,
        });
        break;
      }

      // ─── Threshold handshake (entrant requests entry) ────────────────
      case 'portal_presence:request_entry': {
        if (!state.isOpen) {
          context.emit?.('portal_presence:entry_rejected', {
            entrantId: String(payload.entrantId ?? ''),
            reason: 'portal_closed',
          });
          break;
        }

        const entrantId = String(payload.entrantId ?? '');
        if (!entrantId) {
          context.emit?.('portal_presence:entry_rejected', {
            entrantId: '',
            reason: 'missing_entrant_id',
          });
          break;
        }

        // Check entrant capacity
        if (config.max_entrants > 0 && state.entrants.size >= config.max_entrants) {
          context.emit?.('portal_presence:entry_rejected', {
            entrantId,
            reason: 'capacity_reached',
          });
          break;
        }

        // Prevent duplicate entry
        if (state.entrants.has(entrantId)) {
          context.emit?.('portal_presence:entry_rejected', {
            entrantId,
            reason: 'already_present',
          });
          break;
        }

        const agentCardPresent = Boolean(payload.agentCardPresent);
        const requestedScopes = Array.isArray(payload.scopes)
          ? payload.scopes
          : config.default_scopes;
        const requestedRepresentation =
          (payload.representation as PortalRepresentation) ?? config.default_representation;

        // Require agent card for semantic/dual representation
        if (
          config.require_agent_card &&
          !agentCardPresent &&
          requestedRepresentation !== 'rendered'
        ) {
          context.emit?.('portal_presence:entry_rejected', {
            entrantId,
            reason: 'agent_card_required',
          });
          break;
        }

        // Validate requested scopes against max_scopes
        const grantedScopes = validateScopes(
          requestedScopes as SpatialScope[],
          config.max_scopes as SpatialScope[]
        );
        if (grantedScopes.length === 0) {
          grantedScopes.push('read-only'); // At minimum, read-only is always available
        }

        // Determine representation
        let representation = requestedRepresentation;
        if (!agentCardPresent && representation === 'semantic') {
          // Without agent card, downgrade semantic to rendered
          representation = 'rendered';
        }

        const admittedZones = Array.isArray(payload.admittedZones) ? payload.admittedZones : [];

        const entrant: PortalEntrant = {
          entrantId,
          name: String(payload.name ?? entrantId),
          scopes: grantedScopes,
          representation,
          agentCardPresent,
          enteredAt: Date.now(),
          admittedZones,
        };

        state.entrants.set(entrantId, entrant);
        state.totalAdmitted++;

        // Record handshake
        if (config.record_handshakes) {
          const handshake: ThresholdHandshake = {
            entrantId,
            agentCardPresent,
            representation,
            scopes: grantedScopes,
            timestamp: entrant.enteredAt,
            worldStateHashEntry: state.lastEntryStateHash,
          };

          state.handshakeLog.push(handshake);
          // Ring buffer eviction
          while (state.handshakeLog.length > config.max_handshake_records) {
            state.handshakeLog.shift();
          }
        }

        context.emit?.('portal_presence:entrant_arrived', {
          entrantId,
          name: entrant.name,
          scopes: grantedScopes,
          representation,
          agentCardPresent,
        });

        context.emit?.('portal_presence:threshold_handshake', {
          entrantId,
          agentCardPresent,
          representation,
          scopes: grantedScopes,
        });
        break;
      }

      // ─── Entrant departure ───────────────────────────────────────────
      case 'portal_presence:depart': {
        const depId = String(payload.entrantId ?? '');
        const entrant = state.entrants.get(depId);
        if (!entrant) break;

        state.entrants.delete(depId);
        state.totalDeparted++;

        context.emit?.('portal_presence:entrant_departed', {
          entrantId: depId,
          name: entrant.name,
          reason: String(payload.reason ?? 'voluntary'),
        });
        break;
      }

      // ─── Scope validation for pushed state deltas ─────────────────────
      case 'portal_presence:validate_delta': {
        if (!config.validate_deltas) {
          context.emit?.('portal_presence:delta_result', {
            entrantId: String(payload.entrantId ?? ''),
            allowed: true,
          });
          break;
        }

        const deltaEntrantId = String(payload.entrantId ?? '');
        const deltaEntrant = state.entrants.get(deltaEntrantId);
        const requiredScope = (payload.requiredScope as SpatialScope) ?? 'mutate-zone';

        if (!deltaEntrant) {
          context.emit?.('portal_presence:delta_result', {
            entrantId: deltaEntrantId,
            allowed: false,
            reason: 'entrant_not_found',
          });
          break;
        }

        // Check zone admission if specified
        const deltaZone = String(payload.zone ?? '');
        if (
          deltaZone &&
          deltaEntrant.admittedZones.length > 0 &&
          !deltaEntrant.admittedZones.includes(deltaZone)
        ) {
          state.totalViolations++;
          context.emit?.('portal_presence:scope_violation', {
            entrantId: deltaEntrantId,
            attemptedScope: requiredScope,
            allowedScopes: deltaEntrant.scopes,
            reason: 'zone_not_admitted',
          });
          context.emit?.('portal_presence:delta_result', {
            entrantId: deltaEntrantId,
            allowed: false,
            reason: 'zone_not_admitted',
          });
          break;
        }

        if (!isScopeAllowed(requiredScope, deltaEntrant.scopes)) {
          state.totalViolations++;
          context.emit?.('portal_presence:scope_violation', {
            entrantId: deltaEntrantId,
            attemptedScope: requiredScope,
            allowedScopes: deltaEntrant.scopes,
          });
          context.emit?.('portal_presence:delta_result', {
            entrantId: deltaEntrantId,
            allowed: false,
            reason: 'scope_exceeded',
          });
          break;
        }

        context.emit?.('portal_presence:delta_result', {
          entrantId: deltaEntrantId,
          allowed: true,
        });
        break;
      }

      // ─── Query portal status ─────────────────────────────────────────
      case 'portal_presence:get_status': {
        context.emit?.('portal_presence:status', {
          worldId: config.world_id,
          zoneId: config.zone_id,
          isOpen: state.isOpen,
          entrantCount: state.entrants.size,
          totalAdmitted: state.totalAdmitted,
          totalDeparted: state.totalDeparted,
          totalViolations: state.totalViolations,
          handshakeLogSize: state.handshakeLog.length,
        });
        break;
      }

      // ─── Update entrant scopes at runtime ─────────────────────────────
      case 'portal_presence:update_scopes': {
        const updateId = String(payload.entrantId ?? '');
        const updateEntrant = state.entrants.get(updateId);
        if (!updateEntrant) break;

        const newScopes = validateScopes(
          (payload.scopes as SpatialScope[]) ?? [],
          config.max_scopes as SpatialScope[]
        );
        if (newScopes.length > 0) {
          updateEntrant.scopes = newScopes;
          context.emit?.('portal_presence:scopes_updated', {
            entrantId: updateId,
            scopes: newScopes,
          });
        }
        break;
      }

      // ─── Expel an entrant by authority ─────────────────────────────────
      case 'portal_presence:expel': {
        const expelId = String(payload.entrantId ?? '');
        const expelEntrant = state.entrants.get(expelId);
        if (!expelEntrant) break;

        state.entrants.delete(expelId);
        state.totalDeparted++;

        context.emit?.('portal_presence:entrant_departed', {
          entrantId: expelId,
          name: expelEntrant.name,
          reason: String(payload.reason ?? 'expelled'),
        });
        break;
      }
    }
  },
};

export default portalPresenceHandler;
