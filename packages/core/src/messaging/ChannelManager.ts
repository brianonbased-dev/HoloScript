/**
 * Channel Manager
 * Sprint 4 Priority 6 - Agent Communication Channels
 *
 * Manages creation, membership, and lifecycle of agent communication channels.
 */

import { EventEmitter } from 'events';
import {
  AgentChannel,
  ChannelConfig,
  ChannelMember,
  DEFAULT_CHANNEL_CONFIG,
  generateChannelId,
} from './MessagingTypes';

// =============================================================================
// CHANNEL MANAGER EVENTS
// =============================================================================

export interface ChannelManagerEvents {
  'channel:created': (channel: AgentChannel) => void;
  'channel:closed': (channelId: string) => void;
  'channel:updated': (channel: AgentChannel) => void;
  'member:joined': (channelId: string, agentId: string) => void;
  'member:left': (channelId: string, agentId: string) => void;
  'member:kicked': (channelId: string, agentId: string, reason: string) => void;
}

// =============================================================================
// CHANNEL STATE
// =============================================================================

interface ChannelState {
  channel: AgentChannel;
  members: Map<string, ChannelMember>;
  encryptionKeys?: Map<string, string>; // agentId -> publicKey
}

// =============================================================================
// CHANNEL MANAGER
// =============================================================================

/**
 * Manages agent communication channels
 */
export class ChannelManager extends EventEmitter {
  private channels: Map<string, ChannelState> = new Map();
  private agentChannels: Map<string, Set<string>> = new Map(); // agentId -> channelIds

  constructor() {
    super();
  }

  // ===========================================================================
  // CHANNEL LIFECYCLE
  // ===========================================================================

  /**
   * Create a new channel
   */
  createChannel(
    ownerId: string,
    participants: string[],
    config: Partial<ChannelConfig> = {}
  ): AgentChannel {
    const channelId = generateChannelId(ownerId);
    const fullConfig = { ...DEFAULT_CHANNEL_CONFIG, ...config };

    const channel: AgentChannel = {
      id: channelId,
      name: fullConfig.name || channelId,
      participants: [ownerId, ...participants.filter((p) => p !== ownerId)],
      ownerId,
      encryption: fullConfig.encryption,
      messageSchema: fullConfig.messageSchema,
      config: fullConfig,
      createdAt: Date.now(),
      isOpen: false,
    };

    // Initialize channel state
    const members = new Map<string, ChannelMember>();

    // Add owner as first member
    members.set(ownerId, {
      agentId: ownerId,
      joinedAt: Date.now(),
      role: 'owner',
    });

    // Add other participants
    for (const participantId of participants) {
      if (participantId !== ownerId) {
        members.set(participantId, {
          agentId: participantId,
          joinedAt: Date.now(),
          role: 'member',
        });
      }
    }

    const state: ChannelState = {
      channel,
      members,
    };

    // Initialize encryption keys map if needed
    if (channel.encryption !== 'none') {
      state.encryptionKeys = new Map();
    }

    this.channels.set(channelId, state);

    // Track channel membership for each agent
    for (const agentId of channel.participants) {
      this.addAgentToChannel(agentId, channelId);
    }

    this.emit('channel:created', channel);
    return channel;
  }

  /**
   * Close a channel
   */
  closeChannel(channelId: string, requesterId: string): boolean {
    const state = this.channels.get(channelId);
    if (!state) return false;

    // Only owner can close
    if (state.channel.ownerId !== requesterId) {
      return false;
    }

    // Remove all members
    for (const agentId of state.channel.participants) {
      this.removeAgentFromChannel(agentId, channelId);
    }

    this.channels.delete(channelId);
    this.emit('channel:closed', channelId);
    return true;
  }

  /**
   * Get a channel by ID
   */
  getChannel(channelId: string): AgentChannel | null {
    const state = this.channels.get(channelId);
    return state?.channel || null;
  }

  /**
   * Get all channels
   */
  getAllChannels(): AgentChannel[] {
    return Array.from(this.channels.values()).map((s) => s.channel);
  }

  /**
   * Get channels for an agent
   */
  getAgentChannels(agentId: string): AgentChannel[] {
    const channelIds = this.agentChannels.get(agentId);
    if (!channelIds) return [];

    const channels: AgentChannel[] = [];
    for (const channelId of channelIds) {
      const state = this.channels.get(channelId);
      if (state) {
        channels.push(state.channel);
      }
    }
    return channels;
  }

  // ===========================================================================
  // MEMBERSHIP MANAGEMENT
  // ===========================================================================

  /**
   * Join a channel
   */
  joinChannel(channelId: string, agentId: string, publicKey?: string): boolean {
    const state = this.channels.get(channelId);
    if (!state) return false;

    // Check if already member
    if (state.members.has(agentId)) {
      return true; // Already a member
    }

    // Check if channel is open
    if (!state.channel.isOpen) {
      // Only allowed if in participants list
      if (!state.channel.participants.includes(agentId)) {
        return false;
      }
    }

    // Add member
    const member: ChannelMember = {
      agentId,
      joinedAt: Date.now(),
      role: 'member',
      publicKey,
    };

    state.members.set(agentId, member);

    // Store public key if provided
    if (publicKey && state.encryptionKeys) {
      state.encryptionKeys.set(agentId, publicKey);
    }

    // Update participants list
    if (!state.channel.participants.includes(agentId)) {
      state.channel.participants.push(agentId);
    }

    this.addAgentToChannel(agentId, channelId);
    this.emit('member:joined', channelId, agentId);
    return true;
  }

  /**
   * Leave a channel
   */
  leaveChannel(channelId: string, agentId: string): boolean {
    const state = this.channels.get(channelId);
    if (!state) return false;

    // Owner cannot leave (must close channel)
    if (state.channel.ownerId === agentId) {
      return false;
    }

    if (!state.members.has(agentId)) {
      return false;
    }

    state.members.delete(agentId);
    state.encryptionKeys?.delete(agentId);

    // Update participants list
    const idx = state.channel.participants.indexOf(agentId);
    if (idx >= 0) {
      state.channel.participants.splice(idx, 1);
    }

    this.removeAgentFromChannel(agentId, channelId);
    this.emit('member:left', channelId, agentId);
    return true;
  }

  /**
   * Kick a member from channel
   */
  kickMember(
    channelId: string,
    requesterId: string,
    targetId: string,
    reason: string = ''
  ): boolean {
    const state = this.channels.get(channelId);
    if (!state) return false;

    // Check permissions (owner or admin can kick)
    const requester = state.members.get(requesterId);
    if (!requester || (requester.role !== 'owner' && requester.role !== 'admin')) {
      return false;
    }

    // Cannot kick owner
    if (targetId === state.channel.ownerId) {
      return false;
    }

    if (!state.members.has(targetId)) {
      return false;
    }

    state.members.delete(targetId);
    state.encryptionKeys?.delete(targetId);

    // Update participants list
    const idx = state.channel.participants.indexOf(targetId);
    if (idx >= 0) {
      state.channel.participants.splice(idx, 1);
    }

    this.removeAgentFromChannel(targetId, channelId);
    this.emit('member:kicked', channelId, targetId, reason);
    return true;
  }

  /**
   * Get members of a channel
   */
  getMembers(channelId: string): ChannelMember[] {
    const state = this.channels.get(channelId);
    if (!state) return [];
    return Array.from(state.members.values());
  }

  /**
   * Check if agent is member of channel
   */
  isMember(channelId: string, agentId: string): boolean {
    const state = this.channels.get(channelId);
    if (!state) return false;
    return state.members.has(agentId);
  }

  /**
   * Get member info
   */
  getMember(channelId: string, agentId: string): ChannelMember | null {
    const state = this.channels.get(channelId);
    if (!state) return null;
    return state.members.get(agentId) || null;
  }

  // ===========================================================================
  // CHANNEL CONFIGURATION
  // ===========================================================================

  /**
   * Update channel configuration
   */
  updateChannel(
    channelId: string,
    requesterId: string,
    updates: Partial<Pick<AgentChannel, 'name' | 'isOpen' | 'messageSchema'>>
  ): boolean {
    const state = this.channels.get(channelId);
    if (!state) return false;

    // Only owner can update
    if (state.channel.ownerId !== requesterId) {
      return false;
    }

    if (updates.name !== undefined) {
      state.channel.name = updates.name;
    }
    if (updates.isOpen !== undefined) {
      state.channel.isOpen = updates.isOpen;
    }
    if (updates.messageSchema !== undefined) {
      state.channel.messageSchema = updates.messageSchema;
    }

    this.emit('channel:updated', state.channel);
    return true;
  }

  /**
   * Promote member to admin
   */
  promoteToAdmin(channelId: string, requesterId: string, targetId: string): boolean {
    const state = this.channels.get(channelId);
    if (!state) return false;

    // Only owner can promote
    if (state.channel.ownerId !== requesterId) {
      return false;
    }

    const member = state.members.get(targetId);
    if (!member) return false;

    member.role = 'admin';
    return true;
  }

  /**
   * Demote admin to member
   */
  demoteToMember(channelId: string, requesterId: string, targetId: string): boolean {
    const state = this.channels.get(channelId);
    if (!state) return false;

    // Only owner can demote
    if (state.channel.ownerId !== requesterId) {
      return false;
    }

    const member = state.members.get(targetId);
    if (!member || member.role === 'owner') return false;

    member.role = 'member';
    return true;
  }

  // ===========================================================================
  // ENCRYPTION KEY MANAGEMENT
  // ===========================================================================

  /**
   * Get public key for agent in channel
   */
  getPublicKey(channelId: string, agentId: string): string | null {
    const state = this.channels.get(channelId);
    if (!state || !state.encryptionKeys) return null;
    return state.encryptionKeys.get(agentId) || null;
  }

  /**
   * Set public key for agent in channel
   */
  setPublicKey(channelId: string, agentId: string, publicKey: string): boolean {
    const state = this.channels.get(channelId);
    if (!state) return false;

    if (!state.members.has(agentId)) return false;

    if (!state.encryptionKeys) {
      state.encryptionKeys = new Map();
    }

    state.encryptionKeys.set(agentId, publicKey);
    const member = state.members.get(agentId);
    if (member) {
      member.publicKey = publicKey;
    }

    return true;
  }

  /**
   * Get all public keys for channel
   */
  getAllPublicKeys(channelId: string): Map<string, string> {
    const state = this.channels.get(channelId);
    if (!state || !state.encryptionKeys) {
      return new Map();
    }
    return new Map(state.encryptionKeys);
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private addAgentToChannel(agentId: string, channelId: string): void {
    let channels = this.agentChannels.get(agentId);
    if (!channels) {
      channels = new Set();
      this.agentChannels.set(agentId, channels);
    }
    channels.add(channelId);
  }

  private removeAgentFromChannel(agentId: string, channelId: string): void {
    const channels = this.agentChannels.get(agentId);
    if (channels) {
      channels.delete(channelId);
      if (channels.size === 0) {
        this.agentChannels.delete(agentId);
      }
    }
  }
}
