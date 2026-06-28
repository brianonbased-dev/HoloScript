import { describe, expect, it } from 'vitest';
import {
  FallbackStateStoreBackend,
  type StateStoreBackend,
} from '../state-store';
import {
  InviteStore,
  type InviteRecord,
  type InviteStoreBackend,
} from '../invite-store';
import {
  PlayerStore,
  type PlayerStoreBackend,
  type StoredPlayer,
} from '../player-store';
import {
  GeoAnchorStore,
  type GeoAnchorStoreBackend,
  type StoredGeoAnchor,
} from '../geo-anchor-store';

class FailingStateBackend implements StateStoreBackend {
  async get(): Promise<unknown | undefined> {
    throw new Error('postgres unavailable');
  }
  async set(): Promise<void> {
    throw new Error('postgres unavailable');
  }
  async append(): Promise<void> {
    throw new Error('postgres unavailable');
  }
  async getAll(): Promise<unknown[]> {
    throw new Error('postgres unavailable');
  }
  async listHandles(): Promise<string[]> {
    throw new Error('postgres unavailable');
  }
  async delete(): Promise<void> {
    throw new Error('postgres unavailable');
  }
}

class FailingInviteBackend implements InviteStoreBackend {
  async get(): Promise<InviteRecord | undefined> {
    throw new Error('postgres unavailable');
  }
  async set(): Promise<void> {
    throw new Error('postgres unavailable');
  }
  async listByAgent(): Promise<InviteRecord[]> {
    throw new Error('postgres unavailable');
  }
}

class PlayerBackendWithFailingLoad implements PlayerStoreBackend {
  private readonly store = new Map<string, StoredPlayer>();
  async get(playerId: string): Promise<StoredPlayer | undefined> {
    return this.store.get(playerId);
  }
  async set(playerId: string, player: StoredPlayer): Promise<void> {
    this.store.set(playerId, player);
  }
  async delete(playerId: string): Promise<void> {
    this.store.delete(playerId);
  }
  async getAll(): Promise<Map<string, StoredPlayer>> {
    throw new Error('postgres unavailable');
  }
}

class GeoBackendWithFailingLoad implements GeoAnchorStoreBackend {
  async get(): Promise<StoredGeoAnchor | undefined> {
    return undefined;
  }
  async set(): Promise<void> {
    return undefined;
  }
  async delete(): Promise<void> {
    return undefined;
  }
  async clear(): Promise<void> {
    return undefined;
  }
  async getAll(): Promise<Map<string, StoredGeoAnchor>> {
    throw new Error('postgres unavailable');
  }
}

function makeInvite(): InviteRecord {
  return {
    token: 'invite_fallback',
    agentId: 'agent_fallback',
    agentName: 'Fallback Agent',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    createdAt: new Date().toISOString(),
  };
}

function makePlayer(): StoredPlayer {
  return {
    id: 'player_fallback',
    name: 'Fallback Player',
    status: 'active',
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  };
}

function makeAnchor(): StoredGeoAnchor {
  return {
    id: 'anchor_fallback',
    lat: 33.4484,
    lng: -112.074,
    radius: 10,
    persistent: false,
    safety: {
      targetingUseProhibited: true,
      humanApprovalRequiredForActuation: true,
      permittedUses: ['visualization'],
      prohibitedUses: ['targeting'],
      doctrine: 'D.044',
    },
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  };
}

describe('HoloMesh Postgres-backed store fallbacks', () => {
  it('state store retries against memory after a Postgres operation fails', async () => {
    const store = new FallbackStateStoreBackend(new FailingStateBackend());

    await store.append('audit', 'agent_fallback', { ok: true });

    expect(store.usesPostgres).toBe(false);
    await expect(store.getAll('audit', 'agent_fallback')).resolves.toEqual([{ ok: true }]);
  });

  it('invite store retries a write against memory after Postgres fails', async () => {
    const store = new InviteStore(new FailingInviteBackend(), true);
    const invite = makeInvite();

    await store.set(invite);

    expect(store.usesPostgres).toBe(false);
    await expect(store.get(invite.token)).resolves.toEqual(invite);
  });

  it('player store preserves cached players when load demotes to memory', async () => {
    const store = new PlayerStore(new PlayerBackendWithFailingLoad(), true);
    const player = makePlayer();
    store.set(player.id, player);

    await store.loadAll();

    expect(store.usesPostgres).toBe(false);
    expect(store.get(player.id)).toEqual(player);
  });

  it('geo anchor store preserves local anchors when load demotes to memory', async () => {
    const store = new GeoAnchorStore(new GeoBackendWithFailingLoad(), true);
    const anchor = makeAnchor();
    store.setLocal(anchor.id, anchor);

    await store.loadAll();

    expect(store.usesPostgres).toBe(false);
    expect(store.get(anchor.id)).toEqual(anchor);
  });
});
