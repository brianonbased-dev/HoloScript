import { describe, expect, it, vi } from 'vitest';

import { buildAgentGenesisPlan } from '../agentGenesis';
import {
  autospawnGenesisFleet,
  type FleetAgentRegistration,
} from '../autospawnFleet';

describe('autospawnGenesisFleet', () => {
  it('registers every autospawn:true agent except the companion, highest priority first', async () => {
    // A bare workspace autospawns: companion, holoheal, secret-custodian, fleet-auditor.
    const plan = buildAgentGenesisPlan({ workspaceId: 'ws_bare' });
    const registered: FleetAgentRegistration[] = [];

    const result = await autospawnGenesisFleet({
      plan,
      ownerId: 'agent_soul_1',
      workspaceId: 'ws_bare',
      register: async (agent) => {
        registered.push(agent);
      },
    });

    const missions = result.spawned.map((a) => a.missionProfile);
    // companion is the face — spawned elsewhere, excluded from the fleet
    expect(missions).not.toContain('companion');
    expect(result.excluded).toContain('companion');
    // the resident ops crew came up
    expect(missions).toEqual(expect.arrayContaining(['holoheal', 'secret-custodian', 'fleet-auditor']));
    // descending priority order
    const priorities = result.spawned.map((a) => a.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
    // one register call per spawned agent, owner-scoped, stable names
    expect(registered).toHaveLength(result.spawned.length);
    for (const agent of registered) {
      expect(agent.type).toBe('daemon');
      expect(agent.ownerId).toBe('agent_soul_1');
      expect(agent.name).toBe(`ws_bare:${agent.missionProfile}`);
      expect(agent.metadata).toMatchObject({ workspaceId: 'ws_bare', autospawn: true });
    }
  });

  it('defers autospawn:false agents instead of spawning them', async () => {
    // No repo, no signals → builder/research/spatial/launch are autospawn:false.
    const plan = buildAgentGenesisPlan({ workspaceId: 'ws_quiet' });
    const result = await autospawnGenesisFleet({
      plan,
      ownerId: 'agent_soul_2',
      workspaceId: 'ws_quiet',
      register: async () => {},
    });

    expect(result.deferred).toEqual(
      expect.arrayContaining(['builder', 'research-oracle', 'spatial-worldbuilder', 'launch-operator'])
    );
    expect(result.spawned.map((a) => a.missionProfile)).not.toContain('builder');
  });

  it('spawns signal-gated agents when the workspace signals call for them', async () => {
    const plan = buildAgentGenesisPlan({
      workspaceId: 'ws_spatial',
      intent: 'Research WebGPU simulation and build XR scenes',
      techStack: ['three', 'webgpu', 'holo'],
      traits: ['simulation', 'rag'],
    });
    const result = await autospawnGenesisFleet({
      plan,
      ownerId: 'agent_soul_3',
      workspaceId: 'ws_spatial',
      register: async () => {},
    });

    const missions = result.spawned.map((a) => a.missionProfile);
    expect(missions).toContain('spatial-worldbuilder');
    expect(missions).toContain('research-oracle');
  });

  it('honors a custom exclude set', async () => {
    const plan = buildAgentGenesisPlan({ workspaceId: 'ws_x' });
    const register = vi.fn(async () => {});
    const result = await autospawnGenesisFleet({
      plan,
      ownerId: 'agent_soul_4',
      workspaceId: 'ws_x',
      register,
      excludeMissions: ['companion', 'holoheal'],
    });

    expect(result.spawned.map((a) => a.missionProfile)).not.toContain('holoheal');
    expect(result.excluded).toEqual(expect.arrayContaining(['companion', 'holoheal']));
  });
});
