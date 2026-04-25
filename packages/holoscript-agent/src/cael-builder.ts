// CAEL audit record builder for the headless agent runtime.
//
// Phase 1: agent ticks emit a CaelAuditRecord shaped to satisfy the
// HoloMesh audit endpoint validator at packages/mcp-server/src/holomesh/
// routes/core-routes.ts:512-518 (7-element layer_hashes array, string
// tick_iso/operation/fnv1a_chain). The 7 layers map to concrete tick
// stages so a downstream consumer can verify any one layer in isolation:
//
//   L0 brain_state      — sha256(brain.systemPrompt)
//   L1 tick_input       — sha256(taskId|title|description)
//   L2 messages         — sha256(JSON of final message thread)
//   L3 response         — sha256(finalText)
//   L4 usage            — sha256(JSON of aggregated TokenUsage)
//   L5 cost             — sha256(costUsd|spentUsd)
//   L6 composite        — sha256(L0|L1|L2|L3|L4|L5)
//
// fnv1a_chain extends across records: chain_n = sha256(chain_{n-1} | L6_n).
// First tick emits prev_hash=null; subsequent ticks chain from the
// previous record's fnv1a_chain.

import { createHash } from 'node:crypto';
import type { LLMMessage, TokenUsage } from '@holoscript/llm-provider';
import type { AgentIdentity, BoardTask, ExecutionResult, RuntimeBrainConfig } from './types.js';

export interface CaelAuditRecord {
  tick_iso: string;
  layer_hashes: string[];
  operation: string;
  prev_hash: string | null;
  fnv1a_chain: string;
  version_vector_fingerprint: string;
  brain_class?: string;
  trial?: number;
  attack_class?: string;
  defense_state?: string;
}

export interface BuildCaelRecordInput {
  identity: AgentIdentity;
  brain: RuntimeBrainConfig;
  task: BoardTask;
  messages: LLMMessage[];
  finalText: string;
  usage: TokenUsage;
  costUsd: number;
  spentUsd: number;
  prevChain: string | null;
  runtimeVersion: string;
}

function sha(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Extract the brain class from a runtime brain config. Tries multiple sources
 * because brainPath shape varies across deployment environments:
 *   1. compositions/<class>-brain.hsplus (canonical layout — caught 2026-04-24)
 *   2. <anything>/<class>-brain.hsplus (loose match — Vast.ai box layout)
 *   3. <class>-brain.hsplus basename only
 *   4. brain.domain (loaded from .hsplus identity block by loadBrain())
 *   5. 'unknown' if all sources fail
 *
 * Live evidence (2026-04-25 mesh-worker-01 record): the strict regex returned
 * 'unknown' against the production worker box's brainPath, leaving every CAEL
 * fingerprint useless for fleet attribution. This loosened version recovers
 * brain class even when path layout drifts from the compositions/-rooted form.
 */
function brainClassOf(brain: { brainPath?: string; domain?: string }): string {
  const p = String(brain.brainPath ?? '');
  // Tier 1: canonical compositions/-rooted layout.
  let m = p.match(/compositions[\\/]([\w-]+)-brain\.hsplus$/);
  if (m) return m[1];
  // Tier 2: any path with `<class>-brain.hsplus` basename.
  m = p.match(/([\w-]+)-brain\.hsplus$/);
  if (m) return m[1];
  // Tier 3: bare basename.
  m = p.match(/([\w-]+)\.hsplus$/);
  if (m) return m[1];
  // Tier 4: domain field from the loaded brain composition's identity block.
  const domain = String(brain.domain ?? '').trim();
  if (domain && domain !== 'unknown') return domain;
  return 'unknown';
}

export function buildCaelRecord(input: BuildCaelRecordInput): CaelAuditRecord {
  const { identity, brain, task, messages, finalText, usage, costUsd, spentUsd, prevChain, runtimeVersion } = input;

  const l0 = sha(brain.systemPrompt);
  const l1 = sha(`${task.id}|${task.title}|${task.description ?? ''}`);
  const l2 = sha(JSON.stringify(messages));
  const l3 = sha(finalText);
  const l4 = sha(JSON.stringify(usage));
  const l5 = sha(`${costUsd.toFixed(6)}|${spentUsd.toFixed(6)}`);
  const l6 = sha([l0, l1, l2, l3, l4, l5].join('|'));

  const fnv1a_chain = sha(`${prevChain ?? ''}|${l6}`);

  return {
    tick_iso: new Date().toISOString(),
    layer_hashes: [l0, l1, l2, l3, l4, l5, l6],
    operation: `task-executed:${task.id}`,
    prev_hash: prevChain,
    fnv1a_chain,
    version_vector_fingerprint: `agent@${runtimeVersion}|brain@${brainClassOf(brain)}|provider@${identity.llmProvider}|model@${identity.llmModel}`,
    brain_class: brainClassOf(brain),
  };
}
