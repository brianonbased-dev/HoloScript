/**
 * ChannelManager Production Tests
 * Sprint CLIII - Agent communication channel lifecycle & membership
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelManager } from '../ChannelManager';

describe('ChannelManager', () => {
  let cm: ChannelManager;

  beforeEach(() => {
    cm = new ChannelManager();
  });

  // -------------------------------------------------------------------------
  // createChannel
  // -------------------------------------------------------------------------

  describe('createChannel', () => {
    it('creates a channel and returns it', () => {
      const ch = cm.createChannel('owner', ['agent-b']);
      expect(ch.id).toBeTruthy();
      expect(ch.ownerId).toBe('owner');
      expect(ch.participants).toContain('owner');
      expect(ch.participants).toContain('agent-b');
    });

    it('emits channel:created event', () => {
      const listener = vi.fn();
      cm.on('channel:created', listener);
      cm.createChannel('owner', []);
      expect(listener).toHaveBeenCalledOnce();
    });

    it('de-duplicates owner from participants list', () => {
      const ch = cm.createChannel('owner', ['owner', 'agent-b']);
      const count = ch.participants.filter((p) => p === 'owner').length;
      expect(count).toBe(1);
    });

    it('owner has "owner" role in members', () => {
      const ch = cm.createChannel('owner', ['agent-b']);
      const member = cm.getMember(ch.id, 'owner');
      expect(member?.role).toBe('owner');
    });

    it('participants have "member" role', () => {
      const ch = cm.createChannel('owner', ['agent-b']);
      const member = cm.getMember(ch.id, 'agent-b');
      expect(member?.role).toBe('member');
    });

    it('creates encryption keys map when encryption !== none', () => {
      const ch = cm.createChannel('owner', ['agent-b'], { encryption: 'aes-256' });
      // setPublicKey should work for members
      const ok = cm.setPublicKey(ch.id, 'owner', 'hex-pub-key');
      expect(ok).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getChannel / getAllChannels
  // -------------------------------------------------------------------------

  describe('getChannel', () => {
    it('returns the channel by id', () => {
      const ch = cm.createChannel('owner', []);
      expect(cm.getChannel(ch.id)?.id).toBe(ch.id);
    });

    it('returns null for unknown id', () => {
      expect(cm.getChannel('ghost')).toBeNull();
    });
  });

  describe('getAllChannels', () => {
    it('returns all channels', () => {
      cm.createChannel('a', []);
      cm.createChannel('b', []);
      expect(cm.getAllChannels().length).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // getAgentChannels
  // -------------------------------------------------------------------------

  describe('getAgentChannels', () => {
    it('returns channels the agent belongs to', () => {
      const ch1 = cm.createChannel('alice', ['bob']);
      const ch2 = cm.createChannel('alice', []);
      const channels = cm.getAgentChannels('alice');
      const ids = channels.map((c) => c.id);
      expect(ids).toContain(ch1.id);
      expect(ids).toContain(ch2.id);
    });

    it('returns empty array for unknown agent', () => {
      expect(cm.getAgentChannels('nobody')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // closeChannel
  // -------------------------------------------------------------------------

  describe('closeChannel', () => {
    it('owner can close channel', () => {
      const ch = cm.createChannel('owner', []);
      expect(cm.closeChannel(ch.id, 'owner')).toBe(true);
      expect(cm.getChannel(ch.id)).toBeNull();
    });

    it('non-owner cannot close channel', () => {
      const ch = cm.createChannel('owner', ['guest']);
      expect(cm.closeChannel(ch.id, 'guest')).toBe(false);
      expect(cm.getChannel(ch.id)).not.toBeNull();
    });

    it('emits channel:closed event', () => {
      const listener = vi.fn();
      cm.on('channel:closed', listener);
      const ch = cm.createChannel('owner', []);
      cm.closeChannel(ch.id, 'owner');
      expect(listener).toHaveBeenCalledWith(ch.id);
    });

    it('returns false for non-existent channel', () => {
      expect(cm.closeChannel('ghost', 'anyone')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // joinChannel
  // -------------------------------------------------------------------------

  describe('joinChannel', () => {
    it('pre-listed participant can join', () => {
      const ch = cm.createChannel('owner', ['agent-b']);
      // agent-b is already a member (added during create)
      expect(cm.isMember(ch.id, 'agent-b')).toBe(true);
    });

    it('unlisted agent cannot join closed channel', () => {
      const ch = cm.createChannel('owner', []);
      expect(cm.joinChannel(ch.id, 'intruder')).toBe(false);
    });

    it('any agent can join open channel', () => {
      const ch = cm.createChannel('owner', []);
      cm.updateChannel(ch.id, 'owner', { isOpen: true });
      expect(cm.joinChannel(ch.id, 'newcomer')).toBe(true);
      expect(cm.isMember(ch.id, 'newcomer')).toBe(true);
    });

    it('emits member:joined', () => {
      const listener = vi.fn();
      cm.on('member:joined', listener);
      const ch = cm.createChannel('owner', []);
      cm.updateChannel(ch.id, 'owner', { isOpen: true });
      cm.joinChannel(ch.id, 'newcomer');
      expect(listener).toHaveBeenCalledWith(ch.id, 'newcomer');
    });

    it('returns false for non-existent channel', () => {
      expect(cm.joinChannel('ghost', 'agent')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // leaveChannel
  // -------------------------------------------------------------------------

  describe('leaveChannel', () => {
    it('member can leave', () => {
      const ch = cm.createChannel('owner', ['agent-b']);
      expect(cm.leaveChannel(ch.id, 'agent-b')).toBe(true);
      expect(cm.isMember(ch.id, 'agent-b')).toBe(false);
    });

    it('owner cannot leave', () => {
      const ch = cm.createChannel('owner', []);
      expect(cm.leaveChannel(ch.id, 'owner')).toBe(false);
    });

    it('emits member:left', () => {
      const listener = vi.fn();
      cm.on('member:left', listener);
      const ch = cm.createChannel('owner', ['agent-b']);
      cm.leaveChannel(ch.id, 'agent-b');
      expect(listener).toHaveBeenCalledWith(ch.id, 'agent-b');
    });
  });

  // -------------------------------------------------------------------------
  // kickMember
  // -------------------------------------------------------------------------

  describe('kickMember', () => {
    it('owner can kick member', () => {
      const ch = cm.createChannel('owner', ['guest']);
      expect(cm.kickMember(ch.id, 'owner', 'guest', 'bad behavior')).toBe(true);
      expect(cm.isMember(ch.id, 'guest')).toBe(false);
    });

    it('non-owner cannot kick', () => {
      const ch = cm.createChannel('owner', ['a', 'b']);
      expect(cm.kickMember(ch.id, 'a', 'b')).toBe(false);
    });

    it('cannot kick the owner', () => {
      const ch = cm.createChannel('owner', ['member']);
      expect(cm.kickMember(ch.id, 'owner', 'owner')).toBe(false);
    });

    it('emits member:kicked', () => {
      const listener = vi.fn();
      cm.on('member:kicked', listener);
      const ch = cm.createChannel('owner', ['guest']);
      cm.kickMember(ch.id, 'owner', 'guest', 'reason');
      expect(listener).toHaveBeenCalledWith(ch.id, 'guest', 'reason');
    });
  });

  // -------------------------------------------------------------------------
  // promoteToAdmin / demoteToMember
  // -------------------------------------------------------------------------

  describe('promoteToAdmin', () => {
    it('owner can promote member to admin', () => {
      const ch = cm.createChannel('owner', ['member1']);
      const ok = cm.promoteToAdmin(ch.id, 'owner', 'member1');
      expect(ok).toBe(true);
      expect(cm.getMember(ch.id, 'member1')?.role).toBe('admin');
    });

    it('non-owner cannot promote', () => {
      const ch = cm.createChannel('owner', ['a', 'b']);
      expect(cm.promoteToAdmin(ch.id, 'a', 'b')).toBe(false);
    });
  });

  describe('demoteToMember', () => {
    it('owner can demote admin back to member', () => {
      const ch = cm.createChannel('owner', ['admin1']);
      cm.promoteToAdmin(ch.id, 'owner', 'admin1');
      expect(cm.demoteToMember(ch.id, 'owner', 'admin1')).toBe(true);
      expect(cm.getMember(ch.id, 'admin1')?.role).toBe('member');
    });
  });

  // -------------------------------------------------------------------------
  // updateChannel
  // -------------------------------------------------------------------------

  describe('updateChannel', () => {
    it('owner can update channel name', () => {
      const ch = cm.createChannel('owner', []);
      cm.updateChannel(ch.id, 'owner', { name: 'new-name' });
      expect(cm.getChannel(ch.id)?.name).toBe('new-name');
    });

    it('emits channel:updated', () => {
      const listener = vi.fn();
      cm.on('channel:updated', listener);
      const ch = cm.createChannel('owner', []);
      cm.updateChannel(ch.id, 'owner', { isOpen: true });
      expect(listener).toHaveBeenCalledOnce();
    });

    it('non-owner cannot update', () => {
      const ch = cm.createChannel('owner', ['member1']);
      expect(cm.updateChannel(ch.id, 'member1', { name: 'hack' })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Encryption keys
  // -------------------------------------------------------------------------

  describe('encryption keys', () => {
    it('getPublicKey returns null for no-encryption channel', () => {
      const ch = cm.createChannel('owner', ['agent-b'], { encryption: 'none' });
      expect(cm.getPublicKey(ch.id, 'owner')).toBeNull();
    });

    it('setPublicKey and getPublicKey round-trip', () => {
      const ch = cm.createChannel('owner', ['agent-b'], { encryption: 'aes-256' });
      cm.setPublicKey(ch.id, 'owner', 'pub-key-hex');
      expect(cm.getPublicKey(ch.id, 'owner')).toBe('pub-key-hex');
    });

    it('getAllPublicKeys returns all registered keys', () => {
      const ch = cm.createChannel('owner', ['b'], { encryption: 'aes-256' });
      cm.setPublicKey(ch.id, 'owner', 'key-o');
      cm.setPublicKey(ch.id, 'b', 'key-b');
      const keys = cm.getAllPublicKeys(ch.id);
      expect(keys.get('owner')).toBe('key-o');
      expect(keys.get('b')).toBe('key-b');
    });
  });

  // -------------------------------------------------------------------------
  // getMembers / isMember
  // -------------------------------------------------------------------------

  describe('getMembers', () => {
    it('returns all members of the channel', () => {
      const ch = cm.createChannel('owner', ['a', 'b']);
      expect(cm.getMembers(ch.id).length).toBe(3); // owner + a + b
    });

    it('returns empty for unknown channel', () => {
      expect(cm.getMembers('ghost')).toHaveLength(0);
    });
  });

  describe('isMember', () => {
    it('returns true for existing member', () => {
      const ch = cm.createChannel('owner', ['a']);
      expect(cm.isMember(ch.id, 'owner')).toBe(true);
    });

    it('returns false for non-member', () => {
      const ch = cm.createChannel('owner', []);
      expect(cm.isMember(ch.id, 'stranger')).toBe(false);
    });

    it('returns false for unknown channel', () => {
      expect(cm.isMember('ghost', 'agent')).toBe(false);
    });
  });
});
