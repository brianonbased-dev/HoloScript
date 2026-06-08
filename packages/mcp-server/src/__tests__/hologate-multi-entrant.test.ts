/**
 * HoloGate Multi-Entrant Integration Test Harness
 *
 * Board task: task_1779439734598_t3o2
 * Research:   research/2026-05-22_hologate-copresence-systems-paper-evaluation.md §5
 *
 * Exercises the full portal-entry pipeline with 20 concurrent entrants:
 *   - 10 agents (A2A card → semantic lane, drive-avatar scope)
 *   - 10 humans (no A2A card → WebXR/pixel-stream lane, read-only scope)
 *
 * Verification criteria:
 *   (1) Representation negotiation correct per entrant type
 *   (2) Scope ladder enforced per entrant
 *   (3) Portal-entry receipts produced for all 20
 *   (4) No duplicate entry (all 20 receiptIds are unique)
 *   (5) Concurrent delta broadcast delivers to all subscribers
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  buildPortalEntryReceipt,
  validatePortalEntryReceipt,
  defaultRepresentationLaneFor,
  defaultAcceptedFormatsFor,
  type PortalEntrant,
  type PortalEntryReceipt,
} from '@holoscript/hololand-platform';

import {
  handleNetworkingTool,
  subscribeToStateDeltas,
  __resetNetworkingState,
} from '../networking-tools.js';

import { validatePortalIntent, type SpatialPolicy } from '../holo-portal-intent.js';

// ---------------------------------------------------------------------------
// Shared world / tunnel fixtures
// ---------------------------------------------------------------------------

const WORLD_ID = 'world-hologate-integration-test';
const TUNNEL_ID = 'tunnel-hologate-integration-test';
const COMMIT_HASH = 'abc123def456';

const SHARED_SHARE_PACKET = {
  schemaVersion: 'holoscript.holotunnel.share-packet.v1' as const,
  worldId: WORLD_ID,
  sessionName: 'HoloGate Multi-Entrant Integration Test',
  stableUrl: 'https://relay.holoscript.net/live',
  directUrl: 'https://relay.holoscript.net/t/test',
  createdBy: 'holoscript',
};

// ---------------------------------------------------------------------------
// Entrant factories
// ---------------------------------------------------------------------------

function makeAgentEntrant(index: number): PortalEntrant {
  return {
    agentId: `agent_${String(index).padStart(3, '0')}`,
    displayName: `Test Agent ${index}`,
    surfaceKind: 'agent-semantic',
    a2aAgentCardRef: `https://agents.example.com/cards/agent_${String(index).padStart(3, '0')}`,
  };
}

function makeHumanEntrant(index: number): PortalEntrant {
  return {
    agentId: `human_session_${String(index).padStart(3, '0')}`,
    displayName: `Quest 3 User ${index}`,
    surfaceKind: 'human-headset',
    // No a2aAgentCardRef — human entrants don't have A2A cards
  };
}

/** Build a complete portal entry receipt for any entrant with correct defaults. */
function buildEntrantReceipt(entrant: PortalEntrant, now: string): PortalEntryReceipt {
  const lane = defaultRepresentationLaneFor(entrant.surfaceKind);
  const acceptedFormats = defaultAcceptedFormatsFor(lane);

  const spatialPermission =
    entrant.surfaceKind === 'agent-semantic' ? (['mutate', 'read'] as const) : (['read'] as const);

  return buildPortalEntryReceipt({
    sharePacket: SHARED_SHARE_PACKET,
    entrant,
    representation: {
      lane,
      acceptedFormats,
      negotiatedAt: now,
    },
    scopesGranted: {
      spatial: spatialPermission,
      toolScopeIds:
        entrant.surfaceKind === 'agent-semantic'
          ? ['scope:world:read', 'scope:world:mutate', 'scope:agent:drive-avatar']
          : ['scope:world:read'],
      worldId: WORLD_ID,
      grantedAt: now,
    },
    worldStateAnchors: {
      entrySnapshotHash: `sha256:entry_${entrant.agentId}`,
      rewindAvailable: true,
      entryTimestamp: now,
    },
    provenance: {
      tunnelId: TUNNEL_ID,
      worldId: WORLD_ID,
      commit: COMMIT_HASH,
    },
    overallStatus: 'admitted',
    now,
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('HoloGate multi-entrant portal (task_1779439734598_t3o2)', () => {
  const AGENT_COUNT = 10;
  const HUMAN_COUNT = 10;
  const TOTAL_ENTRANTS = AGENT_COUNT + HUMAN_COUNT;

  // Build all entrants and receipts once, shared across tests in the suite.
  const now = '2026-05-22T08:00:00.000Z';

  const agentEntrants = Array.from({ length: AGENT_COUNT }, (_, i) => makeAgentEntrant(i + 1));
  const humanEntrants = Array.from({ length: HUMAN_COUNT }, (_, i) => makeHumanEntrant(i + 1));
  const allEntrants = [...agentEntrants, ...humanEntrants];

  const agentReceipts = agentEntrants.map((e) => buildEntrantReceipt(e, now));
  const humanReceipts = humanEntrants.map((e) => buildEntrantReceipt(e, now));
  const allReceipts = [...agentReceipts, ...humanReceipts];

  // ---------------------------------------------------------------------------
  // (1) Representation negotiation correct per entrant type
  // ---------------------------------------------------------------------------

  describe('(1) Representation negotiation', () => {
    it('all 10 agents receive semantic-state lane', () => {
      for (const receipt of agentReceipts) {
        expect(receipt.representation.lane).toBe('semantic-state');
        expect(receipt.entrant.surfaceKind).toBe('agent-semantic');
        expect(receipt.entrant.a2aAgentCardRef).toBeTruthy();
      }
    });

    it('all 10 humans receive pixel-stream lane', () => {
      for (const receipt of humanReceipts) {
        expect(receipt.representation.lane).toBe('pixel-stream');
        expect(receipt.entrant.surfaceKind).toBe('human-headset');
        expect(receipt.entrant.a2aAgentCardRef).toBeUndefined();
      }
    });

    it('agent acceptedFormats include scene-graph+trait-delta', () => {
      for (const receipt of agentReceipts) {
        expect(receipt.representation.acceptedFormats).toContain('scene-graph+trait-delta');
      }
    });

    it('human acceptedFormats include webxr-frame', () => {
      for (const receipt of humanReceipts) {
        expect(receipt.representation.acceptedFormats).toContain('webxr-frame');
      }
    });

    it('no cross-lane contamination: agent never gets pixel-stream', () => {
      for (const receipt of agentReceipts) {
        expect(receipt.representation.lane).not.toBe('pixel-stream');
      }
    });

    it('no cross-lane contamination: human never gets semantic-state', () => {
      for (const receipt of humanReceipts) {
        expect(receipt.representation.lane).not.toBe('semantic-state');
      }
    });

    it('all 20 receipts pass validatePortalEntryReceipt', () => {
      for (const receipt of allReceipts) {
        const result = validatePortalEntryReceipt(receipt);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // (2) Scope ladder enforced per entrant
  // ---------------------------------------------------------------------------

  describe('(2) Scope ladder enforcement', () => {
    const agentPolicy: SpatialPolicy = {
      defaultScope: 'drive-avatar',
      driveAvatar: { allow: true, maxEntities: 1 },
    };

    const humanPolicy: SpatialPolicy = {
      defaultScope: 'read-only',
    };

    it('agents can perform drive-avatar (say) under drive-avatar scope', () => {
      for (let i = 0; i < AGENT_COUNT; i++) {
        const agentId = agentEntrants[i].agentId;
        const intent = { kind: 'say' as const, entityId: agentId, utterance: 'hello from agent' };
        const verdict = validatePortalIntent(intent, agentPolicy, 'drive-avatar');
        expect(verdict.allowed).toBe(true);
      }
    });

    it('agents can perform move under drive-avatar scope', () => {
      for (let i = 0; i < AGENT_COUNT; i++) {
        const agentId = agentEntrants[i].agentId;
        const intent = { kind: 'move' as const, entityId: agentId, position: { x: i, y: 0, z: 0 } };
        const verdict = validatePortalIntent(intent, agentPolicy, 'drive-avatar');
        expect(verdict.allowed).toBe(true);
      }
    });

    it('humans are denied all mutating intents under read-only scope', () => {
      for (let i = 0; i < HUMAN_COUNT; i++) {
        const humanId = humanEntrants[i].agentId;
        const moveIntent = {
          kind: 'move' as const,
          entityId: humanId,
          position: { x: 0, y: 0, z: 0 },
        };
        const sayIntent = { kind: 'say' as const, entityId: humanId, utterance: 'hi' };
        const grabIntent = { kind: 'grab' as const, entityId: humanId, targetId: 'some-object' };

        expect(validatePortalIntent(moveIntent, humanPolicy, 'read-only').allowed).toBe(false);
        expect(validatePortalIntent(sayIntent, humanPolicy, 'read-only').allowed).toBe(false);
        expect(validatePortalIntent(grabIntent, humanPolicy, 'read-only').allowed).toBe(false);
      }
    });

    it('humans cannot escalate to drive-avatar by requesting higher scope', () => {
      // Policy only allows read-only — even if human requests drive-avatar, rejected
      const restrictiveHumanPolicy: SpatialPolicy = {
        allowedScopes: ['read-only'],
      };
      for (let i = 0; i < HUMAN_COUNT; i++) {
        const humanId = humanEntrants[i].agentId;
        const intent = { kind: 'say' as const, entityId: humanId, utterance: 'escalation attempt' };
        const verdict = validatePortalIntent(intent, restrictiveHumanPolicy, 'drive-avatar');
        expect(verdict.allowed).toBe(false);
        expect(verdict.reason).toContain('allowedScopes');
      }
    });

    it('agent scope grants in receipts include mutate and read', () => {
      for (const receipt of agentReceipts) {
        expect(receipt.scopesGranted.spatial).toContain('mutate');
        expect(receipt.scopesGranted.spatial).toContain('read');
        expect(receipt.scopesGranted.toolScopeIds).toContain('scope:agent:drive-avatar');
      }
    });

    it('human scope grants in receipts include only read', () => {
      for (const receipt of humanReceipts) {
        expect(receipt.scopesGranted.spatial).toContain('read');
        expect(receipt.scopesGranted.spatial).not.toContain('mutate');
        expect(receipt.scopesGranted.spatial).not.toContain('admin');
        expect(receipt.scopesGranted.toolScopeIds).not.toContain('scope:agent:drive-avatar');
      }
    });

    it('agents with drive-avatar scope respect maxEntities limit', () => {
      const limitedPolicy: SpatialPolicy = {
        defaultScope: 'drive-avatar',
        driveAvatar: { allow: true, maxEntities: 1 },
      };
      const intent = { kind: 'say' as const, entityId: 'agent_001', utterance: 'hi' };
      // At limit: allowed
      expect(validatePortalIntent(intent, limitedPolicy, 'drive-avatar', 0).allowed).toBe(true);
      // Exceeded limit: rejected
      expect(validatePortalIntent(intent, limitedPolicy, 'drive-avatar', 1).allowed).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // (3) Portal-entry receipts produced for all 20
  // ---------------------------------------------------------------------------

  describe('(3) Receipt production for all 20 entrants', () => {
    it('exactly 20 receipts are produced', () => {
      expect(allReceipts).toHaveLength(TOTAL_ENTRANTS);
    });

    it('every receipt has the correct world context', () => {
      for (const receipt of allReceipts) {
        expect(receipt.sharePacket.worldId).toBe(WORLD_ID);
        expect(receipt.provenance.tunnelId).toBe(TUNNEL_ID);
        expect(receipt.provenance.worldId).toBe(WORLD_ID);
        expect(receipt.provenance.commit).toBe(COMMIT_HASH);
      }
    });

    it('every receipt has overallStatus admitted', () => {
      for (const receipt of allReceipts) {
        expect(receipt.overallStatus).toBe('admitted');
      }
    });

    it('every receipt has a valid entrySnapshotHash', () => {
      for (const receipt of allReceipts) {
        expect(receipt.worldStateAnchors.entrySnapshotHash).toMatch(/^sha256:/);
        expect(receipt.worldStateAnchors.rewindAvailable).toBe(true);
      }
    });

    it('every agent receipt references its A2A card', () => {
      for (let i = 0; i < AGENT_COUNT; i++) {
        const receipt = agentReceipts[i];
        expect(receipt.entrant.a2aAgentCardRef).toContain(
          `agent_${String(i + 1).padStart(3, '0')}`
        );
      }
    });

    it('all 20 receipts pass schema validation', () => {
      let validCount = 0;
      for (const receipt of allReceipts) {
        const { valid, errors } = validatePortalEntryReceipt(receipt);
        if (!valid) {
          throw new Error(`Receipt ${receipt.receiptId} invalid: ${errors.join('; ')}`);
        }
        validCount++;
      }
      expect(validCount).toBe(TOTAL_ENTRANTS);
    });

    it('all 20 receipts have non-empty toolScopeIds', () => {
      for (const receipt of allReceipts) {
        expect(receipt.scopesGranted.toolScopeIds.length).toBeGreaterThan(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // (4) No duplicate entry — all 20 receiptIds are unique
  // ---------------------------------------------------------------------------

  describe('(4) No duplicate entry', () => {
    it('all 20 receiptIds are unique', () => {
      const ids = allReceipts.map((r) => r.receiptId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(TOTAL_ENTRANTS);
    });

    it('all 20 agentIds are unique across entrants', () => {
      const agentIds = allEntrants.map((e) => e.agentId);
      const uniqueIds = new Set(agentIds);
      expect(uniqueIds.size).toBe(TOTAL_ENTRANTS);
    });

    it('receiptId is deterministic for the same entrant', () => {
      // Building the same receipt twice must produce the same receiptId
      const receipt1 = buildEntrantReceipt(agentEntrants[0], now);
      const receipt2 = buildEntrantReceipt(agentEntrants[0], now);
      expect(receipt1.receiptId).toBe(receipt2.receiptId);
    });

    it('different entrants produce different receiptIds', () => {
      // All 20 receipts already proved unique above; additionally check agent vs human
      expect(agentReceipts[0].receiptId).not.toBe(humanReceipts[0].receiptId);
    });

    it('receiptId format matches pentry_ prefix convention', () => {
      for (const receipt of allReceipts) {
        expect(receipt.receiptId).toMatch(/^pentry_[0-9a-f]{16}$/);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // (5) Concurrent delta broadcast delivers to all subscribers
  // ---------------------------------------------------------------------------

  describe('(5) Concurrent delta broadcast to all subscribers', () => {
    beforeEach(() => {
      __resetNetworkingState();
    });

    afterEach(() => {
      __resetNetworkingState();
    });

    it('delta broadcast reaches a single subscriber for each of the 20 entrants', async () => {
      const receivedEntityIds: string[] = [];
      const unsub = subscribeToStateDeltas((deltas) => {
        for (const d of deltas) receivedEntityIds.push(d.entityId);
      });

      // All 20 entrants concurrently push a move intent via the networking tool
      const agentPolicy: SpatialPolicy = {
        defaultScope: 'drive-avatar',
        driveAvatar: { allow: true, maxEntities: 1 },
      };
      const humanPolicy: SpatialPolicy = { defaultScope: 'read-only' };

      const results = await Promise.all([
        // Agents: drive-avatar move — should succeed and broadcast
        ...agentEntrants.map((e, i) =>
          handleNetworkingTool('push_portal_intent', {
            intent: { kind: 'move', entityId: e.agentId, position: { x: i, y: 0, z: 0 } },
            requestedScope: 'drive-avatar',
            spatialPolicy: agentPolicy,
          })
        ),
        // Humans: move under read-only — should be rejected (no broadcast)
        ...humanEntrants.map((e) =>
          handleNetworkingTool('push_portal_intent', {
            intent: { kind: 'move', entityId: e.agentId, position: { x: 0, y: 0, z: 0 } },
            requestedScope: 'read-only',
            spatialPolicy: humanPolicy,
          })
        ),
      ]);

      unsub();

      // All 10 agent intents should be successful
      const agentResults = results.slice(0, AGENT_COUNT);
      for (const r of agentResults) {
        expect(r.status).toBe('success');
      }

      // All 10 human intents should be rejected (no state mutation, no broadcast)
      const humanResults = results.slice(AGENT_COUNT);
      for (const r of humanResults) {
        expect(r.status).toBe('rejected');
      }

      // Broadcast must have fired for all 10 agents.
      // Each move intent produces >= 1 delta (transform + updatedAt = 2 deltas per agent),
      // so receivedEntityIds.length >= AGENT_COUNT. We verify coverage via unique entityId set.
      const broadcastCoverage = new Set(receivedEntityIds);
      expect(broadcastCoverage.size).toBe(AGENT_COUNT);

      // Each agent's entityId must appear in the broadcast (no broadcast missed)
      for (const agent of agentEntrants) {
        expect(receivedEntityIds).toContain(agent.agentId);
      }

      // No human entityIds in the broadcast (humans rejected → no state mutation)
      for (const human of humanEntrants) {
        expect(receivedEntityIds).not.toContain(human.agentId);
      }
    });

    it('broadcast is delivered to multiple simultaneous subscribers', async () => {
      const counts = [0, 0, 0]; // three independent subscribers
      const unsubs = counts.map((_, idx) =>
        subscribeToStateDeltas(() => {
          counts[idx]++;
        })
      );

      // One agent push to verify fan-out
      const agentPolicy: SpatialPolicy = {
        defaultScope: 'drive-avatar',
        driveAvatar: { allow: true, maxEntities: 1 },
      };

      await handleNetworkingTool('push_portal_intent', {
        intent: {
          kind: 'move',
          entityId: agentEntrants[0].agentId,
          position: { x: 1, y: 0, z: 0 },
        },
        requestedScope: 'drive-avatar',
        spatialPolicy: agentPolicy,
      });

      for (const unsub of unsubs) unsub();

      // Every subscriber received the delta
      for (const count of counts) {
        expect(count).toBeGreaterThan(0);
      }
    });

    it('concurrent agent pushes do not lose any broadcast (stress: all 10 agents simultaneously)', async () => {
      const broadcastCount = { value: 0 };
      const unsub = subscribeToStateDeltas((deltas) => {
        broadcastCount.value += deltas.length;
      });

      const agentPolicy: SpatialPolicy = {
        defaultScope: 'drive-avatar',
        driveAvatar: { allow: true, maxEntities: 1 },
      };

      // All 10 agents push say intents concurrently
      const results = await Promise.all(
        agentEntrants.map((e) =>
          handleNetworkingTool('push_portal_intent', {
            intent: { kind: 'say', entityId: e.agentId, utterance: `Hello from ${e.displayName}` },
            requestedScope: 'drive-avatar',
            spatialPolicy: agentPolicy,
          })
        )
      );

      unsub();

      // All 10 must succeed
      for (const r of results) {
        expect(r.status).toBe('success');
      }

      // At least 10 deltas broadcast (one per agent; may be more if multi-field deltas)
      expect(broadcastCount.value).toBeGreaterThanOrEqual(AGENT_COUNT);
    });

    it('authoritative state is correct for all agents after concurrent writes', async () => {
      const agentPolicy: SpatialPolicy = {
        defaultScope: 'drive-avatar',
        driveAvatar: { allow: true, maxEntities: 1 },
      };

      // Each agent sets a distinct x position
      await Promise.all(
        agentEntrants.map((e, i) =>
          handleNetworkingTool('push_portal_intent', {
            intent: {
              kind: 'move',
              entityId: e.agentId,
              position: { x: (i + 1) * 10, y: 0, z: 0 },
            },
            requestedScope: 'drive-avatar',
            spatialPolicy: agentPolicy,
          })
        )
      );

      // Verify each agent's authoritative state reflects its own write
      for (let i = 0; i < AGENT_COUNT; i++) {
        const state = await handleNetworkingTool('fetch_authoritative_state', {
          entityId: agentEntrants[i].agentId,
        });
        // Position should be this agent's write, not another agent's write
        expect(state.transform.position.x).toBe((i + 1) * 10);
      }
    });

    it('human rejected intents leave authoritative state empty (no side effects)', async () => {
      const humanPolicy: SpatialPolicy = { defaultScope: 'read-only' };

      await Promise.all(
        humanEntrants.map((e) =>
          handleNetworkingTool('push_portal_intent', {
            intent: { kind: 'move', entityId: e.agentId, position: { x: 999, y: 999, z: 999 } },
            requestedScope: 'read-only',
            spatialPolicy: humanPolicy,
          })
        )
      );

      // All human entities must remain absent from authoritative state
      for (const human of humanEntrants) {
        const state = await handleNetworkingTool('fetch_authoritative_state', {
          entityId: human.agentId,
        });
        expect(state._null).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Summary assertion: all five criteria met together
  // ---------------------------------------------------------------------------

  describe('Integration summary: all 5 criteria simultaneously', () => {
    beforeEach(() => {
      __resetNetworkingState();
    });

    afterEach(() => {
      __resetNetworkingState();
    });

    it('20-entrant portal entry: receipts valid, lanes correct, no duplicates, scopes enforced, broadcast correct', async () => {
      // (3) Receipts produced
      expect(allReceipts).toHaveLength(TOTAL_ENTRANTS);

      // (4) No duplicate receiptIds
      const receiptIdSet = new Set(allReceipts.map((r) => r.receiptId));
      expect(receiptIdSet.size).toBe(TOTAL_ENTRANTS);

      // (1) Lanes correct and receipts valid
      for (const receipt of agentReceipts) {
        expect(receipt.representation.lane).toBe('semantic-state');
        expect(validatePortalEntryReceipt(receipt).valid).toBe(true);
      }
      for (const receipt of humanReceipts) {
        expect(receipt.representation.lane).toBe('pixel-stream');
        expect(validatePortalEntryReceipt(receipt).valid).toBe(true);
      }

      // (2) Scope ladder: agents drive-avatar, humans read-only
      const agentPolicy: SpatialPolicy = {
        defaultScope: 'drive-avatar',
        driveAvatar: { allow: true, maxEntities: 1 },
      };
      const humanPolicy: SpatialPolicy = { defaultScope: 'read-only' };

      for (const e of agentEntrants) {
        const v = validatePortalIntent(
          { kind: 'say', entityId: e.agentId, utterance: 'hi' },
          agentPolicy,
          'drive-avatar'
        );
        expect(v.allowed).toBe(true);
      }
      for (const e of humanEntrants) {
        const v = validatePortalIntent(
          { kind: 'move', entityId: e.agentId, position: { x: 0, y: 0, z: 0 } },
          humanPolicy,
          'read-only'
        );
        expect(v.allowed).toBe(false);
      }

      // (5) Concurrent broadcast: run all 20 concurrent intents and verify broadcast count
      const broadcastEntityIds: string[] = [];
      const unsub = subscribeToStateDeltas((deltas) => {
        for (const d of deltas) broadcastEntityIds.push(d.entityId);
      });

      await Promise.all([
        ...agentEntrants.map((e, i) =>
          handleNetworkingTool('push_portal_intent', {
            intent: { kind: 'move', entityId: e.agentId, position: { x: i, y: 0, z: 0 } },
            requestedScope: 'drive-avatar',
            spatialPolicy: agentPolicy,
          })
        ),
        ...humanEntrants.map((e) =>
          handleNetworkingTool('push_portal_intent', {
            intent: { kind: 'move', entityId: e.agentId, position: { x: 0, y: 0, z: 0 } },
            requestedScope: 'read-only',
            spatialPolicy: humanPolicy,
          })
        ),
      ]);

      unsub();

      // Agents broadcast, humans silent.
      // Delta count >= AGENT_COUNT (move intent yields transform + updatedAt = 2 deltas per agent).
      // Verify coverage via unique entityId set: exactly AGENT_COUNT unique agent entities broadcast.
      const broadcastCoverageSet = new Set(broadcastEntityIds);
      expect(broadcastCoverageSet.size).toBe(AGENT_COUNT);
      for (const agent of agentEntrants) {
        expect(broadcastEntityIds).toContain(agent.agentId);
      }
      for (const human of humanEntrants) {
        expect(broadcastEntityIds).not.toContain(human.agentId);
      }
    });
  });
});
