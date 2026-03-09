/**
 * @fileoverview Tests for Marketplace Pipeline + HoloLand Runtime
 */

import { describe, it, expect } from 'vitest';
import {
  createSubmission,
  verifySubmission,
  publishSubmission,
  submissionSummary,
  MarketplacePackage,
  Publisher,
} from '../marketplace/MarketplaceSubmission';
import { MarketplaceRegistry } from '../marketplace/MarketplaceRegistry';
import { gateCheck, RuntimeMonitor } from '../runtime/SafetyGate';
import { CultureRuntime } from '../runtime/CultureRuntime';
import { EffectASTNode } from '../compiler/safety/CompilerSafetyPass';

// ── Fixtures ───────────────────────────────────────────────────────────────

const testPublisher: Publisher = {
  id: 'pub-001',
  name: 'TestDev',
  did: 'did:key:z6MkTest',
  verified: true,
  trustLevel: 'trusted',
};

function makePackage(overrides: Partial<MarketplacePackage> = {}): MarketplacePackage {
  return {
    metadata: {
      id: '@testdev/cool-world',
      name: 'Cool World',
      description: 'A cool VR world',
      category: 'world',
      version: { major: 1, minor: 0, patch: 0 },
      publisher: testPublisher,
      tags: ['vr', 'social', 'cool'],
      platforms: ['quest3', 'webxr'],
      license: 'MIT',
      dependencies: [],
      createdAt: '2026-03-06T12:00:00Z',
      updatedAt: '2026-03-06T12:00:00Z',
    },
    nodes: [
      {
        type: 'object',
        name: 'Player',
        traits: ['@mesh', '@physics'],
        calls: [],
        declaredEffects: ['render:spawn', 'physics:force', 'physics:collision', 'resource:cpu'],
      },
    ],
    assets: [{ path: 'player.glb', sizeBytes: 500_000, hash: 'abc123' }],
    bundleSizeBytes: 1_000_000,
    ...overrides,
  };
}

function makeSafeNodes(): EffectASTNode[] {
  return [
    {
      type: 'object',
      name: 'SafeObj',
      traits: ['@mesh'],
      calls: [],
      declaredEffects: ['render:spawn'],
    },
  ];
}

// =============================================================================
// MARKETPLACE SUBMISSION TESTS
// =============================================================================

describe('MarketplaceSubmission', () => {
  it('creates draft submission', () => {
    const sub = createSubmission(makePackage());
    expect(sub.status).toBe('draft');
    expect(sub.package.metadata.name).toBe('Cool World');
  });

  it('verifies safe package', () => {
    const sub = createSubmission(makePackage({ nodes: makeSafeNodes() }));
    const verified = verifySubmission(sub);
    expect(verified.status).toBe('verified');
    expect(verified.safetyReport).toBeDefined();
    expect(verified.safetyReport!.verdict).not.toBe('unsafe');
  });

  it('rejects oversized bundle', () => {
    const sub = createSubmission(makePackage({ bundleSizeBytes: 100 * 1024 * 1024 }));
    const verified = verifySubmission(sub);
    expect(verified.status).toBe('rejected');
    expect(verified.rejectionReasons![0]).toContain('too large');
  });

  it('rejects missing package name', () => {
    const pkg = makePackage();
    pkg.metadata.name = '';
    const sub = createSubmission(pkg);
    const verified = verifySubmission(sub);
    expect(verified.status).toBe('rejected');
  });

  it('publishes trusted publisher', () => {
    const sub = createSubmission(makePackage({ nodes: makeSafeNodes() }));
    verifySubmission(sub);
    const published = publishSubmission(sub);
    expect(published.status).toBe('published');
  });

  it('does not auto-publish new publishers', () => {
    const pkg = makePackage({ nodes: makeSafeNodes() });
    pkg.metadata.publisher = { ...testPublisher, trustLevel: 'new' };
    const sub = createSubmission(pkg);
    verifySubmission(sub);
    const result = publishSubmission(sub);
    expect(result.status).toBe('verified'); // Not auto-published
  });

  it('generates readable summary', () => {
    const sub = createSubmission(makePackage({ nodes: makeSafeNodes() }));
    verifySubmission(sub);
    publishSubmission(sub);
    const summary = submissionSummary(sub);
    expect(summary).toContain('Cool World');
    expect(summary).toContain('PUBLISHED');
  });
});

// =============================================================================
// MARKETPLACE REGISTRY TESTS
// =============================================================================

describe('MarketplaceRegistry', () => {
  function publishedSubmission() {
    const sub = createSubmission(makePackage({ nodes: makeSafeNodes() }));
    verifySubmission(sub);
    publishSubmission(sub);
    return sub;
  }

  it('publishes and retrieves packages', () => {
    const registry = new MarketplaceRegistry();
    const sub = publishedSubmission();
    registry.publish(sub);
    expect(registry.get('@testdev/cool-world')).toBeDefined();
  });

  it('searches by query', () => {
    const registry = new MarketplaceRegistry();
    registry.publish(publishedSubmission());
    const results = registry.search({ query: 'cool' });
    expect(results.listings).toHaveLength(1);
    expect(results.total).toBe(1);
  });

  it('searches by category', () => {
    const registry = new MarketplaceRegistry();
    registry.publish(publishedSubmission());
    expect(registry.search({ category: 'world' }).listings).toHaveLength(1);
    expect(registry.search({ category: 'agent' }).listings).toHaveLength(0);
  });

  it('searches by tags', () => {
    const registry = new MarketplaceRegistry();
    registry.publish(publishedSubmission());
    expect(registry.search({ tags: ['vr'] }).listings).toHaveLength(1);
    expect(registry.search({ tags: ['fps'] }).listings).toHaveLength(0);
  });

  it('installs packages into worlds', () => {
    const registry = new MarketplaceRegistry();
    registry.publish(publishedSubmission());
    const manifest = registry.install('@testdev/cool-world', 'world-001');
    expect(manifest.packageId).toBe('@testdev/cool-world');
    expect(manifest.safetyVerdict).not.toBe('unsafe');
  });

  it('tracks downloads', () => {
    const registry = new MarketplaceRegistry();
    registry.publish(publishedSubmission());
    registry.install('@testdev/cool-world', 'world-001');
    registry.install('@testdev/cool-world', 'world-002');
    expect(registry.get('@testdev/cool-world')!.downloads).toBe(2);
  });

  it('rates packages', () => {
    const registry = new MarketplaceRegistry();
    registry.publish(publishedSubmission());
    registry.rate('@testdev/cool-world', 5);
    registry.rate('@testdev/cool-world', 3);
    expect(registry.get('@testdev/cool-world')!.rating).toBe(4); // avg(5,3)
  });

  it('uninstalls packages', () => {
    const registry = new MarketplaceRegistry();
    registry.publish(publishedSubmission());
    registry.install('@testdev/cool-world', 'world-001');
    expect(registry.getInstalled('world-001')).toHaveLength(1);
    registry.uninstall('@testdev/cool-world', 'world-001');
    expect(registry.getInstalled('world-001')).toHaveLength(0);
  });

  it('reports stats', () => {
    const registry = new MarketplaceRegistry();
    registry.publish(publishedSubmission());
    const stats = registry.stats();
    expect(stats.totalPackages).toBe(1);
    expect(stats.categories['world']).toBe(1);
  });
});

// =============================================================================
// SAFETY GATE TESTS
// =============================================================================

describe('SafetyGate', () => {
  it('allows safe packages', () => {
    const sub = createSubmission(makePackage({ nodes: makeSafeNodes() }));
    verifySubmission(sub);
    publishSubmission(sub);
    const registry = new MarketplaceRegistry();
    registry.publish(sub);
    const manifest = registry.install('@testdev/cool-world', 'world-001');
    const decision = gateCheck(manifest, sub.safetyReport!, 0);
    expect(decision.allowed).toBe(true);
  });

  it('blocks high danger scores', () => {
    const sub = createSubmission(makePackage({ nodes: makeSafeNodes() }));
    verifySubmission(sub);
    publishSubmission(sub);
    const registry = new MarketplaceRegistry();
    registry.publish(sub);
    const manifest = registry.install('@testdev/cool-world', 'w1');
    const report = { ...sub.safetyReport!, dangerScore: 8 };
    const decision = gateCheck(manifest, report, 0, { maxDangerScore: 5 });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Danger score');
  });

  it('blocks when world is at package limit', () => {
    const sub = createSubmission(makePackage({ nodes: makeSafeNodes() }));
    verifySubmission(sub);
    publishSubmission(sub);
    const registry = new MarketplaceRegistry();
    registry.publish(sub);
    const manifest = registry.install('@testdev/cool-world', 'w1');
    const decision = gateCheck(manifest, sub.safetyReport!, 50, { maxPackages: 50 });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('package limit');
  });
});

// =============================================================================
// RUNTIME MONITOR TESTS
// =============================================================================

describe('RuntimeMonitor', () => {
  it('tracks resource usage', () => {
    const monitor = new RuntimeMonitor('quest3');
    monitor.report({ particles: 1000, physicsBodies: 50 });
    expect(monitor.getUsage('particles')).toBe(1000);
    expect(monitor.getUsage('physicsBodies')).toBe(50);
  });

  it('detects over-budget', () => {
    const monitor = new RuntimeMonitor('quest3');
    const snap = monitor.report({ particles: 10000 }); // Quest 3 limit: 5000
    expect(snap.overBudget).toBe(true);
    expect(snap.violations.length).toBeGreaterThan(0);
    expect(monitor.isOverBudget()).toBe(true);
  });

  it('calculates budget percentage', () => {
    const monitor = new RuntimeMonitor('quest3');
    monitor.report({ particles: 2500 }); // 50% of 5000
    expect(monitor.getBudgetPercent('particles')).toBe(50);
  });

  it('provides frame budget info', () => {
    const monitor = new RuntimeMonitor('quest3');
    const budget = monitor.getFrameBudget();
    expect(budget.frameBudgetMs).toBe(11.1);
    expect(budget.agentBudgetMs).toBe(5);
  });
});

// =============================================================================
// CULTURE RUNTIME TESTS
// =============================================================================

describe('CultureRuntime', () => {
  it('agents join with default norms', () => {
    const runtime = new CultureRuntime();
    runtime.agentJoin('agent1');
    const dashboard = runtime.dashboard();
    expect(dashboard.agents).toBe(1);
    expect(dashboard.normStats.agents).toBe(1);
  });

  it('evaluates actions against norms', () => {
    const runtime = new CultureRuntime({ autoEnforce: true });
    runtime.agentJoin('agent1', ['no_griefing']);
    // Try to kill another agent — should be blocked
    const result = runtime.evaluateAction('agent1', ['agent:kill'], 'zone_a');
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.allowed).toBe(false);
  });

  it('allows compliant actions', () => {
    const runtime = new CultureRuntime();
    runtime.agentJoin('agent1');
    const result = runtime.evaluateAction('agent1', ['render:spawn', 'audio:play'], 'zone_a');
    expect(result.violations).toHaveLength(0);
    expect(result.allowed).toBe(true);
  });

  it('tick advances memory decay', () => {
    const runtime = new CultureRuntime();
    runtime.agentJoin('agent1');
    runtime.recordExperience('agent1', 'Saw a tree');
    const result = runtime.tick();
    expect(result.decayed).toBeDefined();
  });

  it('records experiences and traces', () => {
    const runtime = new CultureRuntime();
    runtime.agentJoin('agent1');
    runtime.recordExperience('agent1', 'Found treasure', {
      valence: 0.9,
      normId: 'resource_sharing',
    });
    runtime.leaveTrace('agent1', 'zone_a', 'treasure_here', { x: 10, y: 0, z: 10 });
    const traces = runtime.perceiveTraces('zone_a', { x: 11, y: 0, z: 10 });
    expect(traces).toHaveLength(1);
  });

  it('consolidates SOPs on leave', () => {
    const runtime = new CultureRuntime();
    runtime.agentJoin('agent1');
    for (let i = 0; i < 10; i++) {
      runtime.recordExperience('agent1', `Traded ${i}`, { normId: 'fair_trade', valence: 0.8 });
    }
    const sops = runtime.agentLeave('agent1');
    expect(sops.length).toBeGreaterThan(0);
    expect(sops[0].normId).toBe('fair_trade');
  });

  it('exports culture state', () => {
    const runtime = new CultureRuntime();
    runtime.agentJoin('agent1');
    runtime.recordExperience('agent1', 'Hello world');
    const state = runtime.exportState();
    expect(state.memory).toBeDefined();
    expect(state.tickCount).toBe(0);
  });

  it('dashboard returns full stats', () => {
    const runtime = new CultureRuntime();
    runtime.agentJoin('agent1');
    runtime.agentJoin('agent2');
    runtime.tick();
    const dash = runtime.dashboard();
    expect(dash.agents).toBe(2);
    expect(dash.health).toBe(1); // New agents, full health
    expect(dash.tickCount).toBe(1);
  });

  it('emits violation events', () => {
    const runtime = new CultureRuntime();
    runtime.agentJoin('agent1', ['no_griefing']);
    runtime.evaluateAction('agent1', ['agent:kill'], 'zone_a');
    const events = runtime.getEvents({ type: 'violation' });
    expect(events.length).toBeGreaterThan(0);
  });
});
