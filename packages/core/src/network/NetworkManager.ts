/**
 * NetworkManager.ts
 *
 * Simulated network layer for HoloScript+ multiplayer.
 * Manages connections, message serialization, and latency simulation.
 * In production, this would wrap WebSocket/WebRTC connections.
 *
 * TODO(W.NET.02): Add spatial hash grid interest management.
 *   broadcast() sends to ALL peers. For 100+ players, this is O(n²).
 *   Need: broadcastToAOI(position, radius, type, payload) that only
 *   sends to peers within the entity's Area of Interest.
 *   Expected: 95% bandwidth reduction (200 entities → 20-40 per player).
 *
 * TODO(P.NET.04): Brain Server integration.
 *   AI agent inference runs on a dedicated GPU server (RTX 4090),
 *   not on game server or headset. Manager needs a separate channel
 *   for brainServer: { url, batchSize, maxConcurrent } configuration.
 *   100 agents × 5-10 tok/s each via vLLM batched inference.
 *
 * TODO(W.NET.01): Replace simulated networking with production transport.
 *   Current implementation is in-memory only. Production needs:
 *   WebSocket for reliable + WebRTC DataChannel for unreliable.
 *   Server-authority model (not P2P) for 100+ player scale.
 */

export type MessageType = 'state_sync' | 'event' | 'rpc' | 'handshake' | 'heartbeat';

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

export type MessageHandler = (message: NetworkMessage) => void;

export class NetworkManager {
    private peerId: string;
    private peers: Map<string, PeerInfo> = new Map();
    private handlers: Map<MessageType, MessageHandler[]> = new Map();
    private outbox: NetworkMessage[] = [];
    private inbox: NetworkMessage[] = [];
    private connected: boolean = false;
    private simulatedLatency: number = 0;

    constructor(peerId: string) {
        this.peerId = peerId;
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
     */
    broadcast(type: MessageType, payload: any): void {
        if (!this.connected) return;

        const msg: NetworkMessage = {
            type,
            senderId: this.peerId,
            timestamp: Date.now(),
            payload,
        };
        this.outbox.push(msg);
    }

    /**
     * Send a message to a specific peer.
     */
    sendTo(peerId: string, type: MessageType, payload: any): void {
        if (!this.connected || !this.peers.has(peerId)) return;

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
}
