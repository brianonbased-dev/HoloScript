import {
  buildHoloDaemonAgentConfig,
  getHoloDaemonMission,
} from '../daemon/agentProfiles';
import type { DaemonMissionProfile, HoloDaemonAgentConfig } from '../daemon/types';

export interface AgentGenesisInput {
  workspaceId: string;
  repoUrl?: string;
  repoName?: string;
  intent?: string;
  techStack?: string[];
  frameworks?: string[];
  languages?: string[];
  traits?: string[];
  packageCount?: number;
  approvedRepos?: string[];
}

export interface AgentGenesisSkillRoute {
  rule: 'skills-first';
  primarySkills: string[];
  fallbackSurfaces: string[];
}

export interface AgentGenesisRecommendation {
  id: string;
  name: string;
  missionProfile: DaemonMissionProfile;
  autospawn: boolean;
  priority: number;
  reason: string;
  triggers: string[];
  skillsFirst: AgentGenesisSkillRoute;
  daemonAgent: HoloDaemonAgentConfig;
  receiptTargets: string[];
}

export interface AgentGenesisSecretHandle {
  name: string;
  ref: string;
  usedBy: string[];
  access: 'broker-only';
}

export interface AgentGenesisPlan {
  version: 1;
  workspaceId: string;
  strategy: 'skills-first-agent-genesis';
  summary: string;
  agents: AgentGenesisRecommendation[];
  secretBroker: {
    storage: 'studio-server-or-github-actions-secret';
    plaintextInWorkspace: false;
    handlesOnly: true;
    manifestPath: 'ecosystem/secrets.manifest.yml';
    grantEndpoint: '/api/workspace/secret-broker/grant';
    handles: AgentGenesisSecretHandle[];
    brokerCapabilities: string[];
  };
  meshWiring: {
    holoheal: {
      incidentTarget: 'HoloClaw';
      receiptTarget: 'HoloMesh';
      trustTarget: 'Fleet';
    };
    events: string[];
  };
}

const FALLBACK_SURFACES = ['codebase graph', 'Studio API', 'HoloScript MCP'];

function normalizeSignals(input: AgentGenesisInput): string[] {
  return [
    input.repoName,
    input.repoUrl,
    input.intent,
    ...(input.techStack ?? []),
    ...(input.frameworks ?? []),
    ...(input.languages ?? []),
    ...(input.traits ?? []),
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());
}

function hasSignal(signals: string[], patterns: RegExp[]): boolean {
  return signals.some((signal) => patterns.some((pattern) => pattern.test(signal)));
}

function buildRecommendation(input: {
  workspaceId: string;
  missionProfile: DaemonMissionProfile;
  autospawn: boolean;
  priority: number;
  reason: string;
  triggers: string[];
}): AgentGenesisRecommendation {
  const mission = getHoloDaemonMission(input.missionProfile);
  const daemonAgent = buildHoloDaemonAgentConfig({ missionProfile: mission.id });

  return {
    id: `${input.workspaceId}:${mission.id}`,
    name: mission.name,
    missionProfile: mission.id,
    autospawn: input.autospawn,
    priority: input.priority,
    reason: input.reason,
    triggers: input.triggers,
    skillsFirst: {
      rule: 'skills-first',
      primarySkills: mission.defaultSkills,
      fallbackSurfaces: FALLBACK_SURFACES,
    },
    daemonAgent,
    receiptTargets: ['HoloMesh', 'Fleet', 'workspace:ecosystem/agent-genesis.json'],
  };
}

function buildSecretHandles(input: AgentGenesisInput): AgentGenesisSecretHandle[] {
  const base = `secret://workspace/${input.workspaceId}`;
  const handles: AgentGenesisSecretHandle[] = [
    {
      name: 'HOLOSCRIPT_API_KEY',
      ref: `${base}/holoscript/orchestrator/api-key`,
      usedBy: ['holoheal', 'builder', 'research-oracle', 'fleet-auditor'],
      access: 'broker-only',
    },
    {
      name: 'GITHUB_TOKEN',
      ref: `${base}/github/oauth/access-token`,
      usedBy: ['builder', 'launch-operator', 'secret-custodian'],
      access: 'broker-only',
    },
  ];

  const signals = normalizeSignals(input);
  if (hasSignal(signals, [/deploy|release|launch|vercel|railway|netlify|npm|package/])) {
    handles.push({
      name: 'DEPLOY_OR_PACKAGE_TOKEN',
      ref: `${base}/delivery/deploy-or-package/token`,
      usedBy: ['launch-operator'],
      access: 'broker-only',
    });
  }

  return handles;
}

export function buildAgentGenesisPlan(input: AgentGenesisInput): AgentGenesisPlan {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) {
    throw new Error('workspaceId is required');
  }

  const signals = normalizeSignals({ ...input, workspaceId });
  const wantsSpatial = hasSignal(signals, [
    /holo|hsplus|three|webgpu|webxr|xr|vr|ar|unity|godot|gltf|glb|spatial|simulation/,
  ]);
  const wantsResearch = hasSignal(signals, [
    /research|paper|science|notebook|knowledge|rag|absorb|data|python|model|eval/,
  ]);
  const wantsLaunch = hasSignal(signals, [
    /launch|release|deploy|marketing|public|docs|website|product|storefront|payment|checkout/,
  ]);
  const hasRepo = Boolean(input.repoUrl || input.repoName || (input.approvedRepos?.length ?? 0) > 0);

  const agents: AgentGenesisRecommendation[] = [
    buildRecommendation({
      workspaceId,
      missionProfile: 'holoheal',
      autospawn: true,
      priority: 100,
      reason: 'Default self-improvement loop for every workspace.',
      triggers: ['workspace.created', 'daemon.requested', 'health.regression'],
    }),
    buildRecommendation({
      workspaceId,
      missionProfile: 'secret-custodian',
      autospawn: true,
      priority: 95,
      reason: 'Every workspace needs handles-only secret custody before agents act.',
      triggers: ['workspace.created', 'github.connected', 'secret.rotation_due'],
    }),
    buildRecommendation({
      workspaceId,
      missionProfile: 'fleet-auditor',
      autospawn: true,
      priority: 90,
      reason: 'Fleet should continuously attest agent health, trust, and budget drift.',
      triggers: ['workspace.created', 'agent.spawned', 'daily.audit'],
    }),
    buildRecommendation({
      workspaceId,
      missionProfile: 'builder',
      autospawn: hasRepo,
      priority: 82,
      reason: hasRepo
        ? 'A code-bearing workspace needs a resident implementation agent.'
        : 'Enable when the user links or creates a repository.',
      triggers: ['repo.imported', 'task.claimed', 'patch.requested'],
    }),
    buildRecommendation({
      workspaceId,
      missionProfile: 'research-oracle',
      autospawn: wantsResearch,
      priority: wantsResearch ? 78 : 45,
      reason: wantsResearch
        ? 'Signals indicate research, knowledge, data, or Absorb-heavy work.'
        : 'Optional when the workspace starts accumulating research questions.',
      triggers: ['absorb.completed', 'knowledge.gap_detected', 'research.requested'],
    }),
    buildRecommendation({
      workspaceId,
      missionProfile: 'spatial-worldbuilder',
      autospawn: wantsSpatial,
      priority: wantsSpatial ? 76 : 40,
      reason: wantsSpatial
        ? 'Signals indicate HoloScript, XR, 3D, WebGPU, or simulation work.'
        : 'Optional for 3D, XR, and simulation expansion.',
      triggers: ['spatial.asset_detected', 'compile.target_requested', 'simulation.requested'],
    }),
    buildRecommendation({
      workspaceId,
      missionProfile: 'launch-operator',
      autospawn: wantsLaunch,
      priority: wantsLaunch ? 74 : 38,
      reason: wantsLaunch
        ? 'Signals indicate release, deployment, docs, or public launch work.'
        : 'Optional when the workspace is ready to publish or deploy.',
      triggers: ['release.requested', 'docs.changed', 'deployment.requested'],
    }),
  ].sort((a, b) => b.priority - a.priority);

  return {
    version: 1,
    workspaceId,
    strategy: 'skills-first-agent-genesis',
    summary:
      'Autospawn core agents first, route each through its skills before raw tools, and keep secrets behind brokered handles.',
    agents,
    secretBroker: {
      storage: 'studio-server-or-github-actions-secret',
      plaintextInWorkspace: false,
      handlesOnly: true,
      manifestPath: 'ecosystem/secrets.manifest.yml',
      grantEndpoint: '/api/workspace/secret-broker/grant',
      handles: buildSecretHandles({ ...input, workspaceId }),
      brokerCapabilities: [
        'cap://daemon/secrets/broker-only',
        'cap://daemon/secrets/rotate',
        'cap://daemon/secrets/receipt',
      ],
    },
    meshWiring: {
      holoheal: {
        incidentTarget: 'HoloClaw',
        receiptTarget: 'HoloMesh',
        trustTarget: 'Fleet',
      },
      events: [
        'holoheal.run.started',
        'holoclaw.incident.opened',
        'holomesh.receipt.published',
        'fleet.trust.updated',
      ],
    },
  };
}
