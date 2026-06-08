import { describe, it, expect } from 'vitest';

import {
  PORTAL_ENTRY_RECEIPT_SCHEMA_VERSION,
  buildPortalEntryReceipt,
  validatePortalEntryReceipt,
  isPortalEntryReceipt,
  defaultRepresentationLaneFor,
  defaultAcceptedFormatsFor,
  generatePortalEntryId,
} from './index';

import type { PortalEntryReceipt, PortalEntrantKind, PortalRepresentationLane } from './index';

import type { HoloTunnelSharePacket } from '../holo-tunnel/index';

function buildSharePacket(overrides: Partial<HoloTunnelSharePacket> = {}): HoloTunnelSharePacket {
  return {
    schemaVersion: 'holoscript.holotunnel.share-packet.v1',
    worldId: 'world-test',
    sessionName: 'Test Session',
    stableUrl: 'https://relay.example/live',
    directUrl: 'https://relay.example/t/test',
    createdBy: 'holoscript',
    ...overrides,
  };
}

function buildReceipt(overrides: Partial<PortalEntryReceipt> = {}): PortalEntryReceipt {
  const now = '2026-05-22T08:00:00.000Z';
  return buildPortalEntryReceipt({
    sharePacket: buildSharePacket(),
    entrant: {
      agentId: 'agent_test_001',
      displayName: 'Test Agent',
      surfaceKind: 'agent-semantic',
      a2aAgentCardRef: 'https://example.com/a2a/agent_test_001',
    },
    representation: {
      lane: 'semantic-state',
      acceptedFormats: ['scene-graph+trait-delta'],
    },
    scopesGranted: {
      spatial: ['read'],
      toolScopeIds: ['scope:world:read'],
      worldId: 'world-test',
    },
    worldStateAnchors: {
      entrySnapshotHash: 'sha256:abcdef1234567890',
      rewindAvailable: true,
    },
    provenance: {
      tunnelId: 'tunnel_test_001',
      worldId: 'world-test',
      commit: 'abc1234',
    },
    overallStatus: 'admitted',
    now,
    ...overrides,
  });
}

// ── TRUE CASES ────────────────────────────────────────────────────────────────────

describe('validatePortalEntryReceipt', () => {
  it('TRUE case: accepts complete agent-semantic entry receipt', () => {
    const receipt = buildReceipt();
    const result = validatePortalEntryReceipt(receipt);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('TRUE case: accepts human-headset entry with pixel-stream lane', () => {
    const receipt = buildReceipt({
      entrant: {
        agentId: 'human_session_001',
        displayName: 'Quest 3 User',
        surfaceKind: 'human-headset',
      },
      representation: {
        lane: 'pixel-stream',
        acceptedFormats: ['webxr-frame'],
        negotiatedAt: '2026-05-22T08:00:00.000Z',
      },
      overallStatus: 'admitted',
    } as Partial<PortalEntryReceipt>);
    const result = validatePortalEntryReceipt(receipt);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('TRUE case: accepts denied entry receipt', () => {
    const receipt = buildReceipt({ overallStatus: 'denied' });
    const result = validatePortalEntryReceipt(receipt);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('TRUE case: accepts evicted entry receipt', () => {
    const receipt = buildReceipt({ overallStatus: 'evicted' });
    const result = validatePortalEntryReceipt(receipt);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('TRUE case: accepts receipt with exit anchors (completed session)', () => {
    const receipt = buildReceipt({
      worldStateAnchors: {
        entrySnapshotHash: 'sha256:abcdef1234567890',
        exitSnapshotHash: 'sha256:fedcba0987654321',
        entryTimestamp: '2026-05-22T08:00:00.000Z',
        exitTimestamp: '2026-05-22T09:00:00.000Z',
        rewindAvailable: true,
      },
    } as Partial<PortalEntryReceipt>);
    const result = validatePortalEntryReceipt(receipt);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('TRUE case: accepts receipt with optional zoneId in provenance', () => {
    const receipt = buildReceipt({
      provenance: {
        tunnelId: 'tunnel_test_001',
        worldId: 'world-test',
        zoneId: 'zone-alpha',
      },
    } as Partial<PortalEntryReceipt>);
    const result = validatePortalEntryReceipt(receipt);
    expect(result).toEqual({ valid: true, errors: [] });
  });
});

// ── FALSE CASES (F.043: test the false case — actually) ─────────────────────────────

describe('validatePortalEntryReceipt FALSE cases', () => {
  it('FALSE case: rejects non-object input', () => {
    const result = validatePortalEntryReceipt(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Portal entry receipt must be an object');
  });

  it('FALSE case: rejects wrong schemaVersion', () => {
    const receipt = buildReceipt();
    const bad = { ...receipt, schemaVersion: 'wrong-version' };
    const result = validatePortalEntryReceipt(bad);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([`schemaVersion must be ${PORTAL_ENTRY_RECEIPT_SCHEMA_VERSION}`])
    );
  });

  it('FALSE case: rejects missing entrant', () => {
    const { entrant, ...bad } = buildReceipt();
    const result = validatePortalEntryReceipt(bad);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['Missing receipt.entrant']));
  });

  it('FALSE case: rejects missing entrant.agentId', () => {
    const receipt = buildReceipt({
      entrant: { surfaceKind: 'agent-semantic', a2aAgentCardRef: 'https://x.com' } as any,
    });
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['Missing entrant.agentId']));
  });

  it('FALSE case: rejects invalid entrant.surfaceKind', () => {
    const receipt = buildReceipt({
      entrant: { agentId: 'a1', surfaceKind: 'robot-alien' } as any,
    });
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('entrant.surfaceKind must be one of')])
    );
  });

  it('FALSE case: rejects agent entry without a2aAgentCardRef', () => {
    const receipt = buildReceipt({
      entrant: {
        agentId: 'a1',
        surfaceKind: 'agent-semantic',
        // no a2aAgentCardRef
      } as any,
    });
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['entrant.a2aAgentCardRef is required for agent entries'])
    );
  });

  it('FALSE case: rejects agent-pixel entry without a2aAgentCardRef', () => {
    const receipt = buildReceipt({
      entrant: {
        agentId: 'a1',
        surfaceKind: 'agent-pixel',
      } as any,
    });
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['entrant.a2aAgentCardRef is required for agent entries'])
    );
  });

  it('FALSE case: rejects missing representation', () => {
    const { representation, ...bad } = buildReceipt();
    const result = validatePortalEntryReceipt(bad);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['Missing receipt.representation']));
  });

  it('FALSE case: rejects invalid representation.lane', () => {
    const receipt = buildReceipt({
      representation: {
        lane: 'hologram',
        acceptedFormats: ['scene-graph+trait-delta'],
        negotiatedAt: '2026-05-22T08:00:00.000Z',
      } as any,
    });
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('representation.lane must be one of')])
    );
  });

  it('FALSE case: rejects empty acceptedFormats', () => {
    const receipt = buildReceipt({
      representation: {
        lane: 'semantic-state',
        acceptedFormats: [],
        negotiatedAt: '2026-05-22T08:00:00.000Z',
      },
    } as Partial<PortalEntryReceipt>);
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['representation.acceptedFormats must include at least one format'])
    );
  });

  it('FALSE case: rejects invalid negotiatedAt timestamp', () => {
    const receipt = buildReceipt({
      representation: {
        lane: 'semantic-state',
        acceptedFormats: ['scene-graph+trait-delta'],
        negotiatedAt: 'not-a-date',
      } as any,
    });
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['representation.negotiatedAt must be a valid ISO 8601 timestamp'])
    );
  });

  it('FALSE case: rejects empty spatial scopes', () => {
    const receipt = buildReceipt({
      scopesGranted: {
        spatial: [],
        toolScopeIds: ['scope:world:read'],
        worldId: 'world-test',
        grantedAt: '2026-05-22T08:00:00.000Z',
      },
    } as Partial<PortalEntryReceipt>);
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['scopesGranted.spatial must include at least one permission'])
    );
  });

  it('FALSE case: rejects invalid spatial permission', () => {
    const receipt = buildReceipt({
      scopesGranted: {
        spatial: ['delete'],
        toolScopeIds: [],
        worldId: 'world-test',
        grantedAt: '2026-05-22T08:00:00.000Z',
      } as any,
    });
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('scopesGranted.spatial[0] must be one of')])
    );
  });

  it('FALSE case: rejects missing worldStateAnchors.entrySnapshotHash', () => {
    const receipt = buildReceipt({
      worldStateAnchors: {
        entryTimestamp: '2026-05-22T08:00:00.000Z',
        rewindAvailable: true,
      } as any,
    });
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining(['Missing worldStateAnchors.entrySnapshotHash'])
    );
  });

  it('FALSE case: rejects exit hash without exit timestamp', () => {
    const receipt = buildReceipt({
      worldStateAnchors: {
        entrySnapshotHash: 'sha256:abc',
        exitSnapshotHash: 'sha256:def',
        entryTimestamp: '2026-05-22T08:00:00.000Z',
        // no exitTimestamp
        rewindAvailable: true,
      },
    } as Partial<PortalEntryReceipt>);
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'worldStateAnchors.exitTimestamp is required when exitSnapshotHash is present',
      ])
    );
  });

  it('FALSE case: rejects exit timestamp without exit hash', () => {
    const receipt = buildReceipt({
      worldStateAnchors: {
        entrySnapshotHash: 'sha256:abc',
        entryTimestamp: '2026-05-22T08:00:00.000Z',
        exitTimestamp: '2026-05-22T09:00:00.000Z',
        // no exitSnapshotHash
        rewindAvailable: true,
      },
    } as Partial<PortalEntryReceipt>);
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'worldStateAnchors.exitSnapshotHash is required when exitTimestamp is present',
      ])
    );
  });

  it('FALSE case: rejects missing provenance', () => {
    const { provenance, ...bad } = buildReceipt();
    const result = validatePortalEntryReceipt(bad);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['Missing receipt.provenance']));
  });

  it('FALSE case: rejects invalid overallStatus', () => {
    const receipt = buildReceipt({ overallStatus: 'maybe' } as any);
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('overallStatus must be one of')])
    );
  });

  it('FALSE case: cross-field: agent-semantic must not get pixel-stream', () => {
    const receipt = buildReceipt({
      entrant: {
        agentId: 'a1',
        surfaceKind: 'agent-semantic',
        a2aAgentCardRef: 'https://x.com',
      },
      representation: {
        lane: 'pixel-stream',
        acceptedFormats: ['webxr-frame'],
        negotiatedAt: '2026-05-22T08:00:00.000Z',
      },
    } as Partial<PortalEntryReceipt>);
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'agent-semantic entrant must receive semantic-state representation lane',
      ])
    );
  });

  it('FALSE case: cross-field: human-headset must not get semantic-state', () => {
    const receipt = buildReceipt({
      entrant: {
        agentId: 'h1',
        surfaceKind: 'human-headset',
      },
      representation: {
        lane: 'semantic-state',
        acceptedFormats: ['scene-graph+trait-delta'],
        negotiatedAt: '2026-05-22T08:00:00.000Z',
      },
    } as Partial<PortalEntryReceipt>);
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'human-headset entrant must receive pixel-stream representation lane',
      ])
    );
  });

  it('FALSE case: rejects missing sharePacket', () => {
    const { sharePacket, ...bad } = buildReceipt();
    const result = validatePortalEntryReceipt(bad);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining(['Missing receipt.sharePacket']));
  });

  it('FALSE case: rejects sharePacket with wrong schemaVersion', () => {
    const receipt = buildReceipt({
      sharePacket: buildSharePacket({
        schemaVersion: 'wrong-version' as any,
      }),
    });
    const result = validatePortalEntryReceipt(receipt);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'sharePacket.schemaVersion must be holoscript.holotunnel.share-packet.v1',
      ])
    );
  });

  it('FALSE case: multiple simultaneous errors', () => {
    const result = validatePortalEntryReceipt({
      schemaVersion: 'wrong',
    });
    expect(result.valid).toBe(false);
    // Should have many errors, not just one
    expect(result.errors.length).toBeGreaterThan(3);
  });
});

// ── TYPE GUARD ──────────────────────────────────────────────────────────────────────

describe('isPortalEntryReceipt', () => {
  it('narrows valid receipt', () => {
    const receipt = buildReceipt();
    expect(isPortalEntryReceipt(receipt)).toBe(true);
  });

  it('rejects non-object', () => {
    expect(isPortalEntryReceipt(null)).toBe(false);
  });

  it('rejects receipt with wrong schema', () => {
    expect(isPortalEntryReceipt({ schemaVersion: 'wrong' })).toBe(false);
  });
});

// ── BUILDER ──────────────────────────────────────────────────────────────────────────

describe('buildPortalEntryReceipt', () => {
  it('builds a valid receipt with defaults', () => {
    const receipt = buildReceipt();
    expect(receipt.schemaVersion).toBe(PORTAL_ENTRY_RECEIPT_SCHEMA_VERSION);
    expect(receipt.generatedBy).toBe('@holoscript/hololand-platform/portal-entry');
    expect(receipt.receiptId).toMatch(/^pentry_[0-9a-f]{16}$/);
    expect(receipt.overallStatus).toBe('admitted');
    expect(validatePortalEntryReceipt(receipt)).toEqual({ valid: true, errors: [] });
  });

  it('generates deterministic receipt ID from content', () => {
    const a = buildReceipt();
    const b = buildReceipt();
    // Same options → same receipt ID
    expect(a.receiptId).toBe(b.receiptId);
  });

  it('generates different receipt IDs for different content', () => {
    const a = buildReceipt();
    const b = buildReceipt({
      entrant: {
        agentId: 'different_agent',
        surfaceKind: 'agent-semantic',
        a2aAgentCardRef: 'https://x.com/diff',
      },
    } as any);
    expect(a.receiptId).not.toBe(b.receiptId);
  });

  it('defaults timestamps to now when not specified', () => {
    const receipt = buildPortalEntryReceipt({
      sharePacket: buildSharePacket(),
      entrant: {
        agentId: 'a1',
        surfaceKind: 'agent-semantic',
        a2aAgentCardRef: 'https://x.com',
      },
      representation: {
        lane: 'semantic-state',
        acceptedFormats: ['scene-graph+trait-delta'],
      },
      scopesGranted: {
        spatial: ['read'],
        toolScopeIds: [],
        worldId: 'w1',
      },
      worldStateAnchors: {
        entrySnapshotHash: 'sha256:abc',
        rewindAvailable: true,
      },
      provenance: {
        tunnelId: 't1',
        worldId: 'w1',
      },
    });
    // All timestamps should be set
    expect(receipt.representation.negotiatedAt).toBeTruthy();
    expect(receipt.scopesGranted.grantedAt).toBeTruthy();
    expect(receipt.worldStateAnchors.entryTimestamp).toBeTruthy();
    expect(receipt.createdAt).toBeTruthy();
  });
});

// ── HELPERS ───────────────────────────────────────────────────────────────────────────

describe('defaultRepresentationLaneFor', () => {
  it('returns semantic-state for agent-semantic', () => {
    expect(defaultRepresentationLaneFor('agent-semantic')).toBe('semantic-state');
  });

  it('returns semantic-state for agent-pixel', () => {
    expect(defaultRepresentationLaneFor('agent-pixel')).toBe('semantic-state');
  });

  it('returns pixel-stream for human-headset', () => {
    expect(defaultRepresentationLaneFor('human-headset')).toBe('pixel-stream');
  });

  it('returns pixel-stream for human-browser', () => {
    expect(defaultRepresentationLaneFor('human-browser')).toBe('pixel-stream');
  });
});

describe('defaultAcceptedFormatsFor', () => {
  it('returns semantic formats for semantic-state lane', () => {
    const formats = defaultAcceptedFormatsFor('semantic-state');
    expect(formats).toContain('scene-graph+trait-delta');
  });

  it('returns pixel formats for pixel-stream lane', () => {
    const formats = defaultAcceptedFormatsFor('pixel-stream');
    expect(formats).toContain('webxr-frame');
  });
});

describe('generatePortalEntryId', () => {
  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generatePortalEntryId()));
    expect(ids.size).toBe(20);
  });

  it('uses pentry_ prefix', () => {
    expect(generatePortalEntryId()).toMatch(/^pentry_/);
  });
});
