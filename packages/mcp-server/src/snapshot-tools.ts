import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const HOLO_DIR = process.env.HOLOSCRIPT_CACHE_DIR || path.join(os.homedir(), '.holoscript');
const SNAPSHOTS_FILE = path.join(HOLO_DIR, 'snapshots.json');

export interface TemporalSnapshot {
  snapshotId: string;
  timestamp: number;
  keyframe: Record<string, unknown>;
  forwardDeltas: any[]; // Chain to rapidly seek O(1) forward in time
}

// Persistent snapshot store backed by disk
const snapshotStore: Map<string, TemporalSnapshot> = loadSnapshotsFromDisk();

function loadSnapshotsFromDisk(): Map<string, TemporalSnapshot> {
  try {
    if (fs.existsSync(SNAPSHOTS_FILE)) {
      const raw = fs.readFileSync(SNAPSHOTS_FILE, 'utf-8');
      const obj: Record<string, TemporalSnapshot> = JSON.parse(raw);
      return new Map(Object.entries(obj));
    }
  } catch {
    // If file is corrupt, start fresh
    console.warn(
      `[CacheDebug][snapshot] load miss path=${SNAPSHOTS_FILE} reason=parse-or-io-error`
    );
  }
  return new Map();
}

function saveSnapshotsToDisk(): void {
  try {
    if (!fs.existsSync(HOLO_DIR)) {
      fs.mkdirSync(HOLO_DIR, { recursive: true });
    }
    const obj: Record<string, TemporalSnapshot> = {};
    for (const [k, v] of snapshotStore) {
      obj[k] = v;
    }
    fs.writeFileSync(SNAPSHOTS_FILE, JSON.stringify(obj), 'utf-8');
  } catch {
    // Best-effort — don't fail the tool call if disk write fails
    console.warn(`[CacheDebug][snapshot] save miss path=${SNAPSHOTS_FILE}`);
  }
}

/**
 * MCP Tools for Temporal Keyframing and State Rewinds
 * Empowers the Swarm to checkpoint the World and optionally backtrack during massive simulations.
 */
export const snapshotTools = [
  {
    name: 'create_temporal_snapshot',
    description: 'Saves a complete keyframe of the world state for temporal rewinding.',
    inputSchema: {
      type: 'object',
      properties: {
        worldState: {
          type: 'object',
          description: 'The absolute authoritative state dictionary mapped by Entity IDs.',
        },
      },
      required: ['worldState'],
    },
  },
  {
    name: 'load_temporal_snapshot',
    description:
      'Reads the meta parameters of a specific keyframe without enforcing a world rewind.',
    inputSchema: {
      type: 'object',
      properties: {
        snapshotId: { type: 'string', description: 'The unique ID of the keyframe.' },
      },
      required: ['snapshotId'],
    },
  },
  {
    name: 'rewind_world_state',
    description:
      'Forces the replication mesh backward, reverting the world to a safely stored Temporal Snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        snapshotId: {
          type: 'string',
          description: 'The UUID of the temporal snapshot to restore.',
        },
      },
      required: ['snapshotId'],
    },
  },
];

export async function handleSnapshotTool(name: string, args: any): Promise<any> {
  switch (name) {
    case 'create_temporal_snapshot': {
      const { worldState } = args;
      if (!worldState) throw new Error("Missing 'worldState' payload");

      const snapshotId = `ts_${Date.now()}`;

      snapshotStore.set(snapshotId, {
        snapshotId,
        timestamp: Date.now(),
        keyframe: JSON.parse(JSON.stringify(worldState)), // deep clone
        forwardDeltas: [],
      });

      saveSnapshotsToDisk();

      return {
        status: 'success',
        snapshotId,
        message: `Temporal Snapshot established cleanly with ${Object.keys(worldState).length} root entities.`,
      };
    }
    case 'load_temporal_snapshot': {
      const { snapshotId } = args;
      const snapshot = snapshotStore.get(snapshotId);

      if (!snapshot)
        return {
          status: 'error',
          message: `Snapshot ${snapshotId} isolated or missing. Known snapshots: ${snapshotStore.size}`,
        };

      return {
        status: 'success',
        timestamp: snapshot.timestamp,
        deltaChainLength: snapshot.forwardDeltas.length,
        entityCount: Object.keys(snapshot.keyframe).length,
      };
    }
    case 'rewind_world_state': {
      const { snapshotId } = args;
      const snapshot = snapshotStore.get(snapshotId);

      if (!snapshot) {
        return { status: 'error', message: `Snapshot ${snapshotId} not found.` };
      }

      return {
        status: 'success',
        rewoundState: snapshot.keyframe,
        message: `Temporal Anomaly averted! World reverted successfully to ${new Date(snapshot.timestamp).toISOString()}.`,
      };
    }
    default:
      return null;
  }
}
