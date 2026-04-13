import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelManager } from '@holoscript/core';

// Mock the MessagingTypes dependency
vi.mock('../MessagingTypes', () => ({
  DEFAULT_CHANNEL_CONFIG: {
    name: '',
    encryption: 'none',
    messageSchema: null,
  },
  generateChannelId: (ownerId: string) => `ch_${ownerId}_${Date.now()}`,
}));

describe('ChannelManager', () => {
  let mgr: ChannelManager;

  beforeEach(() => {
    mgr = new ChannelManager();
  });

  // Channel Lifecycle
  it('createChannel returns channel with owner', () => {
    const ch = mgr.createChannel('alice', ['bob']);
    expect(ch.ownerId).toBe('alice');
    expect(ch.participants).toContain('alice');
    expect(ch.participants).toContain('bob');
  });

  it('getChannel retrieves created channel', () => {
    const ch = mgr.createChannel('alice', ['bob']);
    expect(mgr.getChannel(ch.id)).not.toBeNull();
  });

  it('getAllChannels lists all channels', () => {
    mgr.createChannel('alice', []);
    mgr.createChannel('bob', []);
    expect(mgr.getAllChannels().length).toBe(2);
  });

  it('closeChannel only by owner', () => {
    const ch = mgr.createChannel('alice', ['bob']);
    expect(mgr.closeChannel(ch.id, 'bob')).toBe(false);
    expect(mgr.closeChannel(ch.id, 'alice')).toBe(true);
    expect(mgr.getChannel(ch.id)).toBeNull();
  });

  it('getAgentChannels returns channels for agent', () => {
    const ch1 = mgr.createChannel('alice', ['bob']);
    mgr.createChannel('carol', []);
    expect(mgr.getAgentChannels('bob').length).toBe(1);
    expect(mgr.getAgentChannels('bob')[0].id).toBe(ch1.id);
  });

  // Membership
  it('joinChannel adds member', () => {
    const ch = mgr.createChannel('alice', [], { isOpen: true } as any);
    // Mark channel as open for joining
    mgr.updateChannel(ch.id, 'alice', { isOpen: true });
    expect(mgr.joinChannel(ch.id, 'carol')).toBe(true);
    expect(mgr.isMember(ch.id, 'carol')).toBe(true);
  });

  it('leaveChannel removes member', () => {
    const ch = mgr.createChannel('alice', ['bob']);
    expect(mgr.leaveChannel(ch.id, 'bob')).toBe(true);
    expect(mgr.isMember(ch.id, 'bob')).toBe(false);
  });

  it('owner cannot leave channel', () => {
    const ch = mgr.createChannel('alice', ['bob']);
    expect(mgr.leaveChannel(ch.id, 'alice')).toBe(false);
  });

  it('kickMember removes target', () => {
    const ch = mgr.createChannel('alice', ['bob', 'carol']);
    expect(mgr.kickMember(ch.id, 'alice', 'bob', 'disruptive')).toBe(true);
    expect(mgr.isMember(ch.id, 'bob')).toBe(false);
  });

  it('kickMember requires owner or admin', () => {
    const ch = mgr.createChannel('alice', ['bob', 'carol']);
    expect(mgr.kickMember(ch.id, 'bob', 'carol')).toBe(false); // bob is just a member
  });

  it('cannot kick owner', () => {
    const ch = mgr.createChannel('alice', ['bob']);
    mgr.promoteToAdmin(ch.id, 'alice', 'bob');
    expect(mgr.kickMember(ch.id, 'bob', 'alice')).toBe(false);
  });

  it('getMembers returns all members', () => {
    const ch = mgr.createChannel('alice', ['bob', 'carol']);
    const members = mgr.getMembers(ch.id);
    expect(members.length).toBe(3);
  });

  it('getMember returns null for non-member', () => {
    const ch = mgr.createChannel('alice', []);
    expect(mgr.getMember(ch.id, 'stranger')).toBeNull();
  });

  // Configuration
  it('updateChannel modifies name and isOpen', () => {
    const ch = mgr.createChannel('alice', []);
    expect(mgr.updateChannel(ch.id, 'alice', { name: 'General', isOpen: true })).toBe(true);
    expect(mgr.getChannel(ch.id)!.name).toBe('General');
    expect(mgr.getChannel(ch.id)!.isOpen).toBe(true);
  });

  it('updateChannel denied for non-owner', () => {
    const ch = mgr.createChannel('alice', ['bob']);
    expect(mgr.updateChannel(ch.id, 'bob', { name: 'Hacked' })).toBe(false);
  });

  // Roles
  it('promoteToAdmin and demoteToMember', () => {
    const ch = mgr.createChannel('alice', ['bob']);
    expect(mgr.promoteToAdmin(ch.id, 'alice', 'bob')).toBe(true);
    expect(mgr.getMember(ch.id, 'bob')!.role).toBe('admin');

    expect(mgr.demoteToMember(ch.id, 'alice', 'bob')).toBe(true);
    expect(mgr.getMember(ch.id, 'bob')!.role).toBe('member');
  });

  it('only owner can promote', () => {
    const ch = mgr.createChannel('alice', ['bob', 'carol']);
    expect(mgr.promoteToAdmin(ch.id, 'bob', 'carol')).toBe(false);
  });

  // Encryption Keys
  it('setPublicKey and getPublicKey', () => {
    const ch = mgr.createChannel('alice', ['bob'], { encryption: 'e2e' } as any);
    expect(mgr.setPublicKey(ch.id, 'alice', 'pk_alice')).toBe(true);
    expect(mgr.getPublicKey(ch.id, 'alice')).toBe('pk_alice');
  });

  it('getAllPublicKeys returns map of keys', () => {
    const ch = mgr.createChannel('alice', ['bob'], { encryption: 'e2e' } as any);
    mgr.setPublicKey(ch.id, 'alice', 'pk_alice');
    mgr.setPublicKey(ch.id, 'bob', 'pk_bob');
    const keys = mgr.getAllPublicKeys(ch.id);
    expect(keys.size).toBe(2);
  });

  // Events
  it('emits channel:created event', () => {
    const handler = vi.fn();
    mgr.on('channel:created', handler);
    mgr.createChannel('alice', []);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('emits member:kicked event', () => {
    const handler = vi.fn();
    mgr.on('member:kicked', handler);
    const ch = mgr.createChannel('alice', ['bob']);
    mgr.kickMember(ch.id, 'alice', 'bob', 'spam');
    expect(handler).toHaveBeenCalledWith(ch.id, 'bob', 'spam');
  });
});
