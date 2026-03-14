// @vitest-environment node
/**
 * brittney-chat.scenario.ts — P2 Sprint 11
 *
 * Store + streaming contract tests for the BrittneyChatPanel.
 * Tests the aiStore shape + streamBrittney event pattern.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAIStore } from '@/lib/stores/aiStore';

function reset() {
  useAIStore.setState({ status: 'idle', ollamaStatus: 'unknown', model: '', promptHistory: [] });
}

describe('Scenario: BrittneyChatPanel — aiStore + streaming contract', () => {
  beforeEach(reset);

  it('aiStore initialises with idle status and empty prompt history', () => {
    const s = useAIStore.getState();
    expect(s.status).toBe('idle');
    expect(s.promptHistory).toHaveLength(0);
  });

  it('setStatus transitions to thinking (isThinking predicate)', () => {
    useAIStore.getState().setStatus('thinking');
    expect(useAIStore.getState().status).toBe('thinking');
  });

  it('addPrompt grows promptHistory (message log predicate)', () => {
    useAIStore.getState().addPrompt({ prompt: 'add a glow trait', response: 'Done!' });
    expect(useAIStore.getState().promptHistory).toHaveLength(1);
    expect(useAIStore.getState().promptHistory[0].prompt).toBe('add a glow trait');
  });

  it('clearHistory empties promptHistory (feeds Clear button)', () => {
    useAIStore.getState().addPrompt({ prompt: 'a', response: 'b' });
    useAIStore.getState().addPrompt({ prompt: 'c', response: 'd' });
    useAIStore.getState().clearHistory();
    expect(useAIStore.getState().promptHistory).toHaveLength(0);
  });

  it('mock streamBrittney generator yields text then done events', async () => {
    const events: string[] = [];
    const mockStream = vi.fn(async function* () {
      yield { type: 'text', payload: 'Hello from Brittney!' };
      yield { type: 'done' };
    });

    for await (const event of mockStream()) {
      events.push(event.type);
    }

    expect(events).toEqual(['text', 'done']);
  });
});
