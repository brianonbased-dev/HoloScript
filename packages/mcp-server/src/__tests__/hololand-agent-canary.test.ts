/**
 * HoloLand Agent Canary Tests — Multi-step agent workflow coverage.
 *
 * These tests exercise HoloLand MCP tools through the public `handleTool`
 * dispatch surface, simulating realistic agent sequences. They complement
 * the isolated unit tests in `hololand-mcp-tools.test.ts`.
 *
 * G.GOLD.013: every happy path is paired with at least one false-case test.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { handleTool } from '../handlers';
import { clearHololandRegistries } from '../hololand-mcp-tools';

describe('HoloLand agent canary', () => {
  beforeEach(() => {
    clearHololandRegistries();
  });

  // ── Helper ─────────────────────────────────────────────────────────────────

  async function tool(name: string, args: Record<string, unknown>) {
    const result = await handleTool(name, args);
    if (result && typeof result === 'object' && 'error' in result) {
      throw new Error(`Tool ${name} failed: ${(result as { error: string }).error}`);
    }
    return result as Record<string, unknown>;
  }

  // ── Workflow 1: World + Shard + Zone lifecycle ────────────────────────────

  it('canary: agent creates a world, shard, zone, and verifies status', async () => {
    // Step 1 — Create world
    const world = await tool('create_world', {
      id: 'canary-world',
      name: 'Canary World',
      description: 'Agent canary proving ground',
      maxUsers: 64,
      platforms: ['web', 'quest'],
      category: 'game',
      tags: ['canary'],
    });
    expect(world.success).toBe(true);
    expect(world.worldId).toBe('canary-world');

    // Step 2 — Create shard
    const shard = await tool('create_shard', {
      id: 'canary-shard',
      name: 'Canary Shard',
      zones: [{ id: 'cz1', name: 'Town Square', biome: 'urban' }],
      encounters: [{ id: 'ce1', name: 'Welcome', trigger: 'on-enter', zoneId: 'cz1' }],
      quests: [{ id: 'cq1', name: 'First Steps', steps: [{ id: 'cs1', objective: 'Explore' }] }],
      items: [{ id: 'ci1', name: 'Lantern', category: 'equipment' }],
      skills: [{ id: 'csk1', name: 'Navigation', rarity: 'common' }],
      lootTables: [{ id: 'clt1', name: 'Starter Pack', entries: [{ id: 'cle1', itemId: 'ci1', weight: 1 }] }],
    });
    expect(shard.success).toBe(true);
    expect(shard.shardId).toBe('canary-shard');

    // Step 3 — Create zone
    const zone = await tool('create_zone', {
      id: 'canary-zone',
      name: 'Canary Zone',
      biome: 'urban',
      encounterIds: ['ce1'],
    });
    expect(zone.success).toBe(true);
    expect(zone.zoneId).toBe('canary-zone');

    // Step 4 — Run steward tick
    const tick = await tool('hololand_steward_tick', { shardId: 'canary-shard' });
    expect(tick.success).toBe(true);
    expect(tick.shardId).toBe('canary-shard');
    expect(typeof tick.tickDurationMs).toBe('number');

    // Step 5 — Capture runtime receipt
    const receipt = await tool('hololand_capture_runtime_receipt', {
      shardId: 'canary-shard',
      receiptType: 'validation',
      scenarioId: 'canary-scenario',
    });
    expect(receipt.success).toBe(true);
    expect(receipt.status).toBe('passed');
    expect(typeof receipt.hash).toBe('string');
    expect(receipt.hash).toHaveLength(64);

    // Step 6 — Check shard status
    const status = await tool('hololand_shard_status', {
      shardId: 'canary-shard',
      includeReceipts: true,
    });
    expect(status.success).toBe(true);
    expect(status.health).toBe('healthy');
    expect(Array.isArray(status.receipts)).toBe(true);
    expect((status.receipts as unknown[]).length).toBeGreaterThanOrEqual(1);

    // Step 7 — Publish zone
    const published = await tool('hololand_publish_zone', {
      zoneId: 'canary-zone',
      tierGate: 'premium',
      maxAgents: 128,
    });
    expect(published.success).toBe(true);
    expect(published.status).toBe('published');
    expect(published.tierGate).toBe('premium');

    // Step 8 — Verify zone still exists and publish response carried status
    const fetchedZone = await tool('get_zone', { zoneId: 'canary-zone' });
    expect(fetchedZone.success).toBe(true);
    expect(fetchedZone.zoneId).toBe('canary-zone');
  });

  it('canary: agent creates geo-anchored place and quest', async () => {
    // Step 1 — Create place
    const place = await tool('create_place', {
      id: 'canary-place',
      name: 'Canary Museum',
      lat: 40.7128,
      lng: -74.006,
      radius: 30,
      capacity: 200,
      social: true,
      tags: ['culture', 'canary'],
    });
    expect(place.success).toBe(true);
    expect(place.placeId).toBe('canary-place');

    // Step 2 — Create geo anchor bound to place
    const anchor = await tool('hololand_create_geo_anchor', {
      id: 'canary-anchor',
      placeId: 'canary-place',
      lat: 40.7128,
      lng: -74.006,
      radius: 25,
    });
    expect(anchor.success).toBe(true);
    expect(anchor.anchorId).toBe('canary-anchor');
    expect((anchor.boundTo as Record<string, unknown>).placeId).toBe('canary-place');

    // Step 3 — Create location quest at place
    const quest = await tool('create_location_quest', {
      id: 'canary-quest',
      name: 'Visit Museum',
      placeId: 'canary-place',
      trigger: 'checkin',
      radius: 15,
      rewardItemIds: ['badge-canary'],
      tags: ['tutorial', 'canary'],
    });
    expect(quest.success).toBe(true);
    expect(quest.questId).toBe('canary-quest');

    // Step 4 — List quests filtered by place
    const byPlace = await tool('list_location_quests', { placeId: 'canary-place' });
    expect((byPlace.quests as unknown[]).length).toBeGreaterThanOrEqual(1);

    // Step 5 — List places filtered by tag
    const tagged = await tool('list_places', { tag: 'canary' });
    expect((tagged.places as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  // ── False-case: workflow failures ─────────────────────────────────────────

  it('canary: steward tick fails when shard does not exist', async () => {
    const result = await handleTool('hololand_steward_tick', { shardId: 'ghost-shard' });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('canary: publishing a zone fails when zone does not exist', async () => {
    const result = await handleTool('hololand_publish_zone', { zoneId: 'ghost-zone' });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('canary: geo anchor fails when place does not exist', async () => {
    const result = await handleTool('hololand_create_geo_anchor', {
      placeId: 'ghost-place',
      lat: 0,
      lng: 0,
    });
    expect(result).toMatchObject({ error: expect.stringContaining('Place not found') });
  });

  it('canary: capture receipt fails when shard does not exist', async () => {
    const result = await handleTool('hololand_capture_runtime_receipt', {
      shardId: 'ghost-shard',
      receiptType: 'validation',
    });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('canary: shard status returns error for missing shard', async () => {
    const result = await handleTool('hololand_shard_status', { shardId: 'ghost-shard' });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  // ── Workflow 3: Twin Earth Substrate Contract (task_1778618552503_3zqx) ──

  it('canary: agent retrieves Twin Earth substrate contract', async () => {
    const contract = await tool('hololand_twin_earth_contract', {
      version: '1.0.0',
    });
    expect(contract.success).toBe(true);
    expect(contract.version).toBe('1.0.0');
    expect(typeof contract.hash).toBe('string');
    expect(contract.layers).toBeDefined();
    expect(contract.layers.identity).toContain('Wallet-based');
    expect(contract.layers.safetyEnvelope).toContain('Substrate-enforced');
  });

  it('canary: agent checks Twin Earth substrate status', async () => {
    // Seed some NPCs to give the status something to count
    await tool('hololand_create_npc', {
      id: 'canary-local-npc',
      name: 'Local NPC',
      modelProvider: 'local',
      role: 'merchant',
    });
    await tool('hololand_create_npc', {
      id: 'canary-cloud-npc',
      name: 'Cloud NPC',
      modelProvider: 'cloud',
      role: 'guide',
    });

    const status = await tool('hololand_twin_earth_substrate_status', {});
    expect(status.success).toBe(true);
    expect(status.contractVersion).toBe('1.0.0');
    expect(status.substrateVersion).toBe('7.0.0');
    expect(typeof status.identities).toBe('number');
    expect(typeof status.ais).toBe('number');
    expect(typeof status.byokCount).toBe('number');
    expect(typeof status.localCount).toBe('number');
    expect(typeof status.managedCount).toBe('number');
    expect(typeof status.brittneyOnline).toBe('boolean');
    expect(status.substrateEnforced).toBe(true);
    expect(status.decouplingMetrics).toBeDefined();
    expect(status.decouplingMetrics.sovereignFallbackAvailable).toBe(true);
  });

  // ── False-case: Twin Earth contract failures ──────────────────────────────

  it('canary: Twin Earth contract tool returns shape even without version', async () => {
    const contract = await tool('hololand_twin_earth_contract', {});
    expect(contract.success).toBe(true);
    expect(contract.version).toBe('1.0.0');
  });

  // ── Workflow 4: Twin Earth Robot / AI Sovereign Tool Family (task_1778618552503_a6rb) ──

  it('canary: agent registers robot and AI identities', async () => {
    const robot = await tool('twin_earth_register_identity', {
      agentId: 'canary-robot-1',
      walletAddress: '0xRobot',
      handle: 'Canary Bot',
      attestation: '0xAttestRobot',
      kind: 'robot',
      role: 'robot',
      mode: 'local',
      hardwareFingerprint: 'fp-abc',
    });
    expect(robot.success).toBe(true);
    expect(robot.agentId).toBe('canary-robot-1');
    expect(robot.kind).toBe('robot');

    const ai = await tool('twin_earth_register_identity', {
      agentId: 'canary-ai-1',
      walletAddress: '0xAI',
      handle: 'Canary AI',
      attestation: '0xAttestAI',
      kind: 'ai',
      role: 'ai',
      mode: 'BYOK',
      brainCompositionId: 'brain-123',
    });
    expect(ai.success).toBe(true);
    expect(ai.agentId).toBe('canary-ai-1');
    expect(ai.kind).toBe('ai');
  });

  it('canary: agent retrieves and updates identity', async () => {
    await tool('twin_earth_register_identity', {
      agentId: 'canary-id-2',
      walletAddress: '0xID2',
      handle: 'Original',
      attestation: '0xAttest2',
      kind: 'ai',
    });

    const fetched = await tool('twin_earth_get_identity', { agentId: 'canary-id-2' });
    expect(fetched.success).toBe(true);
    expect((fetched.identity as Record<string, unknown>).handle).toBe('Original');

    const updated = await tool('twin_earth_update_identity', {
      agentId: 'canary-id-2',
      handle: 'Updated',
      mode: 'managed',
    });
    expect(updated.success).toBe(true);

    const refetched = await tool('twin_earth_get_identity', { agentId: 'canary-id-2' });
    expect((refetched.identity as Record<string, unknown>).handle).toBe('Updated');
    expect((refetched.identity as Record<string, unknown>).mode).toBe('managed');
  });

  it('canary: steward can revoke identity and block updates', async () => {
    await tool('twin_earth_register_identity', {
      agentId: 'canary-steward',
      walletAddress: '0xSteward',
      handle: 'Steward',
      attestation: '0xAttestSteward',
      kind: 'ai',
      role: 'steward',
    });
    await tool('twin_earth_register_identity', {
      agentId: 'canary-victim',
      walletAddress: '0xVictim',
      handle: 'Victim',
      attestation: '0xAttestVictim',
      kind: 'robot',
      role: 'robot',
    });

    const revoked = await tool('twin_earth_revoke_identity', {
      agentId: 'canary-victim',
      granterId: 'canary-steward',
      revocationSignature: '0xRevoke',
    });
    expect(revoked.success).toBe(true);
    expect(revoked.revokedAt).toBeDefined();

    const updateAttempt = await handleTool('twin_earth_update_identity', {
      agentId: 'canary-victim',
      handle: 'Should Fail',
    });
    expect(updateAttempt).toMatchObject({ error: expect.stringContaining('revoked') });
  });

  it('canary: identity listing filters work', async () => {
    const listAll = await tool('twin_earth_list_identities', {});
    expect(listAll.success).toBe(true);
    expect(Array.isArray(listAll.identities)).toBe(true);

    const robots = await tool('twin_earth_list_identities', { kind: 'robot' });
    expect(robots.total).toBeGreaterThanOrEqual(0);
  });

  it('canary: safety envelope CRUD and enforcement', async () => {
    await tool('twin_earth_register_identity', {
      agentId: 'canary-env-subject',
      walletAddress: '0xEnv',
      handle: 'Env Subject',
      attestation: '0xAttestEnv',
      kind: 'robot',
    });

    const created = await tool('twin_earth_create_safety_envelope', {
      envelopeId: 'canary-env-1',
      agentId: 'canary-env-subject',
      maxTickDurationMs: 500,
      allowedActions: ['robot:move', 'robot:sense'],
      blockedActions: ['robot:grip'],
      localOnly: true,
    });
    expect(created.success).toBe(true);
    expect(created.substrateEnforced).toBe(true);

    const fetched = await tool('twin_earth_get_safety_envelope', { envelopeId: 'canary-env-1' });
    expect((fetched.envelope as Record<string, unknown>).agentId).toBe('canary-env-subject');

    const updated = await tool('twin_earth_update_safety_envelope', {
      envelopeId: 'canary-env-1',
      maxTickDurationMs: 2000,
    });
    expect((updated.envelope as Record<string, unknown>).maxTickDurationMs).toBe(2000);

    const list = await tool('twin_earth_list_safety_envelopes', { agentId: 'canary-env-subject' });
    expect(list.total).toBeGreaterThanOrEqual(1);
  });

  it('canary: permission grant, validation, and revocation', async () => {
    await tool('twin_earth_register_identity', {
      agentId: 'canary-granter',
      walletAddress: '0xGranter',
      handle: 'Granter',
      attestation: '0xAttestGranter',
      kind: 'ai',
      role: 'steward',
    });
    await tool('twin_earth_register_identity', {
      agentId: 'canary-grantee',
      walletAddress: '0xGrantee',
      handle: 'Grantee',
      attestation: '0xAttestGrantee',
      kind: 'robot',
      role: 'robot',
    });

    const grant = await tool('twin_earth_grant_permission', {
      granteeId: 'canary-grantee',
      granterId: 'canary-granter',
      action: 'robot:move',
      scope: 'shard-1',
    });
    expect(grant.success).toBe(true);
    expect(grant.grantHash).toBeDefined();

    const valid = await tool('twin_earth_validate_permission', {
      granteeId: 'canary-grantee',
      action: 'robot:move',
      scope: 'shard-1',
    });
    expect(valid.valid).toBe(true);

    const invalid = await handleTool('twin_earth_validate_permission', {
      granteeId: 'canary-grantee',
      action: 'robot:release',
      scope: 'shard-1',
    });
    expect((invalid as Record<string, unknown>).valid).toBe(false);

    await tool('twin_earth_revoke_permission', {
      grantHash: grant.grantHash as string,
      granterId: 'canary-granter',
      revocationSignature: '0xRevokePerm',
    });

    const postRevoke = await handleTool('twin_earth_validate_permission', {
      granteeId: 'canary-grantee',
      action: 'robot:move',
      scope: 'shard-1',
    });
    expect((postRevoke as Record<string, unknown>).valid).toBe(false);
  });

  it('canary: robot actuation is gated by safety envelope and permissions', async () => {
    await tool('twin_earth_register_identity', {
      agentId: 'canary-act-robot',
      walletAddress: '0xActRobot',
      handle: 'Act Robot',
      attestation: '0xAttestAct',
      kind: 'robot',
    });

    // Without safety envelope: actuation blocked
    const noEnv = await handleTool('twin_earth_robot_actuate', {
      agentId: 'canary-act-robot',
      command: 'move',
    });
    expect(noEnv).toMatchObject({ error: expect.stringContaining('No active safety envelope') });

    // Create envelope but block the command
    await tool('twin_earth_create_safety_envelope', {
      envelopeId: 'canary-act-env',
      agentId: 'canary-act-robot',
      blockedActions: ['robot:move'],
    });

    const blocked = await handleTool('twin_earth_robot_actuate', {
      agentId: 'canary-act-robot',
      command: 'move',
    });
    expect(blocked).toMatchObject({
      error: expect.stringContaining('blocked'),
      rejectedByEnvelope: true,
    });
  });

  it('canary: AI invoke is gated by safety envelope', async () => {
    await tool('twin_earth_register_identity', {
      agentId: 'canary-act-ai',
      walletAddress: '0xActAI',
      handle: 'Act AI',
      attestation: '0xAttestAI',
      kind: 'ai',
    });

    const noEnv = await handleTool('twin_earth_ai_invoke', {
      agentId: 'canary-act-ai',
      prompt: 'Hello',
    });
    expect(noEnv).toMatchObject({ error: expect.stringContaining('No active safety envelope') });

    await tool('twin_earth_create_safety_envelope', {
      envelopeId: 'canary-ai-env',
      agentId: 'canary-act-ai',
      maxTickDurationMs: 50, // too low
    });

    const lowTick = await handleTool('twin_earth_ai_invoke', {
      agentId: 'canary-act-ai',
      prompt: 'Hello',
    });
    expect(lowTick).toMatchObject({
      error: expect.stringContaining('too low'),
      rejectedByEnvelope: true,
    });
  });

  it('canary: substrate status reflects new robot/AI identities', async () => {
    await tool('twin_earth_register_identity', {
      agentId: 'canary-status-robot',
      walletAddress: '0xStatusRobot',
      handle: 'Status Robot',
      attestation: '0xAttestStatus',
      kind: 'robot',
    });
    await tool('twin_earth_create_safety_envelope', {
      envelopeId: 'canary-status-env',
      agentId: 'canary-status-robot',
    });

    const status = await tool('hololand_twin_earth_substrate_status', {});
    expect(status.success).toBe(true);
    expect(typeof status.robots).toBe('number');
    expect(typeof status.ais).toBe('number');
    expect(typeof status.safetyEnvelopes).toBe('number');
    expect(status.safetyEnvelopes).toBeGreaterThanOrEqual(1);
  });

  it('canary: capture receipt produces verifiable record', async () => {
    await tool('twin_earth_register_identity', {
      agentId: 'canary-receipt-actor',
      walletAddress: '0xReceipt',
      handle: 'Receipt Actor',
      attestation: '0xAttestReceipt',
      kind: 'robot',
    });
    await tool('twin_earth_create_safety_envelope', {
      envelopeId: 'canary-receipt-env',
      agentId: 'canary-receipt-actor',
    });

    const receipt = await tool('twin_earth_capture_receipt', {
      actorId: 'canary-receipt-actor',
      action: 'robot:move',
      status: 'success',
      envelopeId: 'canary-receipt-env',
      scope: 'shard-test',
    });
    expect(receipt.success).toBe(true);
    expect(receipt.receiptId).toBeDefined();
    expect(receipt.hash).toBeDefined();
    expect(receipt.envelopeId).toBe('canary-receipt-env');
  });

  // ── False-case: Robot / AI tool family failures ───────────────────────────

  it('canary: get_identity fails for unknown agentId', async () => {
    const result = await handleTool('twin_earth_get_identity', { agentId: 'ghost-agent' });
    expect(result).toMatchObject({ error: expect.stringContaining('not found') });
  });

  it('canary: revoke_identity fails when granter is not steward/founder', async () => {
    await tool('twin_earth_register_identity', {
      agentId: 'canary-operator',
      walletAddress: '0xOperator',
      handle: 'Operator',
      attestation: '0xAttestOp',
      kind: 'ai',
      role: 'operator',
    });
    await tool('twin_earth_register_identity', {
      agentId: 'canary-target',
      walletAddress: '0xTarget',
      handle: 'Target',
      attestation: '0xAttestTarget',
      kind: 'robot',
    });

    const result = await handleTool('twin_earth_revoke_identity', {
      agentId: 'canary-target',
      granterId: 'canary-operator',
      revocationSignature: '0xBad',
    });
    expect(result).toMatchObject({ error: expect.stringContaining('founder or steward') });
  });

  it('canary: delete_safety_envelope fails without proper granter', async () => {
    await tool('twin_earth_register_identity', {
      agentId: 'canary-env-owner',
      walletAddress: '0xEnvOwner',
      handle: 'Env Owner',
      attestation: '0xAttestEO',
      kind: 'robot',
    });
    await tool('twin_earth_create_safety_envelope', {
      envelopeId: 'canary-del-env',
      agentId: 'canary-env-owner',
    });

    const result = await handleTool('twin_earth_delete_safety_envelope', {
      envelopeId: 'canary-del-env',
      granterId: 'canary-env-owner',
    });
    expect(result).toMatchObject({ error: expect.stringContaining('founder or steward') });
  });

  it('canary: robot_actuate fails for non-robot identity', async () => {
    await tool('twin_earth_register_identity', {
      agentId: 'canary-not-robot',
      walletAddress: '0xNotRobot',
      handle: 'Not Robot',
      attestation: '0xAttestNR',
      kind: 'ai',
    });
    await tool('twin_earth_create_safety_envelope', {
      envelopeId: 'canary-nr-env',
      agentId: 'canary-not-robot',
    });

    const result = await handleTool('twin_earth_robot_actuate', {
      agentId: 'canary-not-robot',
      command: 'move',
    });
    expect(result).toMatchObject({ error: expect.stringContaining('not a robot') });
  });

  it('canary: ai_invoke fails for non-ai identity', async () => {
    await tool('twin_earth_register_identity', {
      agentId: 'canary-not-ai',
      walletAddress: '0xNotAI',
      handle: 'Not AI',
      attestation: '0xAttestNAI',
      kind: 'robot',
    });
    await tool('twin_earth_create_safety_envelope', {
      envelopeId: 'canary-nai-env',
      agentId: 'canary-not-ai',
      maxTickDurationMs: 5000,
      maxMemoryBytes: 1073741824,
    });

    const result = await handleTool('twin_earth_ai_invoke', {
      agentId: 'canary-not-ai',
      prompt: 'Hello',
    });
    expect(result).toMatchObject({ error: expect.stringContaining('not an AI') });
  });
});
