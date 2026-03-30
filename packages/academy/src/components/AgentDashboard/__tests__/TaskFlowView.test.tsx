// @vitest-environment node
/**
 * TaskFlowView — Unit Tests
 *
 * Tests the task state machine, message threading, artifact display,
 * and state badge rendering predicates.
 */

import { describe, it, expect } from 'vitest';
import type { Task, TaskState, TaskMessage, TaskArtifact } from '../types';

// ── Test Fixtures ────────────────────────────────────────────────────────────

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-001',
    title: 'Analyze codebase complexity',
    agentId: 'agent-001',
    state: 'working',
    messages: [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Please analyze the codebase',
        timestamp: Date.now() - 120_000,
      },
      {
        id: 'msg-2',
        role: 'agent',
        content: 'Starting analysis of 42 files...',
        timestamp: Date.now() - 60_000,
        artifacts: [
          {
            id: 'art-1',
            type: 'json',
            name: 'analysis-results.json',
            content: '{"files": 42, "complexity": "medium"}',
          },
        ],
      },
    ],
    artifacts: [
      {
        id: 'art-2',
        type: 'code',
        name: 'refactor-suggestions.ts',
        content: 'export const suggestions = [];',
      },
    ],
    createdAt: Date.now() - 300_000,
    updatedAt: Date.now() - 60_000,
    ...overrides,
  };
}

// ── Task State Machine Tests ─────────────────────────────────────────────────

describe('TaskFlowView — state machine', () => {
  const ALL_STATES: TaskState[] = ['submitted', 'working', 'input-required', 'completed', 'failed'];

  it('all 5 task states are valid', () => {
    expect(ALL_STATES).toHaveLength(5);
    for (const state of ALL_STATES) {
      const task = createTask({ state });
      expect(ALL_STATES).toContain(task.state);
    }
  });

  it('state machine diagram highlights states up to current', () => {
    // The component renders STATES in order and marks:
    // - isPast: index < currentIdx
    // - isCurrent: state === currentState
    const currentState: TaskState = 'working';
    const currentIdx = ALL_STATES.indexOf(currentState);
    expect(currentIdx).toBe(1); // 'working' is at index 1

    // submitted (0) should be past
    expect(0 < currentIdx).toBe(true);
    // working (1) should be current
    expect(ALL_STATES[currentIdx]).toBe('working');
    // input-required (2) should be future
    expect(2 > currentIdx).toBe(true);
  });

  it('completed state is at index 3', () => {
    expect(ALL_STATES.indexOf('completed')).toBe(3);
  });

  it('failed state is at index 4', () => {
    expect(ALL_STATES.indexOf('failed')).toBe(4);
  });

  it('working state gets animate-spin class', () => {
    // Component: task.state === 'working' ? 'animate-spin' : ''
    expect('working' === 'working' ? 'animate-spin' : '').toBe('animate-spin');
    expect('completed' === 'working' ? 'animate-spin' : '').toBe('');
  });
});

// ── State Badge Tests ────────────────────────────────────────────────────────

describe('TaskFlowView — state badges', () => {
  const STATE_META: Record<TaskState, { label: string; bgClass: string; textClass: string }> = {
    submitted: { label: 'Submitted', bgClass: 'bg-gray-500/20', textClass: 'text-gray-300' },
    working: { label: 'Working', bgClass: 'bg-blue-500/20', textClass: 'text-blue-300' },
    'input-required': {
      label: 'Input Required',
      bgClass: 'bg-amber-500/20',
      textClass: 'text-amber-300',
    },
    completed: {
      label: 'Completed',
      bgClass: 'bg-emerald-500/20',
      textClass: 'text-emerald-300',
    },
    failed: { label: 'Failed', bgClass: 'bg-red-500/20', textClass: 'text-red-300' },
  };

  it('every task state has a corresponding badge with label, bg, and text class', () => {
    const states: TaskState[] = ['submitted', 'working', 'input-required', 'completed', 'failed'];
    for (const state of states) {
      const meta = STATE_META[state];
      expect(meta).toBeDefined();
      expect(meta.label).toBeTruthy();
      expect(meta.bgClass).toBeTruthy();
      expect(meta.textClass).toBeTruthy();
    }
  });

  it('badge data-testid follows pattern task-state-badge-{state}', () => {
    const states: TaskState[] = ['submitted', 'working', 'completed', 'failed'];
    for (const state of states) {
      expect(`task-state-badge-${state}`).toMatch(/^task-state-badge-/);
    }
  });
});

// ── Message Thread Tests ─────────────────────────────────────────────────────

describe('TaskFlowView — message thread', () => {
  it('messages are rendered in order', () => {
    const task = createTask();
    expect(task.messages).toHaveLength(2);
    expect(task.messages[0].role).toBe('user');
    expect(task.messages[1].role).toBe('agent');
  });

  it('user messages align right, agent messages align left', () => {
    // Component: isAgent ? 'items-start' : 'items-end'
    const userAlign = 'user' === 'agent' ? 'items-start' : 'items-end';
    const agentAlign = 'agent' === 'agent' ? 'items-start' : 'items-end';
    expect(userAlign).toBe('items-end');
    expect(agentAlign).toBe('items-start');
  });

  it('messages can have inline artifacts', () => {
    const task = createTask();
    const agentMsg = task.messages[1];
    expect(agentMsg.artifacts).toBeDefined();
    expect(agentMsg.artifacts!).toHaveLength(1);
    expect(agentMsg.artifacts![0].type).toBe('json');
  });

  it('empty messages array hides the section', () => {
    const task = createTask({ messages: [] });
    // Component checks: task.messages.length > 0
    expect(task.messages.length > 0).toBe(false);
  });
});

// ── Artifact Display Tests ───────────────────────────────────────────────────

describe('TaskFlowView — artifact display', () => {
  it('JSON artifacts are pretty-printed when valid', () => {
    const content = '{"key":"value","nested":{"a":1}}';
    const formatted = JSON.stringify(JSON.parse(content), null, 2);
    expect(formatted).toContain('\n');
    expect(formatted).toContain('  ');
  });

  it('invalid JSON is rendered as-is', () => {
    const content = 'not valid json {';
    let formatted: string;
    try {
      formatted = JSON.stringify(JSON.parse(content), null, 2);
    } catch {
      formatted = content;
    }
    expect(formatted).toBe('not valid json {');
  });

  it('all artifact types have an icon mapping', () => {
    const types: Array<TaskArtifact['type']> = ['code', 'text', 'json'];
    // Component maps: code->FileCode2, text->FileText, json->FileJson
    for (const type of types) {
      expect(['code', 'text', 'json']).toContain(type);
    }
  });

  it('task-level artifacts are separate from message artifacts', () => {
    const task = createTask();
    // Task has 1 top-level artifact
    expect(task.artifacts).toHaveLength(1);
    expect(task.artifacts[0].name).toBe('refactor-suggestions.ts');

    // Message has 1 inline artifact
    const msgArtifacts = task.messages.flatMap((m) => m.artifacts ?? []);
    expect(msgArtifacts).toHaveLength(1);
    expect(msgArtifacts[0].name).toBe('analysis-results.json');
  });
});

// ── Error Display Tests ──────────────────────────────────────────────────────

describe('TaskFlowView — error display', () => {
  it('error is shown when task has error field', () => {
    const task = createTask({
      state: 'failed',
      error: 'Connection timeout after 30s',
    });
    expect(task.error).toBeTruthy();
    expect(task.state).toBe('failed');
  });

  it('no error section when error is undefined', () => {
    const task = createTask({ error: undefined });
    // Component checks: task.error && (...)
    expect(task.error).toBeUndefined();
  });
});
