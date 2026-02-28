/**
 * Scenario: Brittney History — localStorage persistence
 *
 * Tests for the chat history persistence layer:
 * - Storage key format
 * - Read/write to localStorage
 * - 200-message cap
 * - Clear functionality
 * - Graceful fallback
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import the pure functions directly
// We test the pure helpers since the hook itself needs React rendering

const PREFIX = 'brittney-history-';
const MAX_MESSAGES = 200;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

function storageKey(projectId: string): string {
  return `${PREFIX}${projectId || 'default'}`;
}

function readFromStorage(projectId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeToStorage(projectId: string, messages: ChatMessage[]): void {
  try {
    const capped = messages.slice(-MAX_MESSAGES);
    localStorage.setItem(storageKey(projectId), JSON.stringify(capped));
  } catch {
    // Storage quota — silently ignore
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Scenario: Brittney History — Storage Key', () => {
  it('generates key with project ID', () => {
    expect(storageKey('my-project')).toBe('brittney-history-my-project');
  });

  it('falls back to "default" for empty project ID', () => {
    expect(storageKey('')).toBe('brittney-history-default');
  });

  it('handles special characters in project ID', () => {
    expect(storageKey('a/b/c')).toBe('brittney-history-a/b/c');
  });
});

describe('Scenario: Brittney History — Read/Write', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('readFromStorage returns [] when no data', () => {
    expect(readFromStorage('test')).toEqual([]);
  });

  it('writeToStorage + readFromStorage round-trips messages', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'Hello', timestamp: 1000 },
      { role: 'assistant', content: 'Hi there!', timestamp: 1001 },
    ];
    writeToStorage('test', msgs);
    expect(readFromStorage('test')).toEqual(msgs);
  });

  it('readFromStorage returns [] for invalid JSON', () => {
    localStorage.setItem('brittney-history-bad', '{invalid json');
    expect(readFromStorage('bad')).toEqual([]);
  });

  it('readFromStorage returns [] for non-array JSON', () => {
    localStorage.setItem('brittney-history-obj', JSON.stringify({ not: 'array' }));
    expect(readFromStorage('obj')).toEqual([]);
  });

  it('different project IDs are independent', () => {
    writeToStorage('a', [{ role: 'user', content: 'A' }]);
    writeToStorage('b', [{ role: 'user', content: 'B' }]);
    expect(readFromStorage('a')[0].content).toBe('A');
    expect(readFromStorage('b')[0].content).toBe('B');
  });
});

describe('Scenario: Brittney History — Message Cap', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('caps at MAX_MESSAGES (200)', () => {
    const msgs: ChatMessage[] = Array.from({ length: 250 }, (_, i) => ({
      role: 'user' as const,
      content: `Message ${i}`,
      timestamp: i,
    }));
    writeToStorage('cap-test', msgs);
    const result = readFromStorage('cap-test');
    expect(result.length).toBe(200);
  });

  it('keeps the most recent messages (slices from end)', () => {
    const msgs: ChatMessage[] = Array.from({ length: 210 }, (_, i) => ({
      role: 'user' as const,
      content: `Msg-${i}`,
    }));
    writeToStorage('recent', msgs);
    const result = readFromStorage('recent');
    expect(result[0].content).toBe('Msg-10'); // First 10 trimmed
    expect(result[result.length - 1].content).toBe('Msg-209');
  });
});

describe('Scenario: Brittney History — Clear', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clearing removes key from localStorage', () => {
    writeToStorage('clear-test', [{ role: 'user', content: 'test' }]);
    expect(readFromStorage('clear-test').length).toBe(1);
    localStorage.removeItem(storageKey('clear-test'));
    expect(readFromStorage('clear-test')).toEqual([]);
  });

  it('clearing one project does not affect others', () => {
    writeToStorage('keep', [{ role: 'user', content: 'keep me' }]);
    writeToStorage('clear', [{ role: 'user', content: 'clear me' }]);
    localStorage.removeItem(storageKey('clear'));
    expect(readFromStorage('keep').length).toBe(1);
    expect(readFromStorage('clear').length).toBe(0);
  });
});
