/**
 * Daemon module -- Types, actions, error taxonomy, and prompt profiles
 * for the HoloScript self-improvement daemon.
 */

// Types (formerly studio/src/lib/daemon/types.ts)
export * from './types.js';

// Error taxonomy
export {
  categorizeError,
  extractSymbol,
  parseTscErrorLine,
  parseTscOutput,
  aggregatePatterns,
} from './daemon-error-taxonomy.js';
export type {
  ErrorCategory,
  SemanticError,
  FailurePattern,
} from './daemon-error-taxonomy.js';

// Daemon Error Taxonomy exports stop here

// Prompt profiles
export {
  buildDaemonPromptContext,
  getDaemonSystemPrompt,
} from './daemon-prompt-profiles.js';

export type {
  DaemonProvider,
  DaemonPromptContext,
  DaemonPromptAction,
} from './daemon-prompt-profiles.js';

// Action handlers (requires @holoscript/core peer dependency)
export {
  createDaemonActions,
  getDaemonFileState,
} from './daemon-actions.js';

export type {
  DaemonConfig,
  DaemonExecResult,
  DaemonHost,
  LLMProvider,
} from './daemon-actions.js';
