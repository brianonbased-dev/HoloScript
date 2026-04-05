/**
 * defineTeam() — Builder for creating a Team instance.
 *
 * Validates configuration and returns a ready-to-use Team.
 */

import type { TeamConfig } from './types';
import { Team } from './team';

export function defineTeam(config: TeamConfig): Team {
  if (!config.name || config.name.length < 1) {
    throw new Error('Team name is required');
  }
  if (!config.agents || config.agents.length === 0) {
    throw new Error('Team must have at least one agent');
  }

  const maxSlots = config.maxSlots ?? 5;
  if (config.agents.length > maxSlots) {
    throw new Error(`Team has ${config.agents.length} agents but only ${maxSlots} slots`);
  }

  // Check for duplicate agent names
  const names = new Set<string>();
  for (const agent of config.agents) {
    if (names.has(agent.name)) {
      throw new Error(`Duplicate agent name: "${agent.name}"`);
    }
    names.add(agent.name);
  }

  return new Team(config);
}
