/**
 * Board module — canonical home for team board types, logic, and utilities.
 */
export {
  // Types
  type TaskStatus,
  type SlotRole,
  type TaskAction,
  type TeamTask,
  type DoneLogEntry,
  type SuggestionCategory,
  type SuggestionVote,
  type TeamSuggestion,
  type RoomPreset,
  type AgentRole,
  type AIProvider,
  type ClaimFilter,
  type TeamAgentProfile,

  // Constants
  ROOM_PRESETS,
  TEAM_MODES,
  type TeamModeId,
  BRITTNEY_AGENT,
  DAEMON_AGENT,
  ABSORB_AGENT,
  ORACLE_AGENT,
  TEAM_AGENT_PROFILES,

  // Functions
  getAllProfiles,
  getProfileById,
  getProfilesByClaimRole,
  getProfilesByDomain,
  normalizeTitle,
  generateTaskId,
  generateSuggestionId,
  inferFixPriority,
  parseDeriveContent,
} from './board-types';

export {
  type AuditResult,
  type AuditViolation,
  type AgentStats,
  type SourceStats,
  type CompletionBucket,
  type DoneLogStats,
  type FullAuditResult,
  isLikelyReportEntry,
  isCommitProof,
  auditDoneLog,
  DoneLogAuditor,
} from './audit';

export {
  type ClaimResult,
  type DoneResult,
  type TaskActionResult,
  type SuggestionActionResult,
  type SkippedTaskReason,
  type SkippedTaskEntry,
  claimTask,
  completeTask,
  blockTask,
  reopenTask,
  delegateTask,
  deleteTask,
  addTasksToBoard,
  createSuggestion,
  voteSuggestion,
  promoteSuggestion,
  dismissSuggestion,
} from './board-ops';
