import { describe, it, expect, vi } from 'vitest';
import {
  BTNode,
  BTContext,
  SequenceNode,
  SelectorNode,
  ParallelNode,
  InverterNode,
  RepeaterNode,
  GuardNode,
  ActionNode,
  ConditionNode,
  WaitNode,
} from '@holoscript/framework/ai';

const ctx = (dt = 0.016): BTContext => ({
  blackboard: { get: vi.fn(), set: vi.fn() },
  deltaTime: dt,
  entity: 'e',
});

describe('BTNodes', () => {
  // ---------------------------------------------------------------------------
  // ActionNode
  // ---------------------------------------------------------------------------

  describe('ActionNode', () => {
    it('returns action result as status', () => {
      const node = new ActionNode('act', () => 'success');
      expect(node.tick(ctx())).toBe('success');
      expect(node.status).toBe('success');
    });

    it('can return running', () => {
      const node = new ActionNode('act', () => 'running');
      expect(node.tick(ctx())).toBe('running');
    });
  });

  // ---------------------------------------------------------------------------
  // ConditionNode
  // ---------------------------------------------------------------------------

  describe('ConditionNode', () => {
    it('true → success', () => {
      expect(new ConditionNode('c', () => true).tick(ctx())).toBe('success');
    });

    it('false → failure', () => {
      expect(new ConditionNode('c', () => false).tick(ctx())).toBe('failure');
    });
  });

  // ---------------------------------------------------------------------------
  // WaitNode
  // ---------------------------------------------------------------------------

  describe('WaitNode', () => {
    it('returns running until duration elapsed', () => {
      const w = new WaitNode('wait', 1);
      expect(w.tick(ctx(0.5))).toBe('running');
      expect(w.tick(ctx(0.5))).toBe('success');
    });

    it('reset clears elapsed time', () => {
      const w = new WaitNode('wait', 1);
      w.tick(ctx(0.5));
      w.reset();
      expect(w.tick(ctx(0.5))).toBe('running'); // started over
    });
  });

  // ---------------------------------------------------------------------------
  // SequenceNode
  // ---------------------------------------------------------------------------

  describe('SequenceNode', () => {
    it('runs children in order, succeeds when all succeed', () => {
      const order: string[] = [];
      const seq = new SequenceNode('s', [
        new ActionNode('1', () => {
          order.push('1');
          return 'success';
        }),
        new ActionNode('2', () => {
          order.push('2');
          return 'success';
        }),
      ]);
      expect(seq.tick(ctx())).toBe('success');
      expect(order).toEqual(['1', '2']);
    });

    it('fails immediately when a child fails', () => {
      const seq = new SequenceNode('s', [
        new ActionNode('ok', () => 'success'),
        new ActionNode('fail', () => 'failure'),
        new ActionNode('skip', () => 'success'),
      ]);
      expect(seq.tick(ctx())).toBe('failure');
    });

    it('returns running and resumes on next tick', () => {
      let runCount = 0;
      const seq = new SequenceNode('s', [
        new ActionNode('a', () => 'success'),
        new ActionNode('b', () => (++runCount < 2 ? 'running' : 'success')),
      ]);
      expect(seq.tick(ctx())).toBe('running');
      expect(seq.tick(ctx())).toBe('success');
    });
  });

  // ---------------------------------------------------------------------------
  // SelectorNode
  // ---------------------------------------------------------------------------

  describe('SelectorNode', () => {
    it('succeeds on first successful child', () => {
      const sel = new SelectorNode('s', [
        new ActionNode('f', () => 'failure'),
        new ActionNode('ok', () => 'success'),
      ]);
      expect(sel.tick(ctx())).toBe('success');
    });

    it('fails when all children fail', () => {
      const sel = new SelectorNode('s', [
        new ActionNode('f1', () => 'failure'),
        new ActionNode('f2', () => 'failure'),
      ]);
      expect(sel.tick(ctx())).toBe('failure');
    });
  });

  // ---------------------------------------------------------------------------
  // ParallelNode
  // ---------------------------------------------------------------------------

  describe('ParallelNode', () => {
    it('succeeds when enough children succeed', () => {
      const par = new ParallelNode(
        'p',
        [
          new ActionNode('a', () => 'success'),
          new ActionNode('b', () => 'success'),
          new ActionNode('c', () => 'failure'),
        ],
        2
      );
      expect(par.tick(ctx())).toBe('success');
    });

    it('fails when too many children fail', () => {
      const par = new ParallelNode(
        'p',
        [new ActionNode('a', () => 'failure'), new ActionNode('b', () => 'failure')],
        2
      );
      expect(par.tick(ctx())).toBe('failure');
    });

    it('running when not yet decided', () => {
      const par = new ParallelNode(
        'p',
        [new ActionNode('a', () => 'success'), new ActionNode('b', () => 'running')],
        2
      );
      expect(par.tick(ctx())).toBe('running');
    });
  });

  // ---------------------------------------------------------------------------
  // InverterNode
  // ---------------------------------------------------------------------------

  describe('InverterNode', () => {
    it('inverts success to failure', () => {
      const inv = new InverterNode('i', new ActionNode('a', () => 'success'));
      expect(inv.tick(ctx())).toBe('failure');
    });

    it('inverts failure to success', () => {
      const inv = new InverterNode('i', new ActionNode('a', () => 'failure'));
      expect(inv.tick(ctx())).toBe('success');
    });

    it('passes running through unchanged', () => {
      const inv = new InverterNode('i', new ActionNode('a', () => 'running'));
      expect(inv.tick(ctx())).toBe('running');
    });
  });

  // ---------------------------------------------------------------------------
  // RepeaterNode
  // ---------------------------------------------------------------------------

  describe('RepeaterNode', () => {
    it('repeats child N times', () => {
      let count = 0;
      const rep = new RepeaterNode(
        'r',
        new ActionNode('a', () => {
          count++;
          return 'success';
        }),
        3
      );
      // Each tick increments count and returns running until limit
      rep.tick(ctx()); // count=1, returns running
      rep.tick(ctx()); // count=2, returns running
      const status = rep.tick(ctx()); // count=3, returns success
      expect(count).toBe(3);
      expect(status).toBe('success');
    });

    it('reset clears repeat count', () => {
      let count = 0;
      const rep = new RepeaterNode(
        'r',
        new ActionNode('a', () => {
          count++;
          return 'success';
        }),
        1
      );
      rep.tick(ctx()); // count=1
      rep.reset();
      expect(rep.tick(ctx())).toBe('success'); // restarted
      expect(count).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // GuardNode
  // ---------------------------------------------------------------------------

  describe('GuardNode', () => {
    it('executes child when condition true', () => {
      const guard = new GuardNode('g', () => true, new ActionNode('a', () => 'success'));
      expect(guard.tick(ctx())).toBe('success');
    });

    it('returns failure when condition false', () => {
      const guard = new GuardNode('g', () => false, new ActionNode('a', () => 'success'));
      expect(guard.tick(ctx())).toBe('failure');
    });
  });

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  it('BTNode.reset cascades to children', () => {
    const child = new ActionNode('a', () => 'success');
    const seq = new SequenceNode('s', [child]);
    seq.tick(ctx());
    expect(seq.status).toBe('success');
    seq.reset();
    expect(seq.status).toBe('ready');
    expect(child.status).toBe('ready');
  });
});
