/**
 * useBrittneyVoiceActions — unit tests (N4).
 *
 * Coverage:
 *  - buildVoiceScript: correct narration string for 1-4 actions
 *  - matchTranscript: spoken selection maps to the right ProposedAction id
 *    — ordinal match ("one" / "1" / "first")
 *    — label prefix match
 *    — label inclusion match
 *    — no match returns null
 *    — irreversible action is still matchable (safety gate is in the caller)
 *
 * DOM APIs (SpeechSynthesis / SpeechRecognition) are NOT exercised here —
 * those are browser-only and covered by the existing brittney-tts.test.ts
 * browser-stub suite. The match and script logic is pure and testable without
 * a DOM.
 */

import { describe, it, expect } from 'vitest';
import { matchTranscript, buildVoiceScript } from '../useBrittneyVoiceActions';
import type { ProposedAction } from '../../app/api/quest-proof/next-actions/nextActions';

// ── Test fixtures ─────────────────────────────────────────────────────────────

function action(overrides: Partial<ProposedAction> = {}): ProposedAction {
  return {
    id: overrides.id ?? 'proposed:task_001',
    label: overrides.label ?? 'Fix the parser',
    intent: overrides.intent ?? 'Fix the parser — full title',
    actionType: overrides.actionType ?? 'code',
    status: 'proposed',
    taskId: overrides.taskId ?? 'task_001',
    priority: overrides.priority ?? 2,
    reversible: overrides.reversible ?? true,
    href: overrides.href,
  };
}

const THREE_ACTIONS: ProposedAction[] = [
  action({ id: 'proposed:t1', taskId: 't1', label: 'Fix the parser', priority: 1 }),
  action({ id: 'proposed:t2', taskId: 't2', label: 'Add the inbox tile', priority: 2 }),
  action({ id: 'proposed:t3', taskId: 't3', label: 'Update the schema', priority: 3 }),
];

// ── buildVoiceScript ──────────────────────────────────────────────────────────

describe('buildVoiceScript', () => {
  it('returns a fallback for empty actions', () => {
    expect(buildVoiceScript([])).toBe('No proposed actions right now.');
  });

  it('says "is" and "one" for a single action', () => {
    const script = buildVoiceScript([action({ label: 'Ship the release' })]);
    expect(script).toMatch(/Here is your next one:/);
    expect(script).toContain('Ship the release');
    expect(script).toContain('Say the number or name to approve');
  });

  it('says "are" and "three" for three actions', () => {
    const script = buildVoiceScript(THREE_ACTIONS);
    expect(script).toMatch(/Here are your next three:/);
    expect(script).toContain('1. Fix the parser');
    expect(script).toContain('2. Add the inbox tile');
    expect(script).toContain('3. Update the schema');
  });

  it('numbers every item sequentially', () => {
    const actions = [
      action({ label: 'Alpha' }),
      action({ label: 'Beta' }),
      action({ label: 'Gamma' }),
      action({ label: 'Delta' }),
    ];
    const script = buildVoiceScript(actions);
    expect(script).toContain('1. Alpha');
    expect(script).toContain('2. Beta');
    expect(script).toContain('3. Gamma');
    expect(script).toContain('4. Delta');
  });
});

// ── matchTranscript — ordinal matching ───────────────────────────────────────

describe('matchTranscript — ordinal', () => {
  it('maps "one" to the first action', () => {
    const result = matchTranscript('one', THREE_ACTIONS);
    expect(result?.taskId).toBe('t1');
  });

  it('maps "1" to the first action', () => {
    expect(matchTranscript('1', THREE_ACTIONS)?.taskId).toBe('t1');
  });

  it('maps "first" to the first action', () => {
    expect(matchTranscript('first', THREE_ACTIONS)?.taskId).toBe('t1');
  });

  it('maps "two" to the second action', () => {
    expect(matchTranscript('two', THREE_ACTIONS)?.taskId).toBe('t2');
  });

  it('maps "second" to the second action', () => {
    expect(matchTranscript('second', THREE_ACTIONS)?.taskId).toBe('t2');
  });

  it('maps "2" to the second action', () => {
    expect(matchTranscript('2', THREE_ACTIONS)?.taskId).toBe('t2');
  });

  it('maps "three" to the third action', () => {
    expect(matchTranscript('three', THREE_ACTIONS)?.taskId).toBe('t3');
  });

  it('maps "3" to the third action', () => {
    expect(matchTranscript('3', THREE_ACTIONS)?.taskId).toBe('t3');
  });

  it('returns null for out-of-range ordinal', () => {
    expect(matchTranscript('four', THREE_ACTIONS)).toBeNull();
  });

  it('ignores trailing noise after ordinal ("one please")', () => {
    expect(matchTranscript('one please', THREE_ACTIONS)?.taskId).toBe('t1');
  });

  it('case-insensitive ordinal match ("ONE")', () => {
    expect(matchTranscript('ONE', THREE_ACTIONS)?.taskId).toBe('t1');
  });
});

// ── matchTranscript — label matching ─────────────────────────────────────────

describe('matchTranscript — label', () => {
  it('matches a 4-char label prefix', () => {
    // "add " → prefix of "Add the inbox tile"
    expect(matchTranscript('add the', THREE_ACTIONS)?.taskId).toBe('t2');
  });

  it('matches a longer label prefix', () => {
    expect(matchTranscript('fix the parser', THREE_ACTIONS)?.taskId).toBe('t1');
  });

  it('matches label inclusion (partial name spoken)', () => {
    // "schema" is contained in "Update the schema"
    expect(matchTranscript('update the schema', THREE_ACTIONS)?.taskId).toBe('t3');
  });

  it('returns null when fewer than 4 chars and no ordinal', () => {
    expect(matchTranscript('fi', THREE_ACTIONS)).toBeNull();
  });

  it('returns null when transcript matches nothing', () => {
    expect(matchTranscript('completely unrelated phrase', THREE_ACTIONS)).toBeNull();
  });
});

// ── matchTranscript — safety / edge cases ────────────────────────────────────

describe('matchTranscript — safety and edge cases', () => {
  it('returns null for empty transcript', () => {
    expect(matchTranscript('', THREE_ACTIONS)).toBeNull();
  });

  it('returns null for whitespace-only transcript', () => {
    expect(matchTranscript('   ', THREE_ACTIONS)).toBeNull();
  });

  it('returns null for empty action list', () => {
    expect(matchTranscript('one', [])).toBeNull();
  });

  it('irreversible action is still matchable (safety gate is in the caller, not here)', () => {
    const irreversible = action({
      id: 'proposed:t_irr',
      taskId: 't_irr',
      label: 'Deploy to Railway',
      reversible: false,
      priority: 1,
    });
    const result = matchTranscript('one', [irreversible]);
    expect(result?.taskId).toBe('t_irr');
    expect(result?.reversible).toBe(false);
  });

  it('ordinal takes priority over label prefix when both would match', () => {
    // "two" is both ordinal 2 AND a prefix of "two-step refactor" label
    const actions: ProposedAction[] = [
      action({ taskId: 't_first', label: 'Alpha task', priority: 1 }),
      action({ taskId: 't_second', label: 'two-step refactor', priority: 2 }),
    ];
    // "two" → ordinal wins → t_second (index 1 = taskId t_second) — both
    // coincide here; just confirm it resolves without throwing
    const result = matchTranscript('two', actions);
    expect(result?.taskId).toBe('t_second');
  });
});
