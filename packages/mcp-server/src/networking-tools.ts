import { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  validatePortalIntent,
  intentToDelta,
  deepMerge,
  type PortalIntent,
  type SpatialPolicy,
  type SpatialScope,
} from './holo-portal-intent.js';

const HOLO_DIR = process.env.HOLOSCRIPT_CACHE_DIR || path.join(os.homedir(), '.holoscript');
const STATE_AUTHORITY_FILE = path.join(HOLO_DIR, 'state-authority.json');

// ---------------------------------------------------------------------------
// Persistent in-process authority cache (backed by disk)
// ---------------------------------------------------------------------------
function loadStateFromDisk(): Record<string, any> {
  try {
    if (fs.existsSync(STATE_AUTHORITY_FILE)) {
      const raw = fs.readFileSync(STATE_AUTHORITY_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return parsed;
    }
  } catch {
    // Corrupt file — start fresh
    console.warn(
      `[CacheDebug][networking] load miss path=${STATE_AUTHORITY_FILE} reason=parse-or-io-error`
    );
  }
  return {};
}

function saveStateToDisk(state: Record<string, any>): void {
  try {
    if (!fs.existsSync(HOLO_DIR)) {
      fs.mkdirSync(HOLO_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_AUTHORITY_FILE, JSON.stringify(state), 'utf-8');
  } catch {
    // Best-effort
    console.warn(`[CacheDebug][networking] save miss path=${STATE_AUTHORITY_FILE}`);
  }
}

// In-memory authority cache simulating a backend database — loaded from disk on startup
const globalStateAuthority: Record<string, any> = loadStateFromDisk();

// ---------------------------------------------------------------------------
// Minimal inline implementations — the core/src/networking/ module was never
// built, so we self-contain the logic here.
// ---------------------------------------------------------------------------

/** Compute field-level deltas between two plain objects */
function computeDeltas(
  entityId: string,
  oldState: Record<string, unknown>,
  newState: Record<string, unknown>
): Array<{ entityId: string; field: string; oldValue: unknown; newValue: unknown }> {
  const deltas = [];
  for (const key of Object.keys(newState)) {
    if (oldState[key] !== newState[key]) {
      deltas.push({ entityId, field: key, oldValue: oldState[key], newValue: newState[key] });
    }
  }
  return deltas;
}

// ---------------------------------------------------------------------------
// Delta broadcast — real subscriber-registry fan-out (replaces the prior no-op).
// The MCP tool layer owns the *registry*, not the socket: a WS/WebRTC relay (or
// the HoloTunnel runtime) registers a subscriber via subscribeToStateDeltas and
// pushes the deltas to co-present entities. This is the build-internal WS
// fan-out seam (WebRTC peer transport is a later perf upgrade).
// Board task: task_1779436414662_8b0d (transport edge).
// ---------------------------------------------------------------------------
type StateDelta = ReturnType<typeof computeDeltas>[number];
type DeltaSubscriber = (deltas: StateDelta[]) => void;
const deltaSubscribers = new Set<DeltaSubscriber>();

/** Register a subscriber that receives every committed delta batch. Returns an unsubscribe fn. */
export function subscribeToStateDeltas(fn: DeltaSubscriber): () => void {
  deltaSubscribers.add(fn);
  return () => deltaSubscribers.delete(fn);
}

/** For tests: number of currently registered subscribers. */
export function __stateDeltaSubscriberCount(): number {
  return deltaSubscribers.size;
}

function broadcastDeltas(deltas: StateDelta[]): void {
  if (deltas.length === 0) return;
  for (const sub of deltaSubscribers) {
    // One bad subscriber must not stall the fan-out to the others.
    try {
      sub(deltas);
    } catch (err) {
      console.warn(`[networking] delta subscriber threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

/**
 * Commit a payload into the authoritative state via deep-merge, persist, and
 * broadcast the resulting deltas. Shared by push_state_delta and
 * push_portal_intent. Deep-merge (not shallow spread) so two entrants editing
 * different sub-fields of the same nested object no longer clobber each other.
 */
function commitState(entityId: string, payload: Record<string, unknown>): {
  status: 'success' | 'skipped';
  deltaCount: number;
} {
  const oldState = globalStateAuthority[entityId] || {};
  const newState = deepMerge(oldState as Record<string, unknown>, payload);
  const deltas = computeDeltas(entityId, oldState, newState);
  if (deltas.length === 0) return { status: 'skipped', deltaCount: 0 };
  globalStateAuthority[entityId] = newState;
  saveStateToDisk(globalStateAuthority);
  broadcastDeltas(deltas);
  return { status: 'success', deltaCount: deltas.length };
}

/**
 * MCP Tools for Delta Replication and State Synchronization
 * Gives LLM Agents and remote servers the ability to natively subscribe to
 * and publish push-based state delta increments.
 */
export const networkingTools: Tool[] = [
  {
    name: 'push_state_delta',
    description: 'Push a raw spatial or semantic state delta securely to the Global Sync Mesh. ' +
      'Automatically performs Server-Authoritative Conflict Resolution (Last-Write-Wins) and diff compression.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: {
          type: 'string',
          description: 'The UUID of the Entity undergoing a state transition.',
        },
        payload: {
          type: 'object',
          description: 'A JSON object containing only the fields that have been modified (new values).',
        },
      },
      required: ['entityId', 'payload'],
    },
  },
  {
    name: 'fetch_authoritative_state',
    description: 'Pull the current absolute truth for an Entity from the StateAuthority layer safely bypassing out-of-sync local caches.',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string', description: 'The UUID of the target Entity.' },
      },
      required: ['entityId'],
    },
  },
  {
    name: 'push_portal_intent',
    description:
      'Push a typed HoloPortal presence intent (move/look/grab/say) on behalf of an entity ' +
      'entering a HoloGate portal. The intent is validated against the entrant’s HoloDoor ' +
      'spatial scope (read-only < mutate-zone < drive-avatar) BEFORE it becomes a state delta — ' +
      'this is the scoped, agent-native alternative to pushing raw payloads at push_state_delta. ' +
      'Rejected intents do not mutate state (unless policy enforcement is "warn").',
    inputSchema: {
      type: 'object',
      properties: {
        intent: {
          type: 'object',
          description:
            'Typed intent. kind=move {entityId,position:{x,y,z}} | look {entityId,rotation:{x,y,z,w?}} | grab {entityId,targetId} | say {entityId,utterance}.',
        },
        requestedScope: {
          type: 'string',
          enum: ['read-only', 'mutate-zone', 'drive-avatar'],
          description: 'Scope the portal granted this entrant. Defaults to the policy defaultScope.',
        },
        spatialPolicy: {
          type: 'object',
          description:
            'The HoloDoor `spatial` policy block for the world/team (fetched at the portal threshold). Omit to default-deny (read-only).',
        },
        driveAvatarActiveCount: {
          type: 'number',
          description: 'Avatars this entrant already drives (for drive-avatar maxEntities enforcement). Default 0.',
        },
      },
      required: ['intent'],
    },
  },
];

export async function handleNetworkingTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'push_state_delta': {
      const { entityId, payload } = args;
      if (!entityId || typeof entityId !== 'string')
        throw new Error("Missing or invalid 'entityId'");

      const result = commitState(entityId, (payload ?? {}) as Record<string, unknown>);
      return result.status === 'success'
        ? {
            status: 'success',
            message: `State replicated. Server Authority resolved ${result.deltaCount} deltas securely.`,
          }
        : { status: 'skipped', message: `Payload contained no diff against authoritative state.` };
    }
    case 'push_portal_intent': {
      const intent = args?.intent as PortalIntent | undefined;
      if (!intent || typeof intent !== 'object' || typeof (intent as any).kind !== 'string')
        throw new Error("Missing or invalid 'intent' (need { kind, entityId, ... })");
      if (!('entityId' in intent) || typeof (intent as any).entityId !== 'string')
        throw new Error("Intent missing 'entityId'");

      const policy = args?.spatialPolicy as SpatialPolicy | undefined;
      const requestedScope = args?.requestedScope as SpatialScope | undefined;
      const activeCount = typeof args?.driveAvatarActiveCount === 'number' ? args.driveAvatarActiveCount : 0;

      const verdict = validatePortalIntent(intent, policy, requestedScope, activeCount);
      if (!verdict.allowed) {
        return {
          status: 'rejected',
          scope: verdict.scope,
          reason: verdict.reason,
          message: `Intent '${intent.kind}' rejected: ${verdict.reason}`,
        };
      }

      const { entityId, payload } = intentToDelta(intent);
      const result = commitState(entityId, payload);
      return {
        status: result.status === 'success' ? 'success' : 'skipped',
        scope: verdict.scope,
        ...(verdict.warned ? { warned: true, warning: verdict.reason } : {}),
        message:
          result.status === 'success'
            ? `Intent '${intent.kind}' applied under scope '${verdict.scope}' (${result.deltaCount} deltas).`
            : `Intent '${intent.kind}' produced no state change.`,
      };
    }
    case 'fetch_authoritative_state': {
      const { entityId } = args;
      if (!entityId || typeof entityId !== 'string')
        throw new Error("Missing or invalid 'entityId'");
      const state = globalStateAuthority[entityId];
      return state || { _null: true };
    }
    default:
      return null;
  }
}
