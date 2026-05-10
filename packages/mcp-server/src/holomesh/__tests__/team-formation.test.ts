import { describe, it, expect } from 'vitest';
import { formTeam, type RosterAgent, type TeamRequirement } from '../team-formation';

const baseReq: TeamRequirement = {
  taskId: 't1',
  taskType: 'Build a detailed interactive map of the sector',
  requiredCapabilities: ['geography', 'map-design', 'data-collection', 'frontend'],
  teamSize: 4,
};

const fullRoster: RosterAgent[] = [
  { agentId: 'a1', agentName: 'Atlas', capabilities: ['geography', 'data-collection'], specializationScore: 0.8, performanceScore: 0.9, active: true },
  { agentId: 'a2', agentName: 'Mapper', capabilities: ['map-design', 'frontend'], specializationScore: 0.7, performanceScore: 0.8, active: true },
  { agentId: 'a3', agentName: 'Scout', capabilities: ['data-collection', 'geography'], specializationScore: 0.6, performanceScore: 0.7, active: true },
  { agentId: 'a4', agentName: 'Pixel', capabilities: ['frontend', 'map-design'], specializationScore: 0.7, performanceScore: 0.6, active: true },
];

describe('formTeam', () => {
  it('forms a team that fully covers required capabilities', () => {
    const team = formTeam(baseReq, fullRoster);
    expect(team.status).toBe('proposed');
    expect(team.capabilityCoverage).toBe(1);
    expect(team.gaps).toHaveLength(0);
    expect(team.members.length).toBeGreaterThan(0);
    expect(team.members.length).toBeLessThanOrEqual(4);
  });

  it('returns status=unfillable when no agent has any required capability (false-case)', () => {
    const irrelevantRoster: RosterAgent[] = [
      { agentId: 'b1', agentName: 'Bob', capabilities: ['cooking'], active: true },
      { agentId: 'b2', agentName: 'Bea', capabilities: ['gardening'], active: true },
    ];
    const team = formTeam(baseReq, irrelevantRoster);
    expect(team.status).toBe('unfillable');
    expect(team.members).toHaveLength(0);
    expect(team.capabilityCoverage).toBe(0);
    expect(team.gaps.sort()).toEqual([...baseReq.requiredCapabilities].sort());
  });

  it('returns status=partial when some capabilities are covered but not all', () => {
    const partialRoster: RosterAgent[] = [
      { agentId: 'p1', agentName: 'Halfway', capabilities: ['geography', 'map-design'], active: true },
    ];
    const team = formTeam(baseReq, partialRoster);
    expect(team.status).toBe('partial');
    expect(team.capabilityCoverage).toBeLessThan(1);
    expect(team.capabilityCoverage).toBeGreaterThan(0);
    expect(team.gaps.sort()).toEqual(['data-collection', 'frontend']);
  });

  it('excludes inactive agents when requireActiveAgents=true (false-case)', () => {
    const mixedRoster: RosterAgent[] = [
      { agentId: 'i1', agentName: 'Idle', capabilities: ['geography', 'map-design', 'data-collection', 'frontend'], active: false },
    ];
    const team = formTeam(baseReq, mixedRoster);
    expect(team.status).toBe('unfillable');
  });
});
