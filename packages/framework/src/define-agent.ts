/**
 * defineAgent() — Builder for creating agent configurations.
 *
 * Returns a validated AgentConfig that can be passed to defineTeam().
 */

import type { AgentConfig, AgentRole, SlotRole } from './types';

const VALID_ROLES: AgentRole[] = ['architect', 'coder', 'researcher', 'reviewer'];
const VALID_SLOT_ROLES: SlotRole[] = ['coder', 'tester', 'researcher', 'reviewer', 'flex'];

export function defineAgent(config: AgentConfig): AgentConfig {
  if (!config.name || config.name.length < 1) {
    throw new Error('Agent name is required');
  }
  if (!VALID_ROLES.includes(config.role)) {
    throw new Error(`Invalid role "${config.role}". Valid: ${VALID_ROLES.join(', ')}`);
  }
  if (!config.model?.provider || !config.model?.model) {
    throw new Error('Agent model must specify provider and model');
  }
  if (!config.capabilities || config.capabilities.length === 0) {
    throw new Error('Agent must have at least one capability');
  }

  // Validate claim filter
  const filter = config.claimFilter;
  if (!filter?.roles?.length) {
    throw new Error('Agent claimFilter must specify at least one role');
  }
  for (const r of filter.roles) {
    if (!VALID_SLOT_ROLES.includes(r)) {
      throw new Error(`Invalid claim role "${r}". Valid: ${VALID_SLOT_ROLES.join(', ')}`);
    }
  }

  // Defaults
  return {
    ...config,
    knowledgeDomains: config.knowledgeDomains ?? ['general'],
    claimFilter: {
      ...filter,
      maxPriority: filter.maxPriority ?? 10,
    },
  };
}
