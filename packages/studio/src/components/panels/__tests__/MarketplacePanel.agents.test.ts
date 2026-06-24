/**
 * MarketplacePanel — agents tab integration test
 *
 * Validates that the onAgentInstalled callback pipeline produces a live
 * SpatialCognitiveAgent registered in the ECS world: the acceptance criterion
 * from task_1782267741139_13ab.
 *
 * Pure-TS (no DOM / JSDOM required) — tests the deployment bridge directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock @holoscript/uaal so SpatialAgentService doesn't require the real peer ─
vi.mock('@holoscript/uaal', () => {
  class MockVM {
    enableLogging: boolean;
    constructor(opts: { enableLogging?: boolean } = {}) {
      this.enableLogging = opts.enableLogging ?? false;
    }
    async run() {
      return { phase: 'idle', actions: [], memory: {} };
    }
  }
  class MockCompiler {
    compileIntent(intent: string) {
      return { instructions: [intent], version: 1 };
    }
  }
  return { UAALVirtualMachine: MockVM, UAALCompiler: MockCompiler };
});

import { VM } from '@holoscript/engine';
import {
  createSpatialAgentService,
  deployInstalledAgent,
  type InstalledAgentResult,
} from '../../../lib/marketplace/agentDeployment';

// ── Shared fixture ──────────────────────────────────────────────────────────

function makeInstallResult(overrides: Partial<InstalledAgentResult> = {}): InstalledAgentResult {
  return {
    templateId: 'tmpl-guardian-01',
    templateName: 'Guardian Agent',
    program: 'patrol and protect nearby entities',
    programType: 'intent',
    config: { cognitiveHz: 4, capabilities: ['patrol', 'protect'] },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('deployInstalledAgent → live agent in world', () => {
  let world: VM.ECSWorld;

  beforeEach(() => {
    world = new VM.ECSWorld();
  });

  it('spawns a registered agent after onAgentInstalled fires', () => {
    const service = createSpatialAgentService(world);
    expect(service.agentCount).toBe(0);

    const result = makeInstallResult();
    const registered = deployInstalledAgent(service, result);

    expect(service.agentCount).toBe(1);
    expect(registered.id).toBe('tmpl-guardian-01');
    expect(registered.name).toBe('Guardian Agent');
    expect(registered.cognitiveHz).toBe(4);
    expect(registered.capabilities).toEqual(['patrol', 'protect']);
  });

  it('gives the agent a body entity in the ECS world', () => {
    const service = createSpatialAgentService(world);
    const result = makeInstallResult();
    const registered = deployInstalledAgent(service, result);

    // body entity id must be a non-negative integer assigned by world.spawn()
    expect(typeof registered.bodyEntityId).toBe('number');
    expect(registered.bodyEntityId).toBeGreaterThanOrEqual(0);
  });

  it('multiple installs register multiple agents', () => {
    const service = createSpatialAgentService(world);

    deployInstalledAgent(service, makeInstallResult({ templateId: 'tmpl-a', templateName: 'A' }));
    deployInstalledAgent(service, makeInstallResult({ templateId: 'tmpl-b', templateName: 'B' }));

    expect(service.agentCount).toBe(2);
    expect(service.getAgent('tmpl-a')?.name).toBe('A');
    expect(service.getAgent('tmpl-b')?.name).toBe('B');
  });

  it('bytecode programType parses JSON and spawns agent', () => {
    const service = createSpatialAgentService(world);
    const bytecodeProgram = JSON.stringify({ instructions: ['idle'], version: 1 });

    const result = makeInstallResult({
      templateId: 'tmpl-bytecode-01',
      program: bytecodeProgram,
      programType: 'bytecode',
    });
    const registered = deployInstalledAgent(service, result);

    expect(registered.id).toBe('tmpl-bytecode-01');
    expect(service.agentCount).toBe(1);
  });

  it('tickAll resolves without throwing for a live agent', async () => {
    const service = createSpatialAgentService(world);
    deployInstalledAgent(service, makeInstallResult());

    const results = await service.tickAll(performance.now());
    expect(results.size).toBe(1);
    expect(results.has('tmpl-guardian-01')).toBe(true);
  });

  it('despawnAgent removes the agent from the registry', () => {
    const service = createSpatialAgentService(world);
    deployInstalledAgent(service, makeInstallResult());
    expect(service.agentCount).toBe(1);

    const removed = service.despawnAgent('tmpl-guardian-01');
    expect(removed).toBe(true);
    expect(service.agentCount).toBe(0);
  });
});
