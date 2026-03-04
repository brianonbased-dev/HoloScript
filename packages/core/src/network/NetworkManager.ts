/**
 * NetworkManager.ts
 *
 * Network layer for HoloScript+ multiplayer.
 * Manages connections, message serialization, and latency simulation.
 * Supports optional real transport (WebSocket/WebRTC) via attachTransport().
 *
 * W.NET.02: Implements AOI-filtered broadcast via spatial hash grid.
 * P.NET.04: Supports Brain Server configuration for batched agent inference.
 * W.NET.01: Server-authority model for 100+ player scale.
 */

import type { IVector3 } from './NetworkTypes';
import { SpatialHashGrid, type EntityType } from './NetworkTypes';
import type { NetworkTransport } from './NetworkTransport';

export type MessageType = 'state_sync' | 'event' | 'rpc' | 'handshake' | 'heartbeat' | 'agent_state';

export interface NetworkMessage {
    type: MessageType;
    senderId: string;
    timestamp: number;
    payload: any;
}

export interface PeerInfo {
    id: string;
    displayName: string;
    latency: number;
    connected: boolean;
    joinedAt: number;
}

/**
 * Brain Server configuration for dedicated GPU agent inference.
 * P.NET.04: Separate GPU server for 100-agent batched inference.
 */
export interface BrainServerConfig {
    /** Brain Server WebSocket URL */
    url: string;
    /** Maximum concurrent agent inferences */
    maxConcurrent: number;
    /** Batch size for vLLM-style batching */
    batchSize: number;
    /** Timeout per inference request (ms) */
    timeoutMs: number;
    /** Model to use for agent reasoning */
    model: string;
}

export type MessageHandler = (message: NetworkMessage) => void;

export class NetworkManager {
    private peerId: string;
    private peers: Map<string, PeerInfo> = new Map();
    private handlers: Map<MessageType, MessageHandler[]> = new Map();
    private outbox: NetworkMessage[] = [];
    private inbox: NetworkMessage[] = [];
    private connected: boolean = false;
    private simulatedLatency: number = 0;

    /** W.NET.02: Spatial hash grid for AOI interest management */
    private spatialGrid: SpatialHashGrid;

    /** P.NET.04: Brain Server configuration */
    private brainServerConfig: BrainServerConfig | null = null;

    /** Real transport layer — when attached, outbox is routed through it */
    private transport: NetworkTransport | null = null;

    /** GC interval tracking for spatial grid cleanup */
    private gcAccumulator: number = 0;
    private static readonly GC_INTERVAL_MS = 5000;

    constructor(peerId: string) {
        this.peerId = peerId;
        this.spatialGrid = new SpatialHashGrid({ cellSize: 50 });
    }

    // =========================================================================
    // TRANSPORT BRIDGE
    // =========================================================================

    /**
     * Attach a real transport layer (e.g., SpatialWebSocketTransport).
     * When attached, broadcast/sendTo/broadcastToAOI route through the transport
     * instead of the simulated outbox.
     */
    attachTransport(transport: NetworkTransport): void {
        this.transport = transport;
        // Register existing peers with the transport
        for (const peer of this.peers.values()) {
            transport.connect(peer.id);
        }
    }

    /**
     * Detach the transport layer, reverting to simulated outbox.
     */
    detachTransport(): void {
        this.transport = null;
    }

    /**
     * Get the attached transport (if any).
     */
    getTransport(): NetworkTransport | null {
        return this.transport;
    }

    /**
     * Simulate connecting to a server/room.
     */
    connect(): void {
        this.connected = true;
    }

    disconnect(): void {
        this.connected = false;
        this.peers.clear();
    }

    isConnected(): boolean {
        return this.connected;
    }

    getPeerId(): string {
        return this.peerId;
    }

    /**
     * Register a peer (simulates another player joining).
     */
    addPeer(id: string, displayName: string): void {
        this.peers.set(id, {
            id, displayName,
            latency: 0,
            connected: true,
            joinedAt: Date.now(),
        });
    }

    removePeer(id: string): void {
        this.peers.delete(id);
        this.spatialGrid.removePeer(id);
    }

    getPeers(): PeerInfo[] {
        return Array.from(this.peers.values());
    }

    getPeerCount(): number {
        return this.peers.size;
    }

    /**
     * Register a handler for a message type.
     */
    onMessage(type: MessageType, handler: MessageHandler): void {
        const list = this.handlers.get(type) || [];
        list.push(handler);
        this.handlers.set(type, list);
    }

    /**
     * Send a message to all peers.
     * Routes through transport when attached, otherwise uses outbox.
     */
    broadcast(type: MessageType, payload: any): void {
        if (!this.connected) return;

        if (this.transport) {
            this.transport.broadcast(type, payload as Record<string, unknown>);
            return;
        }

        const msg: NetworkMessage = {
            type,
            senderId: this.peerId,
            timestamp: Date.now(),
            payload,
        };
        this.outbox.push(msg);
    }

    /**
     * W.NET.02: Send a message only to peers within the entity's Area of Interest.
     * 95% bandwidth reduction for 200 entities → each player sees 20-40.
     */
    broadcastToAOI(
        entityId: string,
        type: MessageType,
        payload: any
    ): void {
        if (!this.connected) return;

        const interestedPeers = this.spatialGrid.getPeersInterestedIn(entityId);

        for (const peerId of interestedPeers) {
            if (peerId === this.peerId) continue;
            this.sendTo(peerId, type, payload);
        }
    }

    /**
     * Send a message to a specific peer.
     * Routes through transport when attached, otherwise uses outbox.
     */
    sendTo(peerId: string, type: MessageType, payload: any): void {
        if (!this.connected || !this.peers.has(peerId)) return;

        if (this.transport) {
            this.transport.send(peerId, type, payload as Record<string, unknown>);
            return;
        }

        const msg: NetworkMessage = {
            type,
            senderId: this.peerId,
            timestamp: Date.now(),
            payload: { ...payload, _targetPeer: peerId },
        };
        this.outbox.push(msg);
    }

    /**
     * Receive a message (simulates incoming network data).
     */
    receive(message: NetworkMessage): void {
        this.inbox.push(message);
    }

    /**
     * Process inbox — dispatch to handlers.
     */
    processInbox(): void {
        for (const msg of this.inbox) {
            const handlers = this.handlers.get(msg.type) || [];
            for (const handler of handlers) {
                handler(msg);
            }
        }
        this.inbox = [];
    }

    /**
     * Get and clear the outbox.
     */
    flush(): NetworkMessage[] {
        const msgs = [...this.outbox];
        this.outbox = [];
        return msgs;
    }

    /**
     * Set simulated latency (ms).
     */
    setSimulatedLatency(ms: number): void {
        this.simulatedLatency = ms;
    }

    getSimulatedLatency(): number {
        return this.simulatedLatency;
    }

    /**
     * Per-frame update pump.
     * Processes the transport (delivers delayed messages), processes inbox,
     * and periodically garbage-collects empty spatial grid cells.
     * @param dt Delta time in seconds
     */
    update(dt: number): void {
        // Pump the transport if attached
        if (this.transport) {
            this.transport.update(dt);
        }

        // Process incoming messages
        this.processInbox();

        // Periodic spatial grid GC
        this.gcAccumulator += dt * 1000;
        if (this.gcAccumulator >= NetworkManager.GC_INTERVAL_MS) {
            this.gcAccumulator = 0;
            this.spatialGrid.gc();
        }
    }

    // =========================================================================
    // SPATIAL INTEREST MANAGEMENT (W.NET.02)
    // =========================================================================

    /**
     * Update a peer's position for AOI tracking.
     */
    updatePeerPosition(peerId: string, position: IVector3, aoiRadius: number = 100): void {
        this.spatialGrid.updatePeerPosition(peerId, position, aoiRadius);
    }

    /**
     * Update an entity's position for AOI tracking.
     */
    updateEntityPosition(entityId: string, position: IVector3, entityType: EntityType = 'player'): void {
        this.spatialGrid.updateEntityPosition(entityId, position, entityType);
    }

    /**
     * Get all entity IDs in a peer's AOI.
     */
    getEntitiesInAOI(peerId: string): string[] {
        return this.spatialGrid.getEntitiesInAOI(peerId);
    }

    /**
     * Get the spatial hash grid for external use.
     */
    getSpatialGrid(): SpatialHashGrid {
        return this.spatialGrid;
    }

    // =========================================================================
    // BRAIN SERVER (P.NET.04)
    // =========================================================================

    /**
     * Configure the Brain Server for batched agent inference.
     * P.NET.04: Dedicated GPU (RTX 4090) for 100-agent batched inference.
     */
    setBrainServerConfig(config: BrainServerConfig): void {
        this.brainServerConfig = config;
    }

    /**
     * Get Brain Server configuration.
     */
    getBrainServerConfig(): BrainServerConfig | null {
        return this.brainServerConfig;
    }
}
