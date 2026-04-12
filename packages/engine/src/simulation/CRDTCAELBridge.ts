/**
 * CRDTCAELBridge — Paper #3
 *
 * Wires @holoscript/crdt-spatial merge operations as first-class CAEL
 * interaction events, committing every remote merge to the hash-chained
 * provenance trace.
 *
 * This fulfils the Interaction Truth layer requirement: CRDT convergence
 * is a reproducible intervention (a remote peer's state arriving) that
 * must be recorded alongside simulation steps, not outside them.
 *
 * Supported merge sources:
 *   – SpatialCRDTBridge.importUpdate()  → 'cael.crdt_merge/spatial'
 *   – WorldState.import() / .merge()    → 'cael.crdt_merge/world_state'
 *
 * Usage:
 * ```ts
 * const bridge = new CRDTCAELBridge({ spatial, world, recorder });
 * bridge.mergeSpatial(remoteBytes, 'peer-42');    // merge + log
 * bridge.mergeWorld(remoteSnapshot, 'peer-42');   // merge + log
 * ```
 */

import type { SpatialCRDTBridge } from '@holoscript/crdt-spatial';
import type { WorldState } from '@holoscript/crdt-spatial';
import type { CAELRecorder } from './CAELRecorder.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a Uint8Array to a compact hex string (version fingerprint). */
function toHex(bytes: Uint8Array): string {
  // VersionVector from Loro has an .encode() method — detect and use it
  const raw: Uint8Array =
    typeof (bytes as unknown as { encode?: () => Uint8Array }).encode === 'function'
      ? (bytes as unknown as { encode: () => Uint8Array }).encode()
      : bytes;
  // First 16 bytes is enough for a provenance fingerprint
  const slice = raw.subarray(0, Math.min(16, raw.length));
  return Array.from(slice)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Config ───────────────────────────────────────────────────────────────────

export interface CRDTCAELBridgeConfig {
  /** The SpatialCRDTBridge to intercept spatial merges on. */
  spatial?: SpatialCRDTBridge;
  /** The WorldState to intercept world-state merges on. */
  world?: WorldState;
  /** Recorder to commit merge events to the CAEL trace. */
  recorder: CAELRecorder;
  /**
   * Local peer identifier stamped on every merge entry.
   * Defaults to 'local'.
   */
  localPeerId?: string;
}

// ── Bridge ───────────────────────────────────────────────────────────────────

/**
 * CRDTCAELBridge intercepts CRDT merge operations and records them as
 * `cael.crdt_merge` interaction events in the CAEL hash-chain trace.
 *
 * This makes every remote state convergence a provenance-tracked,
 * replayable event — identical semantics to simulation steps and
 * physical agent actions.
 */
export class CRDTCAELBridge {
  private readonly spatial: SpatialCRDTBridge | undefined;
  private readonly world: WorldState | undefined;
  private readonly recorder: CAELRecorder;
  readonly localPeerId: string;

  constructor(config: CRDTCAELBridgeConfig) {
    this.spatial = config.spatial;
    this.world = config.world;
    this.recorder = config.recorder;
    this.localPeerId = config.localPeerId ?? 'local';
  }

  /**
   * Merge a remote spatial update into the SpatialCRDTBridge and log
   * a `cael.crdt_merge/spatial` interaction event.
   *
   * @param bytes     Raw Loro update bytes from a remote peer.
   * @param fromPeer  Peer ID that produced the update.
   * @param extra     Optional additional metadata to attach to the event.
   */
  mergeSpatial(
    bytes: Uint8Array,
    fromPeer: string,
    extra?: Record<string, unknown>,
  ): void {
    if (!this.spatial) {
      throw new Error('CRDTCAELBridge: no SpatialCRDTBridge configured');
    }

    const versionBefore = toHex(this.spatial.getVersion());
    this.spatial.importUpdate(bytes);
    const versionAfter = toHex(this.spatial.getVersion());

    this.recorder.logInteraction('cael.crdt_merge', {
      crdtType: 'spatial',
      localPeer: this.localPeerId,
      fromPeer,
      mergeBytes: bytes.length,
      versionBefore,
      versionAfter,
      nodesObserved: this.spatial.getRegisteredNodes(),
      ...(extra ?? {}),
    });
  }

  /**
   * Merge a remote WorldState snapshot/update into the local WorldState
   * and log a `cael.crdt_merge/world_state` interaction event.
   *
   * Accepts either raw Loro snapshot bytes or another WorldState instance.
   *
   * @param remote   Raw Loro bytes OR a remote WorldState instance.
   * @param fromPeer Peer ID that produced the update.
   * @param extra    Optional additional metadata to attach to the event.
   */
  mergeWorld(
    remote: Uint8Array | WorldState,
    fromPeer: string,
    extra?: Record<string, unknown>,
  ): void {
    if (!this.world) {
      throw new Error('CRDTCAELBridge: no WorldState configured');
    }

    const objectsBefore = this.world.getObjectCount();

    if (remote instanceof Uint8Array) {
      this.world.import(remote);
    } else {
      this.world.merge(remote);
    }

    const objectsAfter = this.world.getObjectCount();
    const isBytes = remote instanceof Uint8Array;

    this.recorder.logInteraction('cael.crdt_merge', {
      crdtType: 'world_state',
      localPeer: this.localPeerId,
      fromPeer,
      mergeBytes: isBytes ? (remote as Uint8Array).length : null,
      objectCountBefore: objectsBefore,
      objectCountAfter: objectsAfter,
      objectCountDelta: objectsAfter - objectsBefore,
      ...(extra ?? {}),
    });
  }
}
