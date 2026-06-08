export * from './civicsolver';
export { createPermitHandler, type PermitConfig, type PermitState, type PermitType, type PermitStatus } from './traits/PermitTrait';
export { createPublicMeetingHandler, type PublicMeetingConfig, type PublicMeetingState, type MeetingType, type MeetingStatus, type AgendaItem } from './traits/PublicMeetingTrait';
export { createServiceRequestHandler, type ServiceRequestConfig, type ServiceRequestState, type ServiceCategory, type RequestStatus, type PriorityLevel } from './traits/ServiceRequestTrait';
export { createVotingRecordHandler, type VotingRecordConfig, type VotingRecordState, type VoteType, type VoteOutcome, type VoteCast } from './traits/VotingRecordTrait';
export { createCivicComplianceHandler, type CivicComplianceConfig, type CivicComplianceState, type ComplianceFramework, type ComplianceStatus, type ComplianceCheck, type FoiaRequest } from './traits/CivicComplianceTrait';
export * from './traits/types';

import { createPermitHandler } from './traits/PermitTrait';
import { createPublicMeetingHandler } from './traits/PublicMeetingTrait';
import { createServiceRequestHandler } from './traits/ServiceRequestTrait';
import { createVotingRecordHandler } from './traits/VotingRecordTrait';
import { createCivicComplianceHandler } from './traits/CivicComplianceTrait';

export const pluginMeta = {
  name: '@holoscript/plugin-government-civic',
  version: '1.0.0',
  traits: ['permit', 'public_meeting', 'service_request', 'voting_record', 'civic_compliance', 'civic_decision'],
};

// Runtime integration — behavioral trait handler + registrar that wire the
// deterministic TOPSIS MCDA solver into HoloScriptRuntime's dispatch. Closes
// the built-but-dead-wired gap for `civic_decision`, mirroring energy-grid's
// `power_flow` reference integration.
export {
  GOVERNMENT_CIVIC_PLUGIN_ID,
  civicDecisionHandler,
  registerGovernmentCivicTraitHandlers,
  type CivicDecisionTraitConfig,
  type CivicDecisionSolvedEvent,
  type RuntimeTraitHandler,
  type TraitRegistrar,
} from './runtime';

export const traitHandlers = [
  createPermitHandler(),
  createPublicMeetingHandler(),
  createServiceRequestHandler(),
  createVotingRecordHandler(),
  createCivicComplianceHandler(),
];
