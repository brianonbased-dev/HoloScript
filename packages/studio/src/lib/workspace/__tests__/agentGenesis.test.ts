import { describe, expect, it } from 'vitest';
import { buildAgentGenesisPlan } from '../agentGenesis';

describe('buildAgentGenesisPlan', () => {
  it('autospawns the core HoloDaemon crew with skills-first routing', () => {
    const plan = buildAgentGenesisPlan({
      workspaceId: 'ws_octocat',
      repoName: 'demo-app',
      repoUrl: 'https://github.com/octocat/demo-app.git',
      intent: 'Improve a Next.js app with tests',
      frameworks: ['next.js'],
      languages: ['ts', 'tsx'],
    });

    expect(plan.strategy).toBe('skills-first-agent-genesis');
    expect(plan.agents.filter((agent) => agent.autospawn).map((agent) => agent.missionProfile)).toEqual(
      expect.arrayContaining(['holoheal', 'secret-custodian', 'fleet-auditor', 'builder'])
    );
    for (const agent of plan.agents) {
      expect(agent.skillsFirst.rule).toBe('skills-first');
      expect(agent.skillsFirst.primarySkills.length).toBeGreaterThan(0);
      expect(agent.daemonAgent.rawSecretAccess).toBe(false);
    }
  });

  it('adds spatial and research agents from workspace signals', () => {
    const plan = buildAgentGenesisPlan({
      workspaceId: 'ws_spatial',
      repoName: 'holo-lab',
      intent: 'Research WebGPU simulation papers and build XR scenes',
      techStack: ['three', 'webgpu', 'holo'],
      languages: ['ts', 'py'],
      traits: ['simulation', 'rag'],
    });

    const autospawn = plan.agents
      .filter((agent) => agent.autospawn)
      .map((agent) => agent.missionProfile);

    expect(autospawn).toContain('spatial-worldbuilder');
    expect(autospawn).toContain('research-oracle');
  });

  it('keeps secrets as broker-only handles', () => {
    const plan = buildAgentGenesisPlan({
      workspaceId: 'ws_launch',
      intent: 'Launch and deploy a public package',
    });

    expect(plan.secretBroker.plaintextInWorkspace).toBe(false);
    expect(plan.secretBroker.handlesOnly).toBe(true);
    expect(plan.secretBroker.handles.map((handle) => handle.ref)).toEqual(
      expect.arrayContaining([
        'secret://workspace/ws_launch/holoscript/orchestrator/api-key',
        'secret://workspace/ws_launch/github/oauth/access-token',
        'secret://workspace/ws_launch/delivery/deploy-or-package/token',
      ])
    );
    expect(JSON.stringify(plan)).not.toContain('sk-');
    expect(JSON.stringify(plan)).not.toContain('gho_');
  });

  it('wires HoloHeal through HoloClaw, HoloMesh, and Fleet receipts', () => {
    const plan = buildAgentGenesisPlan({ workspaceId: 'ws_mesh' });

    expect(plan.meshWiring.holoheal).toEqual({
      incidentTarget: 'HoloClaw',
      receiptTarget: 'HoloMesh',
      trustTarget: 'Fleet',
    });
    expect(plan.meshWiring.events).toEqual(
      expect.arrayContaining([
        'holoclaw.incident.opened',
        'holomesh.receipt.published',
        'fleet.trust.updated',
      ])
    );
  });
});
