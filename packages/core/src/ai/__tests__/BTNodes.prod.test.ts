/**
 * BTNodes.prod.test.ts — Sprint CLXX
 *
 * Production tests for all behavior-tree node types exported from BTNodes.ts.
 *
 * Node types:
 *   Composite:  SequenceNode, SelectorNode, ParallelNode
 *   Decorator:  InverterNode, RepeaterNode, GuardNode
 *   Leaf:       ActionNode, ConditionNode, WaitNode
 *
 * BTStatus: 'success' | 'failure' | 'running' | 'ready'
 * BTContext: { blackboard: { get, set }, deltaTime: number, entity: string }
 */

import { describe, it, expect } from 'vitest';
import {
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
import type { BTContext, BTStatus } from '@holoscript/framework/ai';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const store: Record<string, unknown> = {};

function makeCtx(deltaTime = 0.016, entity = 'agent'): BTContext {
  const bb = new Map<string, unknown>();
  return {
    blackboard: {
      get: (k: string) => bb.get(k),
      set: (k: string, v: unknown) => {
        bb.set(k, v);
      },
    },
    deltaTime,
    entity,
  };
}

function always(status: BTStatus) {
  return new ActionNode(`always-${status}`, () => status);
}

// ---------------------------------------------------------------------------
// ActionNode
// ---------------------------------------------------------------------------

describe('ActionNode', () => {
  it('returns the status from the action callback', () => {
    const node = always('success');
    expect(node.tick(makeCtx())).toBe('success');
  });

  it('can return failure', () => {
    expect(always('failure').tick(makeCtx())).toBe('failure');
  });

  it('can return running', () => {
    expect(always('running').tick(makeCtx())).toBe('running');
  });

  it('stores returned status in node.status', () => {
    const n = always('success');
    n.tick(makeCtx());
    expect(n.status).toBe('success');
  });

  it('context is passed to the action', () => {
    let received: BTContext | null = null;
    const n = new ActionNode('spy', (ctx) => {
      received = ctx;
      return 'success';
    });
    const ctx = makeCtx();
    n.tick(ctx);
    expect(received).toBe(ctx);
  });
});

// ---------------------------------------------------------------------------
// ConditionNode
// ---------------------------------------------------------------------------

describe('ConditionNode', () => {
  it('returns success when condition is true', () => {
    const n = new ConditionNode('cond', () => true);
    expect(n.tick(makeCtx())).toBe('success');
  });

  it('returns failure when condition is false', () => {
    const n = new ConditionNode('cond', () => false);
    expect(n.tick(makeCtx())).toBe('failure');
  });

  it('condition receives context', () => {
    let got: BTContext | null = null;
    const n = new ConditionNode('spy', (ctx) => {
      got = ctx;
      return true;
    });
    const ctx = makeCtx();
    n.tick(ctx);
    expect(got).toBe(ctx);
  });
});

// ---------------------------------------------------------------------------
// WaitNode
// ---------------------------------------------------------------------------

describe('WaitNode', () => {
  it('returns running before duration elapsed', () => {
    const n = new WaitNode('wait', 2); // 2-second wait
    expect(n.tick(makeCtx(0.5))).toBe('running');
  });

  it('returns success once duration elapsed', () => {
    const n = new WaitNode('wait', 0.5);
    n.tick(makeCtx(0.3));
    expect(n.tick(makeCtx(0.3))).toBe('success');
  });

  it('resets elapsed on success so next tick restarts', () => {
    const n = new WaitNode('wait', 0.5);
    n.tick(makeCtx(0.5)); // success, elapsed reset
    expect(n.tick(makeCtx(0.1))).toBe('running'); // not done yet
  });

  it('reset() resets elapsed', () => {
    const n = new WaitNode('wait', 0.5);
    n.tick(makeCtx(0.4)); // almost done
    n.reset();
    expect(n.tick(makeCtx(0.2))).toBe('running'); // restarted
  });
});

// ---------------------------------------------------------------------------
// SequenceNode
// ---------------------------------------------------------------------------

describe('SequenceNode', () => {
  it('returns success when all children succeed', () => {
    const n = new SequenceNode('seq', [always('success'), always('success')]);
    expect(n.tick(makeCtx())).toBe('success');
  });

  it('returns failure on first failing child', () => {
    const n = new SequenceNode('seq', [always('success'), always('failure'), always('success')]);
    expect(n.tick(makeCtx())).toBe('failure');
  });

  it('returns running when a child is running', () => {
    const n = new SequenceNode('seq', [always('success'), always('running'), always('success')]);
    expect(n.tick(makeCtx())).toBe('running');
  });

  it('short-circuits after failure (later children not ticked)', () => {
    let thirdCalled = false;
    const n = new SequenceNode('seq', [
      always('failure'),
      new ActionNode('spy', () => {
        thirdCalled = true;
        return 'success';
      }),
    ]);
    n.tick(makeCtx());
    expect(thirdCalled).toBe(false);
  });

  it('reset() clears currentIndex', () => {
    const n = new SequenceNode('seq', [always('running'), always('success')]);
    n.tick(makeCtx()); // paused at first
    n.reset();
    // After reset, starts fresh — first child is 'running' again
    expect(n.tick(makeCtx())).toBe('running');
  });

  it('empty sequence returns success', () => {
    const n = new SequenceNode('seq', []);
    expect(n.tick(makeCtx())).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// SelectorNode
// ---------------------------------------------------------------------------

describe('SelectorNode', () => {
  it('returns success on first successful child', () => {
    const n = new SelectorNode('sel', [always('failure'), always('success')]);
    expect(n.tick(makeCtx())).toBe('success');
  });

  it('returns failure when all children fail', () => {
    const n = new SelectorNode('sel', [always('failure'), always('failure')]);
    expect(n.tick(makeCtx())).toBe('failure');
  });

  it('returns running when a child is running', () => {
    const n = new SelectorNode('sel', [always('failure'), always('running')]);
    expect(n.tick(makeCtx())).toBe('running');
  });

  it('short-circuits after success (later children not ticked)', () => {
    let laterCalled = false;
    const n = new SelectorNode('sel', [
      always('success'),
      new ActionNode('spy', () => {
        laterCalled = true;
        return 'success';
      }),
    ]);
    n.tick(makeCtx());
    expect(laterCalled).toBe(false);
  });

  it('empty selector returns failure', () => {
    const n = new SelectorNode('sel', []);
    expect(n.tick(makeCtx())).toBe('failure');
  });
});

// ---------------------------------------------------------------------------
// ParallelNode
// ---------------------------------------------------------------------------

describe('ParallelNode', () => {
  it('returns success when all children succeed (all required)', () => {
    const n = new ParallelNode('par', [always('success'), always('success')]);
    expect(n.tick(makeCtx())).toBe('success');
  });

  it('returns running if not enough successes yet', () => {
    const n = new ParallelNode('par', [always('running'), always('running')]);
    expect(n.tick(makeCtx())).toBe('running');
  });

  it('partial-success threshold: 1 of 2 sufficient', () => {
    const n = new ParallelNode('par', [always('success'), always('failure')], 1);
    expect(n.tick(makeCtx())).toBe('success');
  });

  it('returns failure when too many children fail', () => {
    // requiredSuccesses = 2, but all 2 fail → failures > (2 - 2) = 0
    const n = new ParallelNode('par', [always('failure'), always('failure')], 2);
    expect(n.tick(makeCtx())).toBe('failure');
  });

  it('ticks ALL children regardless of results', () => {
    let count = 0;
    const n = new ParallelNode('par', [
      new ActionNode('a', () => {
        count++;
        return 'success';
      }),
      new ActionNode('b', () => {
        count++;
        return 'failure';
      }),
    ]);
    n.tick(makeCtx());
    expect(count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// InverterNode
// ---------------------------------------------------------------------------

describe('InverterNode', () => {
  it('inverts success to failure', () => {
    const n = new InverterNode('inv', always('success'));
    expect(n.tick(makeCtx())).toBe('failure');
  });

  it('inverts failure to success', () => {
    const n = new InverterNode('inv', always('failure'));
    expect(n.tick(makeCtx())).toBe('success');
  });

  it('passes through running unchanged', () => {
    const n = new InverterNode('inv', always('running'));
    expect(n.tick(makeCtx())).toBe('running');
  });
});

// ---------------------------------------------------------------------------
// RepeaterNode
// ---------------------------------------------------------------------------

describe('RepeaterNode', () => {
  it('repeats the child and returns running until done', () => {
    const n = new RepeaterNode('rep', always('success'), 3);
    expect(n.tick(makeCtx())).toBe('running'); // 1/3
    expect(n.tick(makeCtx())).toBe('running'); // 2/3
    expect(n.tick(makeCtx())).toBe('success'); // 3/3 done
  });

  it('also repeats on child failure', () => {
    const n = new RepeaterNode('rep', always('failure'), 2);
    n.tick(makeCtx()); // 1/2 → running
    expect(n.tick(makeCtx())).toBe('success'); // 2/2 done
  });

  it('infinite repeat returns running indefinitely', () => {
    const n = new RepeaterNode('rep', always('success')); // Infinity
    for (let i = 0; i < 100; i++) {
      expect(n.tick(makeCtx())).toBe('running');
    }
  });

  it('reset() allows repeating again', () => {
    const n = new RepeaterNode('rep', always('success'), 1);
    n.tick(makeCtx()); // done
    n.reset();
    expect(n.tick(makeCtx())).toBe('success'); // done again
  });
});

// ---------------------------------------------------------------------------
// GuardNode
// ---------------------------------------------------------------------------

describe('GuardNode', () => {
  it('returns failure when condition is false (child not ticked)', () => {
    let childCalled = false;
    const child = new ActionNode('child', () => {
      childCalled = true;
      return 'success';
    });
    const n = new GuardNode('guard', () => false, child);
    expect(n.tick(makeCtx())).toBe('failure');
    expect(childCalled).toBe(false);
  });

  it('delegates to child when condition is true', () => {
    const n = new GuardNode('guard', () => true, always('success'));
    expect(n.tick(makeCtx())).toBe('success');
  });

  it('condition receives context', () => {
    let received: BTContext | null = null;
    const n = new GuardNode(
      'guard',
      (ctx) => {
        received = ctx;
        return true;
      },
      always('success')
    );
    const ctx = makeCtx();
    n.tick(ctx);
    expect(received).toBe(ctx);
  });

  it('returns child failure when condition passes but child fails', () => {
    const n = new GuardNode('guard', () => true, always('failure'));
    expect(n.tick(makeCtx())).toBe('failure');
  });
});

// ---------------------------------------------------------------------------
// reset() base behavior
// ---------------------------------------------------------------------------

describe('BTNode.reset()', () => {
  it('sets status back to ready', () => {
    const n = always('success');
    n.tick(makeCtx());
    expect(n.status).toBe('success');
    n.reset();
    expect(n.status).toBe('ready');
  });

  it('propagates reset to children recursively', () => {
    const child = always('success');
    const n = new SequenceNode('seq', [child]);
    n.tick(makeCtx());
    n.reset();
    expect(child.status).toBe('ready');
  });
});
