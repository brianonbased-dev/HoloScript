/**
 * HSNAP Bytecode Compilation — TYPE SURFACE ONLY (not implemented here)
 *
 * `@holoscript/agent-protocol` is a type-only protocol package and deliberately
 * contains no HSNAP→uAAL bytecode-compilation implementation. There is **no**
 * separate `@holoscript/hsnap-compiler` package today, and **no** active agent
 * workflow consumes HSNAP→uAAL bytecode compilation from this package.
 *
 * What IS consumed from agent-protocol is SOURCE-LEVEL bridging — translating
 * between canonical task envelopes, A2A `sendMessage` payloads, and HSNAP source
 * — implemented in `task-bridge-schema.ts` and surfaced via `A2AHSNAPBridge`.
 * That path is real and round-trip tested (see `__tests__/task-bridge-schema.test.ts`).
 *
 * The two functions below remain as explicitly-unimplemented stubs so the type
 * surface and the optional `HSNAPRouter` `compile`-hook contract stay stable.
 * To run bytecode compilation, inject a `compile` hook into `HSNAPRouter`.
 *
 * (Downgraded 2026-06-22 — deep-ratchet uAAL-consumption audit: the prior stubs
 *  pointed callers at a non-existent `@holoscript/hsnap-compiler` package and
 *  framed compilation as "moved", overstating consumption. See task
 *  task_1782099281790_4t9i.)
 */

import type { HSNAPAgentMetadata, HSNAPResultMetadata, HSNAPTaskMetadata } from './hsnap-router';

export interface HSNAPStateTransition {
  event: string;
  from: string;
  to: string;
  guard?: string;
}

export interface HSNAPStateMachineSummary {
  initial?: string;
  states: string[];
  transitions: HSNAPStateTransition[];
}

export interface HSNAPCallSite {
  name: string;
  argsSource?: string;
}

export interface HSNAPEmitSite {
  event: string;
  payloadSource?: string;
}

export interface HSNAPCompileArtifacts {
  task: HSNAPTaskMetadata;
  result?: HSNAPResultMetadata;
  agent?: HSNAPAgentMetadata;
  stateMachine?: HSNAPStateMachineSummary;
  llmCalls: HSNAPCallSite[];
  toolCalls: HSNAPCallSite[];
  emits: HSNAPEmitSite[];
}

export interface HSNAPCompileOptions {
  includeFullCycle?: boolean;
  taskDescription?: string;
}

export interface HSNAPCompileResult {
  bytecode: any; // Use any to avoid importing UAALBytecode and creating circular dep
  artifacts: HSNAPCompileArtifacts;
}

const NOT_IMPLEMENTED_MESSAGE =
  'HSNAP→uAAL bytecode compilation is not implemented in @holoscript/agent-protocol ' +
  '(a type-only protocol package) and is not consumed by any active workflow. ' +
  'Inject a `compile` hook into HSNAPRouter, or use source-level bridging via A2AHSNAPBridge.';

/**
 * Not implemented in agent-protocol. Always throws.
 * @see HSNAPRouter `compile` option for the supported injection point.
 */
export function compileHSNAPToUAAL(_source: string, _options: HSNAPCompileOptions = {}): never {
  throw new Error(NOT_IMPLEMENTED_MESSAGE);
}

/**
 * Not implemented in agent-protocol. Always throws.
 * @see HSNAPRouter `compile` option for the supported injection point.
 */
export function compileHSNAPToUAALDetailed(
  _source: string,
  _options: HSNAPCompileOptions = {}
): never {
  throw new Error(NOT_IMPLEMENTED_MESSAGE);
}
