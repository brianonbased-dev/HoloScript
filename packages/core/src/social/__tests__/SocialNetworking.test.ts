import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SocialGraph } from '../SocialGraph';
import { FriendManager } from '../FriendManager';
import { PresenceManager } from '../PresenceManager';
import { WebRTCTransport, SocialPacket } from '../../network/WebRTCTransport';

// Mock WebRTCTransport
class MockTransport {
    socialHandlers: Set<(packet: SocialPacket) => void> = new Set();
    sentPackets: SocialPacket[] = [];

    sendSocialMessage(packet: SocialPacket) {
        this.sentPackets.push(packet);
    }

    onSocialMessage(handler: (packet: SocialPacket) => void) {
        this.socialHandlers.add(handler);
    }

    // Simulate receiving a packet from "network"
    receiveFake(packet: SocialPacket) {
        this.socialHandlers.forEach(handler => handler(packet));
    }
}

describe('Social Networking Integration', () => {
    let graph1: SocialGraph;
    let transport1: MockTransport;
    let friendManager1: FriendManager;
    let presenceManager1: PresenceManager;

    beforeEach(() => {
        graph1 = new SocialGraph('user-alice');
        graph1.updateUser({ id: 'user-alice', username: 'alice', displayName: 'Alice', status: 'online', lastSeen: 0 });
        transport1 = new MockTransport();
        friendManager1 = new FriendManager(graph1, transport1 as unknown as WebRTCTransport);
        presenceManager1 = new PresenceManager(graph1, transport1 as unknown as WebRTCTransport);
    });

    it('should send SOCIAL_REQUEST when adding a friend', () => {
        const bob = { id: 'user-bob', username: 'bob', displayName: 'Bob', status: 'online', lastSeen: 0 };
        
        friendManager1.sendRequest(bob as any);

        expect(transport1.sentPackets.length).toBe(1);
        expect(transport1.sentPackets[0].type).toBe('SOCIAL_REQUEST');
        expect(transport1.sentPackets[0].payload.user.id).toBe('user-alice'); // Should send OUR profile
    });

    it('should receive SOCIAL_REQUEST and update graph', () => {
        const bobProfile = { id: 'user-bob', username: 'bob', displayName: 'Bob', status: 'online', lastSeen: 0 };
        
        transport1.receiveFake({
            type: 'SOCIAL_REQUEST',
            payload: { user: bobProfile },
            fromPeerId: 'peer-bob'
        });

        const bob = graph1.getUser('user-bob');
        expect(bob).toBeDefined();
        expect(graph1.getRelationship('user-bob')).toBe('pending_incoming');
    });

    it('should send SOCIAL_ACCEPT when accepting request', () => {
        // Setup pending request first
        const bobProfile = { id: 'user-bob', username: 'bob', displayName: 'Bob', status: 'online', lastSeen: 0 };
        graph1.updateUser(bobProfile as any);
        graph1.setRelationship('user-bob', 'pending_incoming');

        friendManager1.acceptRequest('user-bob');

        expect(transport1.sentPackets.length).toBe(1);
        expect(transport1.sentPackets[0].type).toBe('SOCIAL_ACCEPT');
        expect(transport1.sentPackets[0].payload.userId).toBe('user-alice');
        expect(graph1.getRelationship('user-bob')).toBe('friend');
    });

    it('should broadcast status updates via PresenceManager', () => {
        presenceManager1.setLocalStatus('busy', 'Coding');

        expect(transport1.sentPackets.length).toBe(1);
        expect(transport1.sentPackets[0].type).toBe('SOCIAL_STATUS');
        expect(transport1.sentPackets[0].payload).toEqual({
            userId: 'user-alice',
            status: 'busy',
            activity: 'Coding'
        });
    });

    it('should update graph on receiving SOCIAL_STATUS', () => {
        // Ensure Bob exists
        const bobProfile = { id: 'user-bob', username: 'bob', displayName: 'Bob', status: 'online', lastSeen: 0 };
        graph1.updateUser(bobProfile as any);

        transport1.receiveFake({
            type: 'SOCIAL_STATUS',
            payload: { userId: 'user-bob', status: 'away', activity: 'Lunch' }
        });

        const bob = graph1.getUser('user-bob');
        expect(bob?.status).toBe('away');
        expect(bob?.currentActivity).toBe('Lunch');
    });
});
