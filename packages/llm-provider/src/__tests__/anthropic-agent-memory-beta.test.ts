/**
 * AnthropicAdapter — dedicated Memory Stores beta (agent-memory-2026-07-22) migration.
 *
 * Anthropic split memory stores into their own beta header on 2026-07-02; it replaces
 * `managed-agents-2026-04-01` on memory-store endpoints and returns 400 if BOTH are sent.
 * On 2026-07-22 the old header adopts the new list behavior. HoloScript makes NO Anthropic
 * memory-store calls (the sovereign @holoscript/memory substrate is the store — GOLD don't),
 * so the only exposure is the caller-supplied `betaHeaders` passthrough. These tests cover
 * the pure `collectAnthropicBetaHeaders` helper: the pinned token, verbatim forwarding, and
 * the mutual-exclusion guard that keeps the successor and drops the deprecated predecessor.
 *
 * Task 1pk4 (A-020 2026-07-10; breaking flip 2026-07-22).
 */
import { describe, it, expect } from 'vitest';

import type { LLMCompletionRequest } from '../types';
import {
  collectAnthropicBetaHeaders,
  ANTHROPIC_AGENT_MEMORY_BETA,
  ANTHROPIC_MANAGED_AGENTS_BETA,
  ANTHROPIC_FILES_BETA,
} from '../adapters/anthropic';

function reqWithBetas(betaHeaders: string[]): LLMCompletionRequest {
  return {
    model: 'claude-opus-4-8',
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 16,
    provider: { anthropic: { betaHeaders } },
  } as LLMCompletionRequest;
}

describe('agent-memory-2026-07-22 beta migration', () => {
  it('pins the dedicated memory-store beta token and its deprecated predecessor', () => {
    expect(ANTHROPIC_AGENT_MEMORY_BETA).toBe('agent-memory-2026-07-22');
    expect(ANTHROPIC_MANAGED_AGENTS_BETA).toBe('managed-agents-2026-04-01');
  });

  it('forwards a caller-supplied agent-memory beta verbatim', () => {
    expect(collectAnthropicBetaHeaders(reqWithBetas([ANTHROPIC_AGENT_MEMORY_BETA]))).toEqual([
      ANTHROPIC_AGENT_MEMORY_BETA,
    ]);
  });

  it('mutual-exclusion: drops deprecated managed-agents when agent-memory is present (avoids 400)', () => {
    const out = collectAnthropicBetaHeaders(
      reqWithBetas([ANTHROPIC_MANAGED_AGENTS_BETA, ANTHROPIC_AGENT_MEMORY_BETA]),
    );
    expect(out).toEqual([ANTHROPIC_AGENT_MEMORY_BETA]);
    expect(out).not.toContain(ANTHROPIC_MANAGED_AGENTS_BETA);
  });

  it('preserves managed-agents alone (guard does not over-drop when the successor is absent)', () => {
    expect(collectAnthropicBetaHeaders(reqWithBetas([ANTHROPIC_MANAGED_AGENTS_BETA]))).toEqual([
      ANTHROPIC_MANAGED_AGENTS_BETA,
    ]);
  });

  it('keeps unrelated betas + agent-memory while dropping only the deprecated predecessor', () => {
    const out = collectAnthropicBetaHeaders(
      reqWithBetas([ANTHROPIC_FILES_BETA, ANTHROPIC_MANAGED_AGENTS_BETA, ANTHROPIC_AGENT_MEMORY_BETA]),
    );
    expect(out).toContain(ANTHROPIC_FILES_BETA);
    expect(out).toContain(ANTHROPIC_AGENT_MEMORY_BETA);
    expect(out).not.toContain(ANTHROPIC_MANAGED_AGENTS_BETA);
  });
});
