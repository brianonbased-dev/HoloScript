/**
 * EntityAuthority.ts
 *
 * Authority management for networked entities.
 * Handles ownership, authority transfer, and access control.
 *
 * @module multiplayer
 */

// =============================================================================
// TYPES
// =============================================================================

export type AuthorityLevel = 'owner' | 'shared' | 'server' | 'none';

export interface AuthorityRecord {
  entityId: string;
  ownerId: string; // Player/client who owns this entity
  authorityLevel: AuthorityLevel;
  transferable: boolean;
  lastTransferTime: number; // Timestamp
  lockExpiry: number; // Lock expiration (0 = no lock)
}

export interface TransferRequest {
  id: string;
  entityId: string;
  requesterId: string;
  fromOwnerId: string;
  reason: 'interaction' | 'proximity' | 'force' | 'timeout';
  timestamp: number;
  status: 'pending' | 'approved' | 'denied';
}

// =============================================================================
// ENTITY AUTHORITY MANAGER
// =============================================================================

export class EntityAuthority {
  private authorities: Map<string, AuthorityRecord> = new Map();
  private transferRequests: TransferRequest[] = [];
  private localPlayerId: string;
  private requestCounter = 0;

  constructor(localPlayerId: string) {
    this.localPlayerId = localPlayerId;
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  register(
    entityId: string,
    ownerId: string,
    options: Partial<{
      authorityLevel: AuthorityLevel;
      transferable: boolean;
    }> = {}
  ): AuthorityRecord {
    const record: AuthorityRecord = {
      entityId,
      ownerId,
      authorityLevel: options.authorityLevel ?? 'owner',
      transferable: options.transferable ?? true,
      lastTransferTime: Date.now(),
      lockExpiry: 0,
    };
    this.authorities.set(entityId, record);
    return record;
  }

  unregister(entityId: string): boolean {
    return this.authorities.delete(entityId);
  }

  // ---------------------------------------------------------------------------
  // Authority Queries
  // ---------------------------------------------------------------------------

  getOwner(entityId: string): string | undefined {
    return this.authorities.get(entityId)?.ownerId;
  }

  getAuthority(entityId: string): AuthorityRecord | undefined {
    return this.authorities.get(entityId);
  }

  isLocalOwner(entityId: string): boolean {
    return this.authorities.get(entityId)?.ownerId === this.localPlayerId;
  }

  hasWriteAccess(entityId: string, playerId: string): boolean {
    const record = this.authorities.get(entityId);
    if (!record) return false;
    if (record.ownerId === playerId) return true;
    if (record.authorityLevel === 'shared') return true;
    if (record.authorityLevel === 'server' && playerId === 'server') return true;
    return false;
  }

  getOwnedEntities(playerId: string): string[] {
    const result: string[] = [];
    for (const [entityId, record] of this.authorities) {
      if (record.ownerId === playerId) result.push(entityId);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Authority Transfer
  // ---------------------------------------------------------------------------

  requestTransfer(
    entityId: string,
    reason: TransferRequest['reason'] = 'interaction'
  ): TransferRequest | null {
    const record = this.authorities.get(entityId);
    if (!record) return null;
    if (!record.transferable) return null;
    if (record.ownerId === this.localPlayerId) return null; // Already own it

    // Check lock
    if (record.lockExpiry > Date.now()) return null;

    const request: TransferRequest = {
      id: `tr_${this.requestCounter++}`,
      entityId,
      requesterId: this.localPlayerId,
      fromOwnerId: record.ownerId,
      reason,
      timestamp: Date.now(),
      status: 'pending',
    };

    this.transferRequests.push(request);
    return request;
  }

  approveTransfer(requestId: string): boolean {
    const request = this.transferRequests.find((r) => r.id === requestId);
    if (!request || request.status !== 'pending') return false;

    const record = this.authorities.get(request.entityId);
    if (!record) return false;

    record.ownerId = request.requesterId;
    record.lastTransferTime = Date.now();
    request.status = 'approved';
    return true;
  }

  denyTransfer(requestId: string): boolean {
    const request = this.transferRequests.find((r) => r.id === requestId);
    if (!request || request.status !== 'pending') return false;
    request.status = 'denied';
    return true;
  }

  forceTransfer(entityId: string, newOwnerId: string): boolean {
    const record = this.authorities.get(entityId);
    if (!record) return false;
    record.ownerId = newOwnerId;
    record.lastTransferTime = Date.now();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Locking
  // ---------------------------------------------------------------------------

  lockEntity(entityId: string, durationMs: number): boolean {
    const record = this.authorities.get(entityId);
    if (!record) return false;
    record.lockExpiry = Date.now() + durationMs;
    return true;
  }

  unlockEntity(entityId: string): boolean {
    const record = this.authorities.get(entityId);
    if (!record) return false;
    record.lockExpiry = 0;
    return true;
  }

  isLocked(entityId: string): boolean {
    const record = this.authorities.get(entityId);
    return record ? record.lockExpiry > Date.now() : false;
  }

  // ---------------------------------------------------------------------------
  // Pending Requests
  // ---------------------------------------------------------------------------

  getPendingRequests(forPlayerId?: string): TransferRequest[] {
    return this.transferRequests.filter((r) => {
      if (r.status !== 'pending') return false;
      if (forPlayerId) return r.fromOwnerId === forPlayerId;
      return true;
    });
  }

  clearCompletedRequests(): void {
    this.transferRequests = this.transferRequests.filter((r) => r.status === 'pending');
  }
}
