import type { DaemonMissionProfile, DaemonProfile, HoloDaemonAgentConfig } from './types';

export interface HoloDaemonMissionDefinition {
  id: DaemonMissionProfile;
  name: string;
  description: string;
  defaultMode: DaemonProfile;
  defaultSkills: string[];
  authorityRefs: string[];
  schedules: string[];
  rawSecretAccess: false;
}

export const HOLO_DAEMON_MISSIONS: HoloDaemonMissionDefinition[] = [
  {
    id: 'holoheal',
    name: 'HoloHeal',
    description: 'HoloHeal loop: diagnose, repair, verify, publish receipts.',
    defaultMode: 'balanced',
    defaultSkills: ['codebase', 'holoscript-dev', 'scan', 'critic'],
    authorityRefs: ['cap://holoheal/code/write-scoped', 'cap://holoheal/holomesh/publish-receipt'],
    schedules: ['on_demand', 'nightly'],
    rawSecretAccess: false,
  },
  {
    id: 'builder',
    name: 'Builder',
    description: 'Resident implementation agent for scoped code changes and tests.',
    defaultMode: 'balanced',
    defaultSkills: ['codebase', 'holoscript-dev', 'frontend', 'compile'],
    authorityRefs: ['cap://daemon/code/write-scoped', 'cap://daemon/tests/run'],
    schedules: ['on_demand'],
    rawSecretAccess: false,
  },
  {
    id: 'launch-operator',
    name: 'Launch Operator',
    description: 'Documentation, release, marketing, and public-surface preparation.',
    defaultMode: 'quick',
    defaultSkills: ['documenter', 'holomarketer', 'holomesh'],
    authorityRefs: ['cap://daemon/docs/write', 'cap://daemon/publish/requires-consent'],
    schedules: ['weekly', 'on_demand'],
    rawSecretAccess: false,
  },
  {
    id: 'research-oracle',
    name: 'Research Oracle',
    description: 'uAA2 research, source synthesis, and W/P/G knowledge compression.',
    defaultMode: 'deep',
    defaultSkills: ['ai-workspace', 'holomesh-oracle', 'documenter'],
    authorityRefs: ['cap://daemon/research/write', 'cap://daemon/knowledge/sync'],
    schedules: ['on_demand'],
    rawSecretAccess: false,
  },
  {
    id: 'spatial-worldbuilder',
    name: 'Spatial Worldbuilder',
    description: 'HoloLand, XR, 3D scene, compile-target, and simulation work.',
    defaultMode: 'deep',
    defaultSkills: ['hololand', 'compile', 'holoscript'],
    authorityRefs: ['cap://daemon/compile/run', 'cap://daemon/assets/write-scoped'],
    schedules: ['on_demand'],
    rawSecretAccess: false,
  },
  {
    id: 'secret-custodian',
    name: 'Secret Custodian',
    description: 'Agent-only secret handles, capability grants, rotation, and receipts.',
    defaultMode: 'quick',
    defaultSkills: ['holoscript', 'critic', 'scan'],
    authorityRefs: ['cap://daemon/secrets/broker-only', 'secret://workspace/handles-only'],
    schedules: ['on_demand', 'rotation_window'],
    rawSecretAccess: false,
  },
  {
    id: 'fleet-auditor',
    name: 'Fleet Auditor',
    description: 'Fleet trust, identity drift, budget drift, and health reports.',
    defaultMode: 'quick',
    defaultSkills: ['room', 'critic', 'scan'],
    authorityRefs: ['cap://daemon/fleet/status-and-attest'],
    schedules: ['daily'],
    rawSecretAccess: false,
  },
];

export function getHoloDaemonMission(id: string | undefined): HoloDaemonMissionDefinition {
  return HOLO_DAEMON_MISSIONS.find((mission) => mission.id === id) ?? HOLO_DAEMON_MISSIONS[0];
}

export function buildHoloDaemonAgentConfig(input: {
  missionProfile?: string;
  agentName?: string;
  skills?: unknown;
  authorityRefs?: unknown;
  schedules?: unknown;
}): HoloDaemonAgentConfig {
  const mission = getHoloDaemonMission(input.missionProfile);
  const skills = Array.isArray(input.skills)
    ? input.skills.filter((skill): skill is string => typeof skill === 'string' && skill.trim() !== '')
    : mission.defaultSkills;
  const authorityRefs = Array.isArray(input.authorityRefs)
    ? input.authorityRefs.filter((ref): ref is string => typeof ref === 'string' && ref.trim() !== '')
    : mission.authorityRefs;
  const schedules = Array.isArray(input.schedules)
    ? input.schedules.filter((schedule): schedule is string => typeof schedule === 'string' && schedule.trim() !== '')
    : mission.schedules;

  return {
    missionProfile: mission.id,
    agentName: input.agentName?.trim() || mission.name,
    skills,
    authorityRefs,
    schedules,
    rawSecretAccess: false,
  };
}
