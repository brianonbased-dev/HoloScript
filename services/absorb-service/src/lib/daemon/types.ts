/**
 * Daemon Types — Re-export Shim
 *
 * All daemon types have moved to @holoscript/absorb-service.
 * This file re-exports everything for backward compatibility.
 *
 * @deprecated Import from '@holoscript/absorb-service/daemon' instead.
 */
// Bypass broken resolution of TS generating broken dts chunks
export type DaemonJob = any;
export type DaemonTelemetrySummary = any;
export type DaemonProfile = any;

export type {
  DaemonJobLimits,
  DaemonLogEntry,
  DaemonProjectDNA,
  DaemonProjectKind,
  DaemonTelemetryEvent,
  PatchProposal,
  CreateDaemonJobInput,
  DaemonAbsorbSnapshot,
  DaemonPass,
  DaemonPlan,
  DaemonPlanProfile,
  ProjectDNA,
  ManifestData,
  DaemonConfig,
  DaemonExecResult,
  DaemonHost,
  LLMProvider,
  DaemonProvider,
  DaemonPromptContext,
  DaemonPromptAction,
  ErrorCategory,
  SemanticError,
  FailurePattern,
} from '@holoscript/absorb-service/daemon';

export {
  categorizeError,
  extractSymbol,
  parseTscErrorLine,
  parseTscOutput,
  aggregatePatterns,
  buildDaemonPromptContext,
  getDaemonSystemPrompt,
  createDaemonActions,
  getDaemonFileState,
} from '@holoscript/absorb-service/daemon';
