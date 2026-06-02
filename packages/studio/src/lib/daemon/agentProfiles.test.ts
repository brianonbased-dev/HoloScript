import { describe, expect, it } from 'vitest';

import {
  HOLO_DAEMON_MISSIONS,
  buildHoloDaemonAgentConfig,
  getHoloDaemonMission,
} from './agentProfiles';

describe('HoloDaemon mission profiles', () => {
  it('defaults to HoloHeal as the resident health mission', () => {
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

  it('exposes a per-soul companion mission (D.053) without displacing the HoloHeal default', () => {
    // The default-fallback must remain HoloHeal even with companion present.
    expect(getHoloDaemonMission(undefined).id).toBe('holoheal');

    const companion = HOLO_DAEMON_MISSIONS.find((mission) => mission.id === 'companion');
    expect(companion).toBeDefined();
    expect(companion?.rawSecretAccess).toBe(false);
    expect(companion?.authorityRefs).toEqual(
      expect.arrayContaining([
        'cap://daemon/converse/owner-scoped',
        'cap://daemon/propose/requires-consent',
      ])
    );
    // Companion is read-and-propose only — it must hold no write-scoped capability.
    expect(companion?.authorityRefs.some((ref) => ref.includes('write'))).toBe(false);
    expect(getHoloDaemonMission('companion').id).toBe('companion');
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
