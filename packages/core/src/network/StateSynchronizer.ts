import { StateDelta } from './DeltaCompressor';
import { ProceduralSkill } from '../types';
import { PriorityScorer, ScoredDelta } from './PriorityScorer';
import { SpatialSharder } from './SpatialSharder';
import { TransactionLog } from './TransactionLog';
import { WebSocketTransport } from './WebSocketTransport';

export interface SubscriberOptions {
  position?: { x: number; y: number; z: number };
  interactionRadius?: number;
}
export type StateSubscriber = (deltas: StateDelta[]) => void;
export type SkillSubscriber = (skill: ProceduralSkill) => void;

/**
 * StateSynchronizer
 *
 * Decentralized core Pub/Sub engine. Enables isolated simulation chunks
 * and local agent entities to broadcast and subscribe to spatial/semantic
 * deltas globally across the HoloScript realm.
 */
export class StateSynchronizer {
  private static instance: StateSynchronizer;

  // Subscriber maps bound by entity ID (who is interested in what)
  private globalSubscribers: Set<StateSubscriber> = new Set();
  private subscriberOptions: Map<StateSubscriber, SubscriberOptions> = new Map();
  private entitySubscribers: Map<string, Set<StateSubscriber>> = new Map();

  // Spatial culling position tracking
  private entityPositions: Map<string, { x: number; y: number; z: number }> = new Map();
  private entityShards: Map<string, string> = new Map();

  // Procedural Skill Syncer Mesh
  private skillSubscribers: Set<SkillSubscriber> = new Set();

  // Adaptive Batching Metrics
  private pendingBatch: ScoredDelta[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private currentBatchWindowMs = 50;

  // Persistent Storage (WAL)
  private wal: TransactionLog = new TransactionLog();

  // Active Transport Mesh
  private transport: WebSocketTransport | null = null;
  private initializedMesh: boolean = false;

  private constructor() {}

  static getInstance(): StateSynchronizer {
    if (!StateSynchronizer.instance) {
      StateSynchronizer.instance = new StateSynchronizer();
    }
    return StateSynchronizer.instance;
  }

  /**
   * Bootstraps the local synchronization node over WebSockets.
   */
  public initializeMesh() {
    if (this.initializedMesh) return;
    this.initializedMesh = true;

    this.transport = new WebSocketTransport({
      roomId: 'local_actor',
      serverUrl: 'ws://127.0.0.1:8080',
    });
    this.transport.connect();

    // Route inbound traffic from the server into the subscriber loops
    this.transport.onMessage('state-sync', (msg: any) => {
      const payload = msg.payload;
      if (payload && payload.agent_updates && Array.isArray(payload.agent_updates)) {
        // Reconstruct native TS Deltas from the Rust AgentDelta structs
        const inboundDeltas: StateDelta[] = [];
        for (const update of payload.agent_updates) {
          // Quick map back to x, y, z deltas
          inboundDeltas.push({
            entityId: update.id,
            field: 'x',
            newValue: update.x,
            oldValue: 0,
            timestamp: payload.timestamp,
          });
          inboundDeltas.push({
            entityId: update.id,
            field: 'y',
            newValue: update.y,
            oldValue: 0,
            timestamp: payload.timestamp,
          });
          inboundDeltas.push({
            entityId: update.id,
            field: 'z',
            newValue: update.z,
            oldValue: 0,
            timestamp: payload.timestamp,
          });
        }

        if (inboundDeltas.length > 0) {
          this.dispatchToSubscribers(inboundDeltas);
        }
      }
    });
  }

  private dispatchToSubscribers(deltas: StateDelta[]) {
    // Diff Privacy: Scrub private variables from global telemetry natively
    const publicDeltasToDispatch = deltas.filter((delta) => {
      const isPrivate = delta.field.includes('private_') || delta.field.includes('_secure');
      return !isPrivate;
    });

    // Basic global dispatch for inbound
    this.globalSubscribers.forEach((sub) => {
      sub(publicDeltasToDispatch);
    });

    // Group changes by Entity to selectively dispatch to scoped listeners
    const entityGroups = new Map<string, StateDelta[]>();
    for (const delta of deltas) {
      let arr = entityGroups.get(delta.entityId);
      if (!arr) {
        arr = [];
        entityGroups.set(delta.entityId, arr);
      }
      arr.push(delta);
    }

    for (const [entityId, entityDeltas] of entityGroups.entries()) {
      const scopedListeners = this.entitySubscribers.get(entityId);
      if (scopedListeners) {
        scopedListeners.forEach((sub) => sub(entityDeltas));
      }
    }
  }

  /**
   * Enqueue a burst of pre-computed deltas. Rather than instant transmission,
   * they are loaded into an adaptive batch prioritized by the PriorityScorer.
   */
  broadcastDeltas(deltas: StateDelta[]) {
    if (deltas.length === 0) return;

    for (const delta of deltas) {
      this.pendingBatch.push(PriorityScorer.score(delta));
    }

    if (!this.batchTimer) {
      this.scheduleNextFlush();
    }
  }

  private scheduleNextFlush() {
    // Evaluate simulated network load scale (queue depth) to adjust the batch window dynamically
    if (this.pendingBatch.length > 500) {
      // High load: Expand window to gather more packets together (Cap: 200ms)
      this.currentBatchWindowMs = Math.min(200, this.currentBatchWindowMs + 10);
    } else if (this.pendingBatch.length < 100) {
      // Low Load: Expedite packets (Floor: 10ms)
      this.currentBatchWindowMs = Math.max(10, this.currentBatchWindowMs - 10);
    }

    this.batchTimer = setTimeout(() => this.flushDeltas(), this.currentBatchWindowMs);
  }

  private flushDeltas() {
    this.batchTimer = null;
    if (this.pendingBatch.length === 0) return;

    // Sequence prioritization (0 = Critical, 100 = Low)
    this.pendingBatch.sort((a, b) => a.priority - b.priority);

    // Dequeue batch directly
    const deltasToDispatch = this.pendingBatch.splice(0, this.pendingBatch.length);

    // Update entity positions for spatial culling
    for (const delta of deltasToDispatch) {
      if (delta.field === 'x' || delta.field === 'y' || delta.field === 'z') {
        let pos = this.entityPositions.get(delta.entityId);
        if (!pos) {
          pos = { x: 0, y: 0, z: 0 };
          this.entityPositions.set(delta.entityId, pos);
        }
        pos[delta.field as 'x' | 'y' | 'z'] = delta.newValue as number;

        // Update Sector Sharding tracking dynamically
        this.entityShards.set(delta.entityId, SpatialSharder.getShardId(pos.x, pos.y, pos.z));
      }

      // Sync persistent transaction log enforcing recovery resilience
      this.wal.append(delta);
    }

    // Send Outbound Sync over Mesh (if initialized)
    if (this.transport) {
      this.transport.sendMessage({
        type: 'state-sync',
        payload: {
          deltas: deltasToDispatch.map((d) => ({
            id: d.entityId,
            field: d.field,
            value: d.newValue,
            time: d.timestamp,
          })),
        }
      });
    }

    // Diff Privacy: Scrub private variables from global telemetry natively
    const publicDeltasToDispatch = deltasToDispatch.filter((delta) => {
      const isPrivate = delta.field.includes('private_') || delta.field.includes('_secure');
      return !isPrivate;
    });

    // Broadcast to global net with Level-of-Detail (LOD) Spatial Culling
    this.globalSubscribers.forEach((sub) => {
      const options = this.subscriberOptions.get(sub);

      // If no position/radius specified, receive all network events unfiltered
      if (!options || !options.position || !options.interactionRadius) {
        if (publicDeltasToDispatch.length > 0) sub(publicDeltasToDispatch);
        return;
      }

      // Map interacting Shard regions intersecting subscriber boundary
      const targetShards = new Set(
        SpatialSharder.getOverlappingShards(
          options.position.x,
          options.position.y,
          options.position.z,
          options.interactionRadius
        )
      );

      // Apply Euclidean Distance Culling Phase
      const culledDeltas = publicDeltasToDispatch.filter((delta) => {
        const entityPos = this.entityPositions.get(delta.entityId);
        if (!entityPos) return true; // Allow transmission if location is unknown

        const entityShard = this.entityShards.get(delta.entityId);

        // O(1) Cluster Rejection: If chunk ignores local node completely, bounce immediately
        if (entityShard && !targetShards.has(entityShard)) {
          return false;
        }

        const dx = entityPos.x - options.position!.x;
        const dy = entityPos.y - options.position!.y;
        const dz = entityPos.z - options.position!.z;
        const distSq = dx * dx + dy * dy + dz * dz;

        const r = options.interactionRadius!;
        return distSq <= r * r;
      });

      if (culledDeltas.length > 0) {
        sub(culledDeltas);
      }
    });

    // Group changes by Entity to selectively dispatch to scoped listeners
    const entityGroups = new Map<string, StateDelta[]>();
    for (const delta of deltasToDispatch) {
      let arr = entityGroups.get(delta.entityId);
      if (!arr) {
        arr = [];
        entityGroups.set(delta.entityId, arr);
      }
      arr.push(delta);
    }

    for (const [entityId, entityDeltas] of entityGroups.entries()) {
      const scopedListeners = this.entitySubscribers.get(entityId);
      if (scopedListeners) {
        scopedListeners.forEach((sub) => sub(entityDeltas));
      }
    }

    if (this.pendingBatch.length > 0) {
      this.scheduleNextFlush();
    }
  }

  /**
   * Subscribe to all global state deltas (e.g. Server sync bridges).
   */
  subscribeGlobal(callback: StateSubscriber, options?: SubscriberOptions): () => void {
    this.globalSubscribers.add(callback);
    if (options) {
      this.subscriberOptions.set(callback, options);
    }
    return () => {
      this.globalSubscribers.delete(callback);
      this.subscriberOptions.delete(callback);
    };
  }

  /**
   * Subscribe to targeted changes restricted strictly to a specific Entity.
   */
  subscribeEntity(entityId: string, callback: StateSubscriber): () => void {
    let scopedListeners = this.entitySubscribers.get(entityId);
    if (!scopedListeners) {
      scopedListeners = new Set();
      this.entitySubscribers.set(entityId, scopedListeners);
    }
    scopedListeners.add(callback);

    return () => {
      const listeners = this.entitySubscribers.get(entityId);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.entitySubscribers.delete(entityId);
        }
      }
    };
  }

  /**
   * Broadcast a procedural skill mutation recursively so all agents merge success rates.
   */
  broadcastSkill(skill: ProceduralSkill) {
    this.skillSubscribers.forEach((sub) => sub(skill));
  }

  /**
   * Listen globally for procedurally acquired skills bouncing across the instance.
   */
  subscribeSkills(callback: SkillSubscriber): () => void {
    this.skillSubscribers.add(callback);
    return () => this.skillSubscribers.delete(callback);
  }

  /**
   * Recovery API reading `.wal` states sequentially mapping offline CRDT histories completely locally.
   */
  async recoverFromLog(): Promise<StateDelta[]> {
    const deltas = await this.wal.recover();
    if (deltas.length > 0) {
      // Apply internally mapped variables immediately offline bounding the node logic natively.
      for (const d of deltas) {
        if (d.field === 'x' || d.field === 'y' || d.field === 'z') {
          let pos = this.entityPositions.get(d.entityId);
          if (!pos) {
            pos = { x: 0, y: 0, z: 0 };
            this.entityPositions.set(d.entityId, pos);
          }
          pos[d.field as 'x' | 'y' | 'z'] = d.newValue as number;
        }
      }
    }
    return deltas;
  }

  async clearLog(): Promise<void> {
    await this.wal.truncate();
  }
}
