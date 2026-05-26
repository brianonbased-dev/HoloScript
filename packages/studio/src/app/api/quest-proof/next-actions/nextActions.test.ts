import { describe, it, expect } from 'vitest';
import { buildProposedActions, inferActionType, chipLabel } from './nextActions';

const task = (over: Record<string, unknown> = {}) => ({
  id: (over.id as string) ?? 't1',
  title: (over.title as string) ?? '[wire][studio] Add the inbox tile',
  status: (over.status as string) ?? 'open',
  priority: (over.priority as number) ?? 2,
});

describe('buildProposedActions', () => {
  it('maps an open board task to a proposed action with a clean label', () => {
    const a = buildProposedActions([task()]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ status: 'proposed', taskId: 't1', actionType: 'code', reversible: true });
    expect(a[0].label).toBe('Add the inbox tile'); // bracket prefixes stripped
  });

  it('FAILING-IF-BROKEN: only OPEN tasks are anticipatable (claimed/blocked/done excluded)', () => {
    const tasks = [task({ id: 'o', status: 'open' }), task({ id: 'c', status: 'claimed' }), task({ id: 'd', status: 'done' })];
    const a = buildProposedActions(tasks, 10);
    expect(a.map((x) => x.taskId)).toEqual(['o']);
  });

  it('SAFETY: irreversible / spend / rental tasks are flagged NOT one-tap (reversible=false)', () => {
    expect(buildProposedActions([task({ title: 'Deploy studio to Railway' })])[0].reversible).toBe(false);
    expect(buildProposedActions([task({ title: 'Rent a vast.ai GPU for the fine-tune' })])[0].reversible).toBe(false);
    expect(buildProposedActions([task({ title: 'force-push main' })])[0].reversible).toBe(false);
  });

  it('ranks by priority ascending and caps by limit', () => {
    const a = buildProposedActions(
      [task({ id: 'lo', priority: 3, title: 'low' }), task({ id: 'hi', priority: 1, title: 'high' })],
      1,
    );
    expect(a).toHaveLength(1);
    expect(a[0].taskId).toBe('hi');
  });

  it('infers actionType from the title', () => {
    expect(inferActionType('build a hololand world')).toBe('spatial');
    expect(inferActionType('rent gpu fleet')).toBe('service_rental');
    expect(inferActionType('fix the parser')).toBe('code');
  });

  it('tolerates junk + non-array input', () => {
    expect(buildProposedActions(null)).toHaveLength(0);
    expect(buildProposedActions([{ status: 'open' }])).toHaveLength(0); // no id/title
    expect(chipLabel('[a][b] x')).toBe('x');
  });
});
