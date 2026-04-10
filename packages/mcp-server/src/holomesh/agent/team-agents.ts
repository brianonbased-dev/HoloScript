/**
 * HoloMesh Team Agent Profiles
 *
 * SHED: All definitions now live in @holoscript/framework.
 * This file re-exports for backward compatibility.
 */

export type {
  SlotRole,
  AgentRole,
  AIProvider,
  ClaimFilter,
  TeamAgentProfile,
} from '@holoscript/framework';

export {
  BRITTNEY_AGENT,
  DAEMON_AGENT,
  ABSORB_AGENT,
  ORACLE_AGENT,
  TEAM_AGENT_PROFILES,
  getAllProfiles,
  getProfileById,
  getProfilesByClaimRole,
  getProfilesByDomain,
} from '@holoscript/framework';

// Scout profile stays here — it's infrastructure, not a team member
export { SCOUT_AGENT } from './scout-profile';
