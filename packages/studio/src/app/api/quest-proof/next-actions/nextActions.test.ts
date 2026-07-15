import { describe, expect, it } from 'vitest';
import { buildProposedActions, chipLabel, inferActionType } from './nextActions';

const task = (over: Record<string, unknown> = {}) => ({
  id: (over.id as string) ?? 't1',
  title: (over.title as string) ?? '[wire][studio] Add the inbox tile',
  status: (over.status as string) ?? 'open',
  priority: (over.priority as number) ?? 2,
});

describe('buildProposedActions', () => {
  it('does not turn ordinary open work into a founder approval chip', () => {
    expect(buildProposedActions([task()])).toEqual([]);
    expect(buildProposedActions([task({ title: 'Deploy studio to Railway' })])).toEqual([]);
    expect(buildProposedActions([task({ title: 'Rent a GPU within the active rail' })])).toEqual(
      []
    );
  });

  it('maps an exact-four task to a Joseph-decision view', () => {
    const actions = buildProposedActions([
      task({ title: '[wallet] Change the treasury master wallet' }),
    ]);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      taskId: 't1',
      authorityRoute: 'joseph-exact-four',
      josephReviewClass: 'spend-or-custody',
      reversible: false,
    });
    expect(actions[0].label).toBe('Change the treasury master wallet');
  });

  it('excludes specialist, platform-control, and prohibited routes', () => {
    expect(
      buildProposedActions(
        [
          task({ id: 'legal', title: 'Run legal export-control review' }),
          task({ id: 'platform', title: 'Deploy credential is missing' }),
          task({ id: 'prohibited', title: 'force-push main' }),
        ],
        10
      )
    ).toEqual([]);
  });

  it('includes only open exact-four tasks, ranks by priority, and caps by limit', () => {
    const actions = buildProposedActions(
      [
        task({ id: 'done', status: 'done', title: "Publish under Joseph's name" }),
        task({ id: 'lo', priority: 3, title: 'Change the treasury master wallet' }),
        task({ id: 'hi', priority: 1, title: "Publish under Joseph's name" }),
      ],
      1
    );
    expect(actions.map((action) => action.taskId)).toEqual(['hi']);
  });

  it('retains presentation action-type inference without making it policy', () => {
    expect(inferActionType('build a hololand world')).toBe('spatial');
    expect(inferActionType('rent gpu fleet')).toBe('service_rental');
    expect(inferActionType('Add the founder-approval route')).toBe('code');
  });

  it('tolerates junk input and strips board prefixes', () => {
    expect(buildProposedActions(null)).toEqual([]);
    expect(buildProposedActions([{ status: 'open' }])).toEqual([]);
    expect(chipLabel('[a][b] x')).toBe('x');
  });
});
