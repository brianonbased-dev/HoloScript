import { describe, it, expect } from 'vitest';

import { ECSWorld } from '../../vm/executor';
import {
  SpatialAgentService,
  spawnConfigFromMarketplaceInstall,
  type MarketplaceInstallResult,
} from '../spatial-agent-service';
import { InMemoryAgentRegistry } from '../agent-registry';

describe('InMemoryAgentRegistry', () => {
  function makeEntry(id: string) {
    return {
      id,
      name: id,
      // The registry only stores the handle; behavior is exercised via the service.
      agent: {} as never,
      cognitiveHz: 2,
      capabilities: [],
      spawnedAt: Date.now(),
    };
  }

  it('registers, gets, lists, and reports size', () => {
    const reg = new InMemoryAgentRegistry();
    expect(reg.size).toBe(0);
    reg.register(makeEntry('a'));
    reg.register(makeEntry('b'));
    expect(reg.size).toBe(2);
    expect(reg.has('a')).toBe(true);
    expect(reg.get('a')?.id).toBe('a');
    expect(
      reg
        .list()
        .map((e) => e.id)
        .sort()
    ).toEqual(['a', 'b']);
  });

  it('throws on duplicate id and unregisters cleanly', () => {
    const reg = new InMemoryAgentRegistry();
    reg.register(makeEntry('a'));
    expect(() => reg.register(makeEntry('a'))).toThrow(/already registered/);
    const removed = reg.unregister('a');
    expect(removed?.id).toBe('a');
    expect(reg.has('a')).toBe(false);
    expect(reg.unregister('missing')).toBeUndefined();
  });
});

describe('SpatialAgentService — lifecycle', () => {
  it('spawnAgent creates a registered agent with a body entity', () => {
    const world = new ECSWorld();
    const svc = new SpatialAgentService(world);
    const before = world.entityCount;

    const entry = svc.spawnAgent({ name: 'scout', intent: 'observe and act' });

    expect(svc.agentCount).toBe(1);
    expect(svc.getAgent(entry.id)).toBeDefined();
    expect(entry.bodyEntityId).toBeDefined();
    // A body entity was added to the world.
    expect(world.entityCount).toBe(before + 1);
    expect(world.getEntity(entry.bodyEntityId!)?.name).toBe('scout');
  });

  it('honors explicit id and rejects duplicates', () => {
    const world = new ECSWorld();
    const svc = new SpatialAgentService(world);
    svc.spawnAgent({ id: 'fixed', intent: 'observe' });
    expect(() => svc.spawnAgent({ id: 'fixed', intent: 'observe' })).toThrow(/already live/);
  });

  it('can spawn without a body entity', () => {
    const world = new ECSWorld();
    const svc = new SpatialAgentService(world);
    const before = world.entityCount;
    const entry = svc.spawnAgent({ intent: 'think', spawnBody: false });
    expect(entry.bodyEntityId).toBeUndefined();
    expect(world.entityCount).toBe(before);
  });

  it('despawnAgent unregisters and cleans the body entity from the world', () => {
    const world = new ECSWorld();
    const svc = new SpatialAgentService(world);
    const entry = svc.spawnAgent({ name: 'temp', intent: 'observe' });
    const bodyId = entry.bodyEntityId!;
    expect(world.getEntity(bodyId)).toBeDefined();

    const removed = svc.despawnAgent(entry.id);
    expect(removed).toBe(true);
    expect(svc.agentCount).toBe(0);
    expect(svc.getAgent(entry.id)).toBeUndefined();
    // World state cleaned.
    expect(world.getEntity(bodyId)).toBeUndefined();
    // Idempotent on a gone agent.
    expect(svc.despawnAgent(entry.id)).toBe(false);
  });
});

describe('SpatialAgentService — tickAll cognitive cadence', () => {
  it('drives perceive->decide->mutate and throttles per cognitiveHz', async () => {
    const world = new ECSWorld();
    const svc = new SpatialAgentService(world);
    // 2Hz => one cognitive tick every 500ms.
    const entry = svc.spawnAgent({ intent: 'observe and act', cognitiveHz: 2 });

    // First tick at t=0 fires (lastCognitiveTick starts at -Infinity).
    const r0 = await svc.tickAll(0);
    expect(r0.get(entry.id)?.decided).toBe(true);
    expect(r0.get(entry.id)?.perceived).toBe(true);

    // 100ms later: below the 500ms interval => throttled, no cognitive tick.
    const r1 = await svc.tickAll(100);
    expect(r1.get(entry.id)?.decided).toBe(false);

    // 600ms: interval elapsed => fires again.
    const r2 = await svc.tickAll(600);
    expect(r2.get(entry.id)?.decided).toBe(true);
  });

  it('drives all live agents and returns a result per id', async () => {
    const world = new ECSWorld();
    const svc = new SpatialAgentService(world);
    const a = svc.spawnAgent({ id: 'a', intent: 'observe' });
    const b = svc.spawnAgent({ id: 'b', intent: 'observe' });

    const results = await svc.tickAll(0);
    expect([...results.keys()].sort()).toEqual(['a', 'b']);
    expect(results.get(a.id)?.decided).toBe(true);
    expect(results.get(b.id)?.decided).toBe(true);

    // After despawn, tickAll no longer drives the removed agent.
    svc.despawnAgent('a');
    const results2 = await svc.tickAll(600);
    expect([...results2.keys()]).toEqual(['b']);
  });
});

describe('spawnConfigFromMarketplaceInstall — studio wiring bridge', () => {
  it('maps an intent program to a spawn config', () => {
    const install: MarketplaceInstallResult = {
      templateId: 'tmpl_42',
      templateName: 'Market Scout',
      program: 'learn about market then execute trade',
      programType: 'intent',
      config: { cognitiveHz: 4, capabilities: ['trade', 'observe'] },
    };
    const cfg = spawnConfigFromMarketplaceInstall(install);
    expect(cfg.id).toBe('tmpl_42');
    expect(cfg.name).toBe('Market Scout');
    expect(cfg.intent).toBe('learn about market then execute trade');
    expect(cfg.bytecode).toBeUndefined();
    expect(cfg.cognitiveHz).toBe(4);
    expect(cfg.capabilities).toEqual(['trade', 'observe']);
  });

  it('maps a bytecode program (serialized JSON) to a spawn config', () => {
    const bytecode = { version: 2, instructions: [{ opCode: 0xff }] };
    const install: MarketplaceInstallResult = {
      templateId: 'tmpl_bc',
      templateName: 'Precompiled',
      program: JSON.stringify(bytecode),
      programType: 'bytecode',
      config: { cognitiveHz: 2, capabilities: [] },
    };
    const cfg = spawnConfigFromMarketplaceInstall(install);
    expect(cfg.bytecode).toEqual(bytecode);
    expect(cfg.intent).toBeUndefined();
  });

  it('throws on malformed bytecode JSON', () => {
    const install: MarketplaceInstallResult = {
      templateId: 'tmpl_bad',
      templateName: 'Broken',
      program: '{not valid json',
      programType: 'bytecode',
      config: { cognitiveHz: 2, capabilities: [] },
    };
    expect(() => spawnConfigFromMarketplaceInstall(install)).toThrow(/not valid JSON/);
  });

  it('E2E: marketplace install -> live agent in the world', async () => {
    const world = new ECSWorld();
    const svc = new SpatialAgentService(world);
    const install: MarketplaceInstallResult = {
      templateId: 'tmpl_e2e',
      templateName: 'Guardian',
      program: 'observe and protect',
      programType: 'intent',
      config: { cognitiveHz: 2, capabilities: ['guardian'] },
    };

    const entry = svc.spawnAgent(spawnConfigFromMarketplaceInstall(install));
    expect(svc.getAgent('tmpl_e2e')).toBeDefined();
    expect(entry.capabilities).toEqual(['guardian']);

    // The acquired agent participates in the next tick.
    const results = await svc.tickAll(0);
    expect(results.get('tmpl_e2e')?.decided).toBe(true);
  });
});
