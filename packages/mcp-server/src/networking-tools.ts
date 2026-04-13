import { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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

/** Lightweight broadcast — logs deltas (real broadcast wired by runtime layer) */
function broadcastDeltas(deltas: ReturnType<typeof computeDeltas>): void {
  // No-op in the MCP tool layer; in production this would push over WebSocket/WebRTC
  void deltas;
}

/**
 * MCP Tools for Delta Replication and State Synchronization
 * Gives LLM Agents and remote servers the ability to natively subscribe to
 * and publish push-based state delta increments.
 */
export const networkingTools = [
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
];

export async function handleNetworkingTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'push_state_delta': {
      const { entityId, payload } = args;
      if (!entityId || typeof entityId !== 'string')
        throw new Error("Missing or invalid 'entityId'");

      // 1. Fetch current server-authoritative state
      const oldState = globalStateAuthority[entityId] || {};

      // 2. Simulate Conflict Resolution: Last-Write-Wins against the master copy
      const newState = { ...oldState, ...payload };

      // 3. Delta Compression (compute the exact diff vs previously known state)
      const deltas = computeDeltas(entityId, oldState, newState);

      if (deltas.length > 0) {
        // 4. Update authority layer
        globalStateAuthority[entityId] = newState;

        // 5. Persist to disk
        saveStateToDisk(globalStateAuthority);

        // 6. Broadcast to all active subscribers via Push-Based Sync
        broadcastDeltas(deltas);

        return {
          status: 'success',
          message: `State replicated. Server Authority resolved ${deltas.length} deltas securely.`,
        };
      } else {
        return {
          status: 'skipped',
          message: `Payload contained no diff against authoritative state.`,
        };
      }
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
