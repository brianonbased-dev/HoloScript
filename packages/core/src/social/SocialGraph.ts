/**
 * SocialGraph.ts
 *
 * Defines the core data structures for the social system.
 * Manages the local user's view of their social network.
 *
 * @module social
 */

export type UserStatus = 'online' | 'offline' | 'away' | 'busy' | 'playing';

export interface SocialUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string; // URL to avatar definition/thumbnail
  status: UserStatus;
  lastSeen: number;
  currentActivity?: string; // e.g. "Playing Hololand"
}

export type RelationshipType =
  | 'friend'
  | 'pending_incoming'
  | 'pending_outgoing'
  | 'blocked'
  | 'none';

export interface SocialRelationship {
  userId: string;
  type: RelationshipType;
  since: number; // Timestamp
}

export class SocialGraph {
  private users: Map<string, SocialUser> = new Map();
  private relationships: Map<string, SocialRelationship> = new Map();

  // Caching
  private friendsCache: SocialUser[] | null = null;
  private pendingIncomingCache: SocialUser[] | null = null;
  private pendingOutgoingCache: SocialUser[] | null = null;
  private blockedCache: SocialUser[] | null = null;

  constructor(private localUserId: string) {}

  /**
   * Add or update a known user
   */
  updateUser(user: SocialUser): void {
    const existing = this.users.get(user.id);
    if (existing) {
      Object.assign(existing, user);
    } else {
      this.users.set(user.id, user);
    }
  }

  getUser(userId: string): SocialUser | undefined {
    return this.users.get(userId);
  }

  invalidatedCaches(): void {
    this.friendsCache = null;
    this.pendingIncomingCache = null;
    this.pendingOutgoingCache = null;
    this.blockedCache = null;
  }

  setRelationship(userId: string, type: RelationshipType): void {
    const existing = this.relationships.get(userId);
    if (!existing || existing.type !== type) {
      this.relationships.set(userId, {
        userId,
        type,
        since: Date.now(),
      });
      this.invalidatedCaches();
    }
  }

  getRelationship(userId: string): RelationshipType {
    return this.relationships.get(userId)?.type || 'none';
  }

  getFriends(): SocialUser[] {
    if (!this.friendsCache) {
      this.friendsCache = Array.from(this.relationships.values())
        .filter((r) => r.type === 'friend')
        .map((r) => this.users.get(r.userId))
        .filter((u): u is SocialUser => !!u);
    }
    return this.friendsCache;
  }

  getPendingIncoming(): SocialUser[] {
    if (!this.pendingIncomingCache) {
      this.pendingIncomingCache = Array.from(this.relationships.values())
        .filter((r) => r.type === 'pending_incoming')
        .map((r) => this.users.get(r.userId))
        .filter((u): u is SocialUser => !!u);
    }
    return this.pendingIncomingCache;
  }

  getPendingOutgoing(): SocialUser[] {
    return Array.from(this.relationships.values())
      .filter((r) => r.type === 'pending_outgoing')
      .map((r) => this.users.get(r.userId))
      .filter((u): u is SocialUser => !!u);
  }

  getBlocked(): SocialUser[] {
    return Array.from(this.relationships.values())
      .filter((r) => r.type === 'blocked')
      .map((r) => this.users.get(r.userId))
      .filter((u): u is SocialUser => !!u);
  }

  removeRelationship(userId: string): void {
    if (this.relationships.has(userId)) {
      this.relationships.delete(userId);
      this.invalidatedCaches();
    }
  }
}
