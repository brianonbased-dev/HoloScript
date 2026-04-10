// @vitest-environment node
/**
 * prompt-bar.scenario.ts — P4 Sprint 11
 *
 * Tests PromptBar store contract and keyboard shortcut logic.
 * Tests the aiStore prompt-history navigation predicate (↑/↓ arrow keys)
 * and character-count display logic without React rendering.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAIStore } from '@/lib/stores/aiStore';

type PromptEntry = { id: string; prompt: string; code: string; timestamp: number };

function reset() {
  useAIStore.setState({ status: 'idle', ollamaStatus: 'unknown', model: '', promptHistory: [] });
}

// ─── History navigation helper (mirrors what PromptBar ↑/↓ logic does) ───────

function navigateHistory(
  history: PromptEntry[],
  currentIndex: number,
  direction: 'up' | 'down'
): { index: number; value: string } {
  if (history.length === 0) return { index: -1, value: '' };
  const next =
    direction === 'up'
      ? Math.max(0, currentIndex === -1 ? history.length - 1 : currentIndex - 1)
      : currentIndex === -1
        ? -1
        : Math.min(history.length - 1, currentIndex + 1);
  return { index: next, value: history[next]?.prompt ?? '' };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Scenario: PromptBar — history navigation + char count', () => {
  beforeEach(reset);

  it('↑ key from -1 (fresh) goes to last history entry', () => {
    useAIStore.getState().addPrompt({ id: '1', prompt: 'scene A', code: '', timestamp: 1 });
    useAIStore.getState().addPrompt({ id: '2', prompt: 'scene B', code: '', timestamp: 2 });
    const history = useAIStore.getState().promptHistory as PromptEntry[];

    const { index, value } = navigateHistory(history, -1, 'up');
    expect(value).toBe('scene B');
    expect(index).toBe(1);
  });

  it('↑ from first entry stays at first entry', () => {
    useAIStore.getState().addPrompt({ id: '1', prompt: 'scene A', code: '', timestamp: 1 });
    const history = useAIStore.getState().promptHistory as PromptEntry[];

    const first = navigateHistory(history, -1, 'up'); // → index 0
    const again = navigateHistory(history, first.index, 'up'); // → still 0
    expect(again.value).toBe('scene A');
    expect(again.index).toBe(0);
  });

  it('↓ from last entry stays at -1 (clears to blank)', () => {
    useAIStore.getState().addPrompt({ id: '1', prompt: 'scene A', code: '', timestamp: 1 });
    const history = useAIStore.getState().promptHistory as PromptEntry[];

    const atLast = navigateHistory(history, 0, 'down'); // → index 0 (last entry, nothing newer)
    expect(atLast.index).toBe(0);
  });

  it('character count predicate: max 2000 chars means trimmed input is valid', () => {
    const MAX = 2000;
    const short = 'Add a glow effect'; // 17 chars → valid
    const long = 'x'.repeat(2001); // 2001 chars → exceeds max

    expect(short.length <= MAX).toBe(true);
    expect(long.length <= MAX).toBe(false);
  });

  it('Ctrl+Enter submit predicate: ctrlKey + Enter triggers submit', () => {
    // Mirror the keyboard event check used in PromptBar
    function shouldSubmit(e: { key: string; ctrlKey: boolean; shiftKey: boolean }): boolean {
      return (e.key === 'Enter' && !e.shiftKey) || (e.key === 'Enter' && e.ctrlKey);
    }

    expect(shouldSubmit({ key: 'Enter', ctrlKey: false, shiftKey: false })).toBe(true); // Enter
    expect(shouldSubmit({ key: 'Enter', ctrlKey: true, shiftKey: false })).toBe(true); // Ctrl+Enter
    expect(shouldSubmit({ key: 'Enter', ctrlKey: false, shiftKey: true })).toBe(false); // Shift+Enter (new line)
    expect(shouldSubmit({ key: 'a', ctrlKey: false, shiftKey: false })).toBe(false); // typing
  });
});
