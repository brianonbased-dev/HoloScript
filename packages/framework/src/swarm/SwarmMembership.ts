/**
 * Swarm Membership
 *
 * Manages agent membership in swarms with join/leave protocol.
 */

import { QuorumPolicy, type QuorumConfig, type QuorumState } from './QuorumPolicy';

export interface MemberInfo {
  agentId: string;
  joinedAt: number;
  role: 'leader' | 'member' | 'observer';
  status: 'active' | 'inactive' | 'leaving';
  lastHeartbeat: number;
  metadata?: Record<string, unknown>;
}

export interface JoinRequest {
  agentId: string;
  requestedRole?: MemberInfo['role'];
  metadata?: Record<string, unknown>;
}

export interface LeaveRequest {
  agentId: string;
  reason?: string;
  graceful: boolean;
}

export interface MembershipEvent {
  type: 'joined' | 'left' | 'role-changed' | 'status-changed' | 'quorum-lost' | 'quorum-gained';
  agentId: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

export interface SwarmMembershipConfig {
  quorum: Partial<QuorumConfig>;
  heartbeatTimeoutMs: number;
  allowObservers: boolean;
  maxObservers: number;
  requireApprovalToJoin: boolean;
}

const DEFAULT_CONFIG: SwarmMembershipConfig = {
  quorum: {},
  heartbeatTimeoutMs: 30000,
  allowObservers: true,
  maxObservers: 10,
  requireApprovalToJoin: false,
};

type MembershipEventHandler = (event: MembershipEvent) => void;

/**
 * Manages membership for a single swarm
 */
export class SwarmMembership {
  private config: SwarmMembershipConfig;
  private members: Map<string, MemberInfo> = new Map();
  private quorumPolicy: QuorumPolicy;
  private eventHandlers: MembershipEventHandler[] = [];
  private pendingJoins: Map<string, JoinRequest> = new Map();
  private leaderId: string | null = null;

  constructor(config: Partial<SwarmMembershipConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.quorumPolicy = new QuorumPolicy(this.config.quorum);
  }

  /**
   * Request to join the swarm
   */
  join(request: JoinRequest): boolean {
    const { agentId, requestedRole = 'member', metadata } = request;

    // Check if already a member
    if (this.members.has(agentId)) {
      return true; // Already joined
    }

    // Handle observers separately
    if (requestedRole === 'observer') {
      return this.addObserver(agentId, metadata);
    }

    // Check quorum policy
    if (!this.quorumPolicy.canJoin()) {
      return false;
    }

    // If approval required, add to pending
    if (this.config.requireApprovalToJoin && this.leaderId) {
      this.pendingJoins.set(agentId, request);
      return false;
    }

    // Add member
    this.addMember(agentId, requestedRole, metadata);
    return true;
  }

  /**
   * Approve a pending join request (leader only)
   */
  approveJoin(approverId: string, agentId: string): boolean {
    if (approverId !== this.leaderId) {
      return false;
    }

    const request = this.pendingJoins.get(agentId);
    if (!request) {
      return false;
    }

    this.pendingJoins.delete(agentId);

    if (!this.quorumPolicy.canJoin()) {
      return false;
    }

    this.addMember(agentId, request.requestedRole ?? 'member', request.metadata);
    return true;
  }

  /**
   * Leave the swarm
   */
  leave(request: LeaveRequest): boolean {
    const { agentId, graceful } = request;

    const member = this.members.get(agentId);
    if (!member) {
      return false;
    }

    // Check if leaving would break quorum
    const isLeader = agentId === this.leaderId;
    const activeMembers = this.getActiveMemberCount();

    if (graceful && activeMembers <= 1) {
      // Last member, must disband
      this.removeMember(agentId, 'left');
      return true;
    }

    if (!this.quorumPolicy.canLeave() && member.role !== 'observer') {
      // Mark as leaving but don't remove yet
      member.status = 'leaving';
      this.emit({
        type: 'status-changed',
        agentId,
        timestamp: Date.now(),
        details: { newStatus: 'leaving' },
      });
      return false;
    }

    // Handle leader leaving
    if (isLeader) {
      this.electNewLeader();
    }

    this.removeMember(agentId, 'left');
    return true;
  }

  /**
   * Force remove a member (for leadership or timeouts)
   */
  removeForcefully(agentId: string, _reason: string): void {
    const member = this.members.get(agentId);
    if (!member) {
      return;
    }

    if (agentId === this.leaderId) {
      this.electNewLeader();
    }

    this.removeMember(agentId, 'left');
  }

  /**
   * Update heartbeat for a member
   */
  heartbeat(agentId: string): void {
    const member = this.members.get(agentId);
    if (member) {
      member.lastHeartbeat = Date.now();
      if (member.status === 'inactive') {
        member.status = 'active';
        this.emit({
          type: 'status-changed',
          agentId,
          timestamp: Date.now(),
          details: { newStatus: 'active' },
        });
      }
    }
  }

  /**
   * Check for timed-out members
   */
  checkTimeouts(): string[] {
    const now = Date.now();
    const timedOut: string[] = [];

    for (const [agentId, member] of this.members) {
      if (member.role === 'observer') continue;

      if (now - member.lastHeartbeat > this.config.heartbeatTimeoutMs) {
        if (member.status === 'active') {
          member.status = 'inactive';
          this.emit({
            type: 'status-changed',
            agentId,
            timestamp: now,
            details: { newStatus: 'inactive', reason: 'timeout' },
          });
        }
        timedOut.push(agentId);
      }
    }

    return timedOut;
  }

  /**
   * Change a member's role
   */
  changeRole(agentId: string, newRole: MemberInfo['role']): boolean {
    const member = this.members.get(agentId);
    if (!member) {
      return false;
    }

    const oldRole = member.role;
    member.role = newRole;

    if (newRole === 'leader') {
      if (this.leaderId && this.leaderId !== agentId) {
        const oldLeader = this.members.get(this.leaderId);
        if (oldLeader) {
          oldLeader.role = 'member';
          this.emit({
            type: 'role-changed',
            agentId: this.leaderId,
            timestamp: Date.now(),
            details: { oldRole: 'leader', newRole: 'member' },
          });
        }
      }
      this.leaderId = agentId;
    }

    this.emit({
      type: 'role-changed',
      agentId,
      timestamp: Date.now(),
      details: { oldRole, newRole },
    });

    return true;
  }

  /**
   * Get member by ID
   */
  getMember(agentId: string): MemberInfo | undefined {
    return this.members.get(agentId);
  }

  /**
   * Get all members
   */
  getMembers(): MemberInfo[] {
    return [...this.members.values()];
  }

  /**
   * Get active members (non-observers)
   */
  getActiveMembers(): MemberInfo[] {
    return this.getMembers().filter((m) => m.role !== 'observer' && m.status === 'active');
  }

  /**
   * Get the current leader
   */
  getLeader(): MemberInfo | undefined {
    return this.leaderId ? this.members.get(this.leaderId) : undefined;
  }

  /**
   * Get quorum state
   */
  getQuorumState(): QuorumState {
    return this.quorumPolicy.getState();
  }

  /**
   * Get member count
   */
  getMemberCount(): number {
    return [...this.members.values()].filter((m) => m.role !== 'observer').length;
  }

  /**
   * Subscribe to membership events
   */
  onEvent(handler: MembershipEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index !== -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Get pending join requests
   */
  getPendingJoins(): JoinRequest[] {
    return [...this.pendingJoins.values()];
  }

  private addMember(
    agentId: string,
    role: MemberInfo['role'],
    metadata?: Record<string, unknown>
  ): void {
    const now = Date.now();
    const hadQuorum = this.quorumPolicy.hasQuorum();

    this.members.set(agentId, {
      agentId,
      joinedAt: now,
      role,
      status: 'active',
      lastHeartbeat: now,
      metadata,
    });

    // Update quorum
    this.quorumPolicy.setMemberCount(this.getMemberCount());

    // Set leader if first member
    if (!this.leaderId && role !== 'observer') {
      this.leaderId = agentId;
      this.members.get(agentId)!.role = 'leader';
    }

    this.emit({
      type: 'joined',
      agentId,
      timestamp: now,
      details: { role },
    });

    // Check quorum gain
    if (!hadQuorum && this.quorumPolicy.hasQuorum()) {
      this.emit({
        type: 'quorum-gained',
        agentId,
        timestamp: now,
      });
    }
  }

  private addObserver(agentId: string, metadata?: Record<string, unknown>): boolean {
    if (!this.config.allowObservers) {
      return false;
    }

    const observerCount = [...this.members.values()].filter((m) => m.role === 'observer').length;
    if (observerCount >= this.config.maxObservers) {
      return false;
    }

    const now = Date.now();
    this.members.set(agentId, {
      agentId,
      joinedAt: now,
      role: 'observer',
      status: 'active',
      lastHeartbeat: now,
      metadata,
    });

    this.emit({
      type: 'joined',
      agentId,
      timestamp: now,
      details: { role: 'observer' },
    });

    return true;
  }

  private removeMember(agentId: string, type: 'left'): void {
    const hadQuorum = this.quorumPolicy.hasQuorum();

    this.members.delete(agentId);
    this.quorumPolicy.setMemberCount(this.getMemberCount());

    if (agentId === this.leaderId) {
      this.leaderId = null;
    }

    this.emit({
      type,
      agentId,
      timestamp: Date.now(),
    });

    // Check quorum loss
    if (hadQuorum && !this.quorumPolicy.hasQuorum()) {
      this.emit({
        type: 'quorum-lost',
        agentId,
        timestamp: Date.now(),
      });
    }
  }

  private electNewLeader(): void {
    const candidates = this.getActiveMembers().filter((m) => m.agentId !== this.leaderId);
    if (candidates.length === 0) {
      this.leaderId = null;
      return;
    }

    // Select oldest active member
    candidates.sort((a, b) => a.joinedAt - b.joinedAt);
    const newLeader = candidates[0];
    this.changeRole(newLeader.agentId, 'leader');
  }

  private getActiveMemberCount(): number {
    return [...this.members.values()].filter((m) => m.role !== 'observer' && m.status === 'active')
      .length;
  }

  private emit(event: MembershipEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }
}
