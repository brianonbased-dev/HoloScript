import { describe, it, expect } from 'vitest';
import {
  AGENT_DIALOG_V1,
  buildAgentDialogV1Record,
  canonicalDialogSnapshot,
  dialogWireKey,
  wireFormatEquivalentDialog,
  type AgentDialogWireInput,
  type DialogTurn,
} from '../agentDialogRecord';

function turn(over: Partial<DialogTurn> = {}): DialogTurn {
  return {
    speaker: 'claude1',
    audience: 'gemini1',
    chainDepth: 0,
    content: 'hello',
    ...over,
  };
}

function dialog(over: Partial<AgentDialogWireInput> = {}): AgentDialogWireInput {
  return {
    dialogId: 'dlg-test-1',
    turns: [
      turn({ chainDepth: 0, speaker: 'claude1', audience: 'gemini1', content: 'hello' }),
      turn({ chainDepth: 1, speaker: 'gemini1', audience: 'claude1', content: 'hi back' }),
    ],
    ...over,
  };
}

describe('agentDialogRecord (agent.dialog.v1 — third instance of time-binding solverType family)', () => {
  it('AGENT_DIALOG_V1 is the documented solverType token', () => {
    expect(AGENT_DIALOG_V1).toBe('agent.dialog.v1');
  });

  it('wireFormatEquivalentDialog is true for identical dialogs', () => {
    const a = dialog();
    const b = dialog();
    expect(wireFormatEquivalentDialog(a, b)).toBe(true);
  });

  it('canonical-snapshot is chainDepth-ordered regardless of input order (chain-time is the arrow, not insertion order)', () => {
    const sortedFirst = dialog();
    const reversedInput = dialog({
      turns: [
        turn({ chainDepth: 1, speaker: 'gemini1', audience: 'claude1', content: 'hi back' }),
        turn({ chainDepth: 0, speaker: 'claude1', audience: 'gemini1', content: 'hello' }),
      ],
    });
    expect(wireFormatEquivalentDialog(sortedFirst, reversedInput)).toBe(true);
  });

  it('canonical-snapshot drops nothing semantic (parentHash + meta survive)', () => {
    const d = dialog({
      turns: [
        turn({ chainDepth: 0, content: 'genesis' }),
        turn({ chainDepth: 1, content: 'reply', parentHash: 'h0', meta: { tag: 'urgent' } }),
      ],
    });
    const snap = canonicalDialogSnapshot(d) as { turns: Array<Record<string, unknown>> };
    expect(snap.turns[1].parentHash).toBe('h0');
    expect(snap.turns[1].meta).toEqual({ tag: 'urgent' });
  });

  it('different content at same chainDepth → different wire key', () => {
    const a = dialog();
    const b = dialog({
      turns: [
        turn({ chainDepth: 0, content: 'goodbye' }), // changed content
        turn({ chainDepth: 1, speaker: 'gemini1', audience: 'claude1', content: 'hi back' }),
      ],
    });
    expect(wireFormatEquivalentDialog(a, b)).toBe(false);
    expect(dialogWireKey(a)).not.toBe(dialogWireKey(b));
  });

  it('different dialogId → different wire key (each dialog is its own block universe)', () => {
    const a = dialog({ dialogId: 'dlg-test-1' });
    const b = dialog({ dialogId: 'dlg-test-2' });
    expect(wireFormatEquivalentDialog(a, b)).toBe(false);
  });

  it('different parentHash (branch geometry) → different wire key', () => {
    const a = dialog({
      turns: [
        turn({ chainDepth: 0, content: 'genesis' }),
        turn({ chainDepth: 1, content: 'reply', parentHash: 'h0' }),
      ],
    });
    const b = dialog({
      turns: [
        turn({ chainDepth: 0, content: 'genesis' }),
        turn({ chainDepth: 1, content: 'reply', parentHash: 'h-other' }),
      ],
    });
    expect(wireFormatEquivalentDialog(a, b)).toBe(false);
  });

  it('genesis turn (no parentHash) is wire-equivalent regardless of empty-vs-missing meta', () => {
    const a = dialog({
      turns: [turn({ chainDepth: 0, content: 'genesis' })],
    });
    const b = dialog({
      turns: [turn({ chainDepth: 0, content: 'genesis' })],
    });
    expect(wireFormatEquivalentDialog(a, b)).toBe(true);
  });

  it('multi-agent broadcast room: same chainDepth + different (speaker,audience) is allowed and deterministically ordered', () => {
    const d = dialog({
      dialogId: 'room-broadcast',
      turns: [
        turn({ chainDepth: 0, speaker: 'gemini1', audience: 'team', content: 'good morning team' }),
        turn({ chainDepth: 0, speaker: 'claude1', audience: 'team', content: 'standup time' }),
      ],
    });
    const snap = canonicalDialogSnapshot(d) as { turns: Array<{ speaker: string }> };
    // Sorted by speaker as tiebreaker at the same chainDepth
    expect(snap.turns[0].speaker).toBe('claude1');
    expect(snap.turns[1].speaker).toBe('gemini1');
  });

  it('throws on duplicate (chainDepth, speaker, audience) — W.087-class identity collision', () => {
    const malformed: AgentDialogWireInput = {
      dialogId: 'dlg-malformed',
      turns: [
        turn({ chainDepth: 5, speaker: 'claude1', audience: 'gemini1', content: 'first' }),
        turn({ chainDepth: 5, speaker: 'claude1', audience: 'gemini1', content: 'second' }),
      ],
    };
    expect(() => canonicalDialogSnapshot(malformed)).toThrow(/duplicate.*chainDepth=5/);
    expect(() => dialogWireKey(malformed)).toThrow();
  });

  it('buildAgentDialogV1Record exposes solverType, specVersion, wireKey, turnCount, label', () => {
    const d = dialog();
    const rec = buildAgentDialogV1Record(d, { label: 'standup-2026-04-27' });
    expect(rec.solverType).toBe('agent.dialog.v1');
    expect(rec.specVersion).toBe(1);
    expect(rec.dialogId).toBe('dlg-test-1');
    expect(rec.turnCount).toBe(2);
    expect(rec.wireKey).toBe(dialogWireKey(d));
    expect(rec.label).toBe('standup-2026-04-27');
  });

  it('buildAgentDialogV1Record omits label when not provided (matches equivalence.v1 shape)', () => {
    const rec = buildAgentDialogV1Record(dialog());
    expect('label' in rec).toBe(false);
  });

  it('agent restart simulation: dialog with same canonical content is wire-equivalent across instance churn (W.111)', () => {
    // Two recorders capturing the same dialog from different instances —
    // wallclock would differ; chain-time should not.
    const fromInstanceA = dialog({
      turns: [
        turn({ chainDepth: 0, content: 'load scene', meta: { ref: 'scene-7' } }),
        turn({ chainDepth: 1, content: 'ack', parentHash: 'h0', meta: { ref: 'scene-7' } }),
      ],
    });
    const fromInstanceB_after_restart = dialog({
      turns: [
        turn({ chainDepth: 0, content: 'load scene', meta: { ref: 'scene-7' } }),
        turn({ chainDepth: 1, content: 'ack', parentHash: 'h0', meta: { ref: 'scene-7' } }),
      ],
    });
    expect(wireFormatEquivalentDialog(fromInstanceA, fromInstanceB_after_restart)).toBe(true);
  });
});
