/**
 * HSNAP Bytecode Compilation - DEPRECATED
 *
 * This module's implementations have been removed to eliminate circular dependencies.
 * agent-protocol is a protocol/types package and should not contain implementations.
 *
 * HSNAP bytecode compilation has been moved to a separate package.
 * For now, only types are exported here for backward compatibility.
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

/**
 * @deprecated HSNAP compilation has been moved to separate package.
 */
export function compileHSNAPToUAAL(source: string, options: HSNAPCompileOptions = {}): any {
  throw new Error(
    '[DEPRECATED] HSNAP bytecode compilation moved to separate package. ' +
      'Import from @holoscript/hsnap-compiler instead of @holoscript/agent-protocol'
  );
}

/**
 * @deprecated HSNAP compilation has been moved to separate package
 */
export function compileHSNAPToUAALDetailed(
  source: string,
  options: HSNAPCompileOptions = {}
): HSNAPCompileResult {
  throw new Error(
    '[DEPRECATED] HSNAP bytecode compilation moved to separate package. ' +
      'Import from @holoscript/hsnap-compiler instead of @holoscript/agent-protocol'
  );
}

/**
 * @deprecated Use separate package for HSNAP conversions
 */
export function canonicalTaskToHSNAPSource(envelope: any, compositionName?: string): string {
  throw new Error(
    '[DEPRECATED] HSNAP conversion moved to separate package. ' +
      'Import from @holoscript/hsnap-compiler instead of @holoscript/agent-protocol'
  );
}

/**
 * @deprecated Use separate package for HSNAP conversions
 */
export function a2aSendMessageToCanonicalTaskEnvelope(request: any): any {
  throw new Error(
    '[DEPRECATED] HSNAP conversion moved to separate package. ' +
      'Import from @holoscript/hsnap-compiler instead of @holoscript/agent-protocol'
  );
}

/**
 * @deprecated Use separate package for HSNAP conversions
 */
export function hsnapSourceToCanonicalTaskEnvelope(source: string): any {
  throw new Error(
    '[DEPRECATED] HSNAP conversion moved to separate package. ' +
      'Import from @holoscript/hsnap-compiler instead of @holoscript/agent-protocol'
  );
}
