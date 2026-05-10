import { describe, expect, it } from 'vitest';

import {
  HOLO_DAEMON_MISSIONS,
  buildHoloDaemonAgentConfig,
  getHoloDaemonMission,
} from './agentProfiles';

describe('HoloDaemon mission profiles', () => {
  it('defaults to HoloHeal as the self-improvement mission', () => {
    const mission = getHoloDaemonMission(undefined);

    expect(mission.id).toBe('holoheal');
    expect(mission.name).toBe('HoloHeal');
    expect(mission.defaultSkills).toContain('codebase');
  });

  it('keeps every built-in mission on handles-only secret posture', () => {
    expect(HOLO_DAEMON_MISSIONS.length).toBeGreaterThan(1);
    expect(HOLO_DAEMON_MISSIONS.every((mission) => mission.rawSecretAccess === false)).toBe(true);
    expect(HOLO_DAEMON_MISSIONS.some((mission) => mission.id === 'secret-custodian')).toBe(true);
  });

  it('builds customizable resident agent config without raw secret access', () => {
    const config = buildHoloDaemonAgentConfig({
      missionProfile: 'builder',
      agentName: 'Workspace Builder',
      skills: ['codebase', 'frontend'],
      authorityRefs: ['cap://daemon/code/write-scoped'],
      schedules: ['on_demand'],
    });

    expect(config).toEqual({
      missionProfile: 'builder',
      agentName: 'Workspace Builder',
      skills: ['codebase', 'frontend'],
      authorityRefs: ['cap://daemon/code/write-scoped'],
      schedules: ['on_demand'],
      rawSecretAccess: false,
    });
  });
});
