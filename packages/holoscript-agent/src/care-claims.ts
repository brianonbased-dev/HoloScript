import {
  AGENT_ATTRIBUTE_CLAIM_NULL_ASSUMPTION,
  normalizeAgentAttributeClaims,
  validateAgentAttributeClaims,
} from '@holoscript/agent-protocol';
import type { AgentAttributeClaim } from '@holoscript/agent-protocol';

export {
  AGENT_ATTRIBUTE_CLAIM_ATTRIBUTES,
  AGENT_ATTRIBUTE_CLAIM_INTERPRETATION_BOUNDARY,
  AGENT_ATTRIBUTE_CLAIM_NULL_ASSUMPTION,
  AGENT_ATTRIBUTE_CLAIM_SCHEMA_VERSION,
  HUMAN_LIKE_AGENT_ATTRIBUTE_CLAIMS,
  normalizeAgentAttributeClaims,
  validateAgentAttributeClaims,
} from '@holoscript/agent-protocol';
export type {
  AgentAttributeClaim,
  AgentAttributeClaimAttribute,
  AgentAttributeClaimPersistence,
  AgentAttributeClaimValidation,
  HumanLikeAgentAttributeClaim,
} from '@holoscript/agent-protocol';

export interface TaskExecutionAttributeClaimInput {
  agentHandle: string;
  taskId: string;
  taskTitle: string;
  costUsd: number;
  durationMs: number;
  totalTokens: number;
  commitHash?: string;
}

export function createTaskExecutionAttributeClaims(
  input: TaskExecutionAttributeClaimInput
): AgentAttributeClaim[] {
  const evidenceRefs = [
    `task:${input.taskId}`,
    `audit:task-executed:${input.taskId}`,
    input.commitHash ? `commit:${input.commitHash}` : undefined,
  ].filter((value): value is string => Boolean(value));

  const claims = normalizeAgentAttributeClaims([
    {
      attribute: 'care',
      claim:
        `${input.agentHandle} treated "${input.taskTitle}" as a durable obligation by ` +
        'preserving task execution evidence, bounded cost, and review context.',
      behaviorRefs: [
        `holoscript-agent:${input.agentHandle}:task-executed`,
        `task:${input.taskId}:claimed`,
        `task:${input.taskId}:executed`,
      ],
      evidenceRefs,
      persistence: 'single_event',
      falsifier:
        'No task execution audit event, board task reference, or artifact evidence exists for the claimed care behavior.',
      costOrPriority:
        `costUsd=${input.costUsd.toFixed(6)}; durationMs=${input.durationMs}; totalTokens=${input.totalTokens}`,
      measurementNullAssumption: AGENT_ATTRIBUTE_CLAIM_NULL_ASSUMPTION,
      interpretationBoundary: 'behavioral_contract_not_hidden_state_proof',
    },
  ]);

  const validation = validateAgentAttributeClaims(claims);
  if (!validation.valid) {
    throw new Error(`invalid task execution attribute claims: ${validation.errors.join('; ')}`);
  }
  return claims;
}
