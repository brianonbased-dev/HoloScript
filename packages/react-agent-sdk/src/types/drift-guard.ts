/**
 * @fileoverview Compile-time drift guard.
 *
 * If a protocol type in this package is redefined locally instead of
 * re-exported from @holoscript/core/agents, these assertions will fail
 * at typecheck time.
 *
 * This file does not export anything — it exists only for the TypeScript
 * compiler to validate structural equality.
 */

import type * as Core from '@holoscript/core/agents';
import type * as Sdk from './index';

type AssertEqual<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : never) : never;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _guard: {
  agentConfig: AssertEqual<Core.AgentConfig, Sdk.AgentConfig>;
  agentPhase: AssertEqual<Core.AgentPhase, Sdk.AgentPhase>;
  agentMessage: AssertEqual<Core.AgentMessage, Sdk.AgentMessage>;
  agentResponse: AssertEqual<Core.AgentResponse, Sdk.AgentResponse>;
  cycleResult: AssertEqual<Core.CycleResult, Sdk.CycleResult>;
  taskParams: AssertEqual<Core.TaskParams, Sdk.TaskParams>;
  taskResult: AssertEqual<Core.TaskResult, Sdk.TaskResult>;
  taskStatus: AssertEqual<Core.TaskStatus, Sdk.TaskStatus>;
  taskProgress: AssertEqual<Core.TaskProgress, Sdk.TaskProgress>;
  taskLog: AssertEqual<Core.TaskLog, Sdk.TaskLog>;
  circuitState: AssertEqual<Core.CircuitState, Sdk.CircuitState>;
  circuitBreakerStatus: AssertEqual<Core.CircuitBreakerStatus, Sdk.CircuitBreakerStatus>;
  circuitBreakerConfig: AssertEqual<Core.CircuitBreakerConfig, Sdk.CircuitBreakerConfig>;
  degradedModeStatus: AssertEqual<Core.DegradedModeStatus, Sdk.DegradedModeStatus>;
  agentMetrics: AssertEqual<Core.AgentMetrics, Sdk.AgentMetrics>;
} = {
  agentConfig: true,
  agentPhase: true,
  agentMessage: true,
  agentResponse: true,
  cycleResult: true,
  taskParams: true,
  taskResult: true,
  taskStatus: true,
  taskProgress: true,
  taskLog: true,
  circuitState: true,
  circuitBreakerStatus: true,
  circuitBreakerConfig: true,
  degradedModeStatus: true,
  agentMetrics: true,
};
