/**
 * DialogTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { DialogTrait, createDialogTrait } from '../DialogTrait';
import type { DialogTree } from '../DialogTrait';

function makeTree(overrides: any = {}): DialogTree {
  return {
    id: 'tree1',
    startNode: 'greeting',
    nodes: {
      greeting: { id: 'greeting', type: 'text', text: 'Hello!', next: 'farewell' },
      farewell: { id: 'farewell', type: 'text', text: 'Goodbye!' },
      ...overrides.nodes,
    },
    ...overrides,
  };
}

// ─── constructor / defaultConfig ──────────────────────────────────────────────

describe('DialogTrait constructor', () => {
  it('has typingSpeed=50 by default', () =>
    expect(new DialogTrait().getConfig().typingSpeed).toBe(50));
  it('has allowSkip=true by default', () =>
    expect(new DialogTrait().getConfig().allowSkip).toBe(true));
  it('has showChoiceNumbers=true by default', () =>
    expect(new DialogTrait().getConfig().showChoiceNumbers).toBe(true));
  it('has inputMode=any by default', () =>
    expect(new DialogTrait().getConfig().inputMode).toBe('any'));
  it('has maxHistory=100 by default', () =>
    expect(new DialogTrait().getConfig().maxHistory).toBe(100));
  it('has autoSaveVariables=true by default', () =>
    expect(new DialogTrait().getConfig().autoSaveVariables).toBe(true));
  it('state is inactive initially', () => expect(new DialogTrait().getState()).toBe('inactive'));
  it('isActive()=false initially', () => expect(new DialogTrait().isActive()).toBe(false));
  it('preloads variables from config', () => {
    const dt = new DialogTrait({ variables: { gold: 100 } });
    expect(dt.getVariable('gold')).toBe(100);
  });
  it('preloads trees from config', () => {
    const dt = new DialogTrait({ trees: [makeTree()] });
    expect(dt.getTreeIds()).toContain('tree1');
  });
  it('createDialogTrait factory works', () => {
    expect(createDialogTrait()).toBeInstanceOf(DialogTrait);
  });
});

// ─── Tree Management ──────────────────────────────────────────────────────────

describe('DialogTrait.addTree / removeTree / getTree', () => {
  it('addTree registers tree by id', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree());
    expect(dt.getTree('tree1')).toBeDefined();
  });
  it('getTreeIds returns added tree ids', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree({ id: 'a' }));
    dt.addTree(makeTree({ id: 'b' }));
    expect(dt.getTreeIds()).toContain('a');
    expect(dt.getTreeIds()).toContain('b');
  });
  it('removeTree deletes the tree', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree());
    dt.removeTree('tree1');
    expect(dt.getTree('tree1')).toBeUndefined();
  });
  it('getTree returns undefined for unknown id', () => {
    expect(new DialogTrait().getTree('none')).toBeUndefined();
  });
  it('accepts nodes as plain object (auto-converts to Map)', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree());
    const tree = dt.getTree('tree1')!;
    expect(tree.nodes).toBeInstanceOf(Map);
  });
});

// ─── start ────────────────────────────────────────────────────────────────────

describe('DialogTrait.start', () => {
  it('returns false for unknown tree', () => {
    const dt = new DialogTrait();
    expect(dt.start('missing')).toBe(false);
  });
  it('returns true for known tree', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree());
    expect(dt.start('tree1')).toBe(true);
  });
  it('state becomes active after start', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree());
    dt.start('tree1');
    expect(dt.isActive()).toBe(true);
  });
  it('fires start event', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree());
    const cb = vi.fn();
    dt.on('start', cb);
    dt.start('tree1');
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: 'start', treeId: 'tree1' }));
  });
  it('fires node-enter event for startNode', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree());
    const cb = vi.fn();
    dt.on('node-enter', cb);
    dt.start('tree1');
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: 'node-enter' }));
  });
  it('can start at a specific node (override)', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree());
    const cb = vi.fn();
    dt.on('node-enter', cb);
    dt.start('tree1', 'farewell');
    expect(cb.mock.calls[0][0].node.id).toBe('farewell');
  });
  it('initializes localVariables scoped to treeId', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree({ id: 'tree1', localVariables: { count: 0 } }));
    dt.start('tree1');
    expect(dt.getVariable('tree1.count')).toBe(0);
  });
  it('records history entry for startNode', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree());
    dt.start('tree1');
    expect(dt.getHistory().length).toBeGreaterThanOrEqual(1);
    expect(dt.getHistory()[0].nodeId).toBe('greeting');
  });
});

// ─── getCurrentNode / getCurrentText / getCurrentSpeaker ──────────────────────

describe('DialogTrait text and speaker', () => {
  it('getCurrentText returns interpolated text', () => {
    const dt = new DialogTrait({ variables: { name: 'Alice' } });
    dt.addTree(
      makeTree({
        nodes: { greeting: { id: 'greeting', type: 'text', text: 'Hi ${name}!', next: null } },
      })
    );
    dt.start('tree1');
    expect(dt.getCurrentText()).toBe('Hi Alice!');
  });
  it('leaves unknown variables as-is', () => {
    const dt = new DialogTrait();
    dt.addTree(
      makeTree({
        nodes: { greeting: { id: 'greeting', type: 'text', text: 'Hi ${unknown}!', next: null } },
      })
    );
    dt.start('tree1');
    expect(dt.getCurrentText()).toBe('Hi ${unknown}!');
  });
  it('getVisibleText returns empty when progress=0', () => {
    const dt = new DialogTrait({ typingSpeed: 999999 });
    dt.addTree(makeTree());
    dt.start('tree1');
    expect(dt.getVisibleText()).toBe('');
  });
  it('getCurrentSpeaker returns node speaker', () => {
    const dt = new DialogTrait();
    dt.addTree(
      makeTree({
        nodes: {
          greeting: { id: 'greeting', type: 'text', text: 'Hi', speaker: 'NPC', next: null },
        },
      })
    );
    dt.start('tree1');
    expect(dt.getCurrentSpeaker()).toBe('NPC');
  });
  it('getCurrentSpeaker falls back to defaultSpeaker', () => {
    const dt = new DialogTrait();
    dt.addTree(
      makeTree({
        defaultSpeaker: 'Guard',
        nodes: { greeting: { id: 'greeting', type: 'text', text: 'Hi', next: null } },
      })
    );
    dt.start('tree1');
    expect(dt.getCurrentSpeaker()).toBe('Guard');
  });
});

// ─── Variables ────────────────────────────────────────────────────────────────

describe('DialogTrait.variables', () => {
  it('setVariable + getVariable round-trip', () => {
    const dt = new DialogTrait();
    dt.setVariable('score', 42);
    expect(dt.getVariable('score')).toBe(42);
  });
  it('getVariables returns all variables as plain object', () => {
    const dt = new DialogTrait({ variables: { a: 1, b: 2 } });
    const vars = dt.getVariables();
    expect(vars.a).toBe(1);
    expect(vars.b).toBe(2);
  });
  it('clearVariables empties the map', () => {
    const dt = new DialogTrait({ variables: { a: 1 } });
    dt.clearVariables();
    expect(dt.getVariables()).toEqual({});
  });
});

// ─── Conditions ───────────────────────────────────────────────────────────────

describe('DialogTrait conditions via getAvailableChoices', () => {
  function makeChoiceTree(conditionExtraVars: any = {}) {
    const dt = new DialogTrait({ variables: { gold: 50, ...conditionExtraVars } });
    dt.addTree({
      id: 'ct',
      startNode: 'q',
      nodes: new Map([
        [
          'q',
          {
            id: 'q',
            type: 'choice',
            text: 'Choose',
            choices: [
              {
                text: 'Rich option',
                next: null,
                condition: { variable: 'gold', operator: '>=', value: 100 },
              },
              { text: 'Poor option', next: null },
              {
                text: 'Named option',
                next: null,
                condition: { variable: 'name', operator: '==', value: 'Alice' },
              },
            ],
          },
        ],
      ]),
    });
    dt.start('ct');
    return dt;
  }
  it('shows choice when condition met (== operator)', () => {
    const dt = new DialogTrait({ variables: { name: 'Alice' } });
    dt.addTree({
      id: 'ct',
      startNode: 'q',
      nodes: new Map([
        [
          'q',
          {
            id: 'q',
            type: 'choice',
            choices: [
              {
                text: 'A',
                next: null,
                condition: { variable: 'name', operator: '==', value: 'Alice' },
              },
            ],
          },
        ],
      ]),
    });
    dt.start('ct');
    expect(dt.getAvailableChoices()).toHaveLength(1);
  });
  it('hides choice when condition not met', () => {
    const dt = new DialogTrait({ variables: { gold: 50 } });
    dt.addTree({
      id: 'ct',
      startNode: 'q',
      nodes: new Map([
        [
          'q',
          {
            id: 'q',
            type: 'choice',
            choices: [
              {
                text: 'Rich',
                next: null,
                condition: { variable: 'gold', operator: '>=', value: 100 },
              },
            ],
          },
        ],
      ]),
    });
    dt.start('ct');
    expect(dt.getAvailableChoices()).toHaveLength(0);
  });
  it('!= operator passes', () => {
    const dt = new DialogTrait({ variables: { status: 'active' } });
    dt.addTree({
      id: 'ct',
      startNode: 'q',
      nodes: new Map([
        [
          'q',
          {
            id: 'q',
            type: 'choice',
            choices: [
              {
                text: 'ok',
                next: null,
                condition: { variable: 'status', operator: '!=', value: 'inactive' },
              },
            ],
          },
        ],
      ]),
    });
    dt.start('ct');
    expect(dt.getAvailableChoices()).toHaveLength(1);
  });
  it('contains operator with array', () => {
    const dt = new DialogTrait({ variables: { items: ['sword', 'shield'] } });
    dt.addTree({
      id: 'ct',
      startNode: 'q',
      nodes: new Map([
        [
          'q',
          {
            id: 'q',
            type: 'choice',
            choices: [
              {
                text: 'ok',
                next: null,
                condition: { variable: 'items', operator: 'contains', value: 'sword' },
              },
            ],
          },
        ],
      ]),
    });
    dt.start('ct');
    expect(dt.getAvailableChoices()).toHaveLength(1);
  });
  it('not_contains operator with array', () => {
    const dt = new DialogTrait({ variables: { items: ['axe'] } });
    dt.addTree({
      id: 'ct',
      startNode: 'q',
      nodes: new Map([
        [
          'q',
          {
            id: 'q',
            type: 'choice',
            choices: [
              {
                text: 'ok',
                next: null,
                condition: { variable: 'items', operator: 'not_contains', value: 'sword' },
              },
            ],
          },
        ],
      ]),
    });
    dt.start('ct');
    expect(dt.getAvailableChoices()).toHaveLength(1);
  });
  it('< and > operators work', () => {
    const dt = new DialogTrait({ variables: { hp: 10 } });
    dt.addTree({
      id: 'ct',
      startNode: 'q',
      nodes: new Map([
        [
          'q',
          {
            id: 'q',
            type: 'choice',
            choices: [
              { text: 'low', next: null, condition: { variable: 'hp', operator: '<', value: 50 } },
              { text: 'high', next: null, condition: { variable: 'hp', operator: '>', value: 50 } },
            ],
          },
        ],
      ]),
    });
    dt.start('ct');
    const available = dt.getAvailableChoices();
    expect(available).toHaveLength(1);
    expect(available[0].text).toBe('low');
  });
});

// ─── selectChoice ─────────────────────────────────────────────────────────────

describe('DialogTrait.selectChoice', () => {
  function makeChoiceDt() {
    const dt = new DialogTrait({ typingSpeed: 9999999 });
    dt.addTree({
      id: 'ct',
      startNode: 'q',
      nodes: {
        q: {
          id: 'q',
          type: 'choice',
          choices: [
            { text: 'Yes', next: 'end' },
            { text: 'No', next: null },
          ],
        },
        end: { id: 'end', type: 'text', text: 'Done.' },
      },
    });
    dt.start('ct');
    return dt;
  }
  it('returns false when state != waiting_choice', () => {
    const dt = new DialogTrait();
    expect(dt.selectChoice(0)).toBe(false);
  });
  it('returns false for out-of-range index', () => {
    const dt = makeChoiceDt();
    expect(dt.selectChoice(99)).toBe(false);
  });
  it('returns true for valid choice', () => {
    const dt = makeChoiceDt();
    expect(dt.selectChoice(0)).toBe(true);
  });
  it('fires choice-made event', () => {
    const dt = makeChoiceDt();
    const cb = vi.fn();
    dt.on('choice-made', cb);
    dt.selectChoice(0);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'choice-made', choiceIndex: 0 })
    );
  });
  it('navigates to next node after selection', () => {
    const dt = makeChoiceDt();
    const cb = vi.fn();
    dt.on('node-enter', cb);
    dt.selectChoice(0); // next: 'end'
    const lastCall = cb.mock.calls[cb.mock.calls.length - 1];
    expect(lastCall[0].node.id).toBe('end');
  });
  it('ends dialog when next=null', () => {
    const dt = makeChoiceDt();
    dt.selectChoice(1); // next: null → end
    expect(dt.getState()).toBe('inactive');
  });
  it('does not select disabled choice', () => {
    const dt = new DialogTrait({ typingSpeed: 9999999 });
    dt.addTree({
      id: 'ct',
      startNode: 'q',
      nodes: {
        q: { id: 'q', type: 'choice', choices: [{ text: 'Disabled', next: null, disabled: true }] },
      },
    });
    dt.start('ct');
    expect(dt.selectChoice(0)).toBe(false);
  });
  it('records choiceIndex in history', () => {
    const dt = makeChoiceDt();
    dt.selectChoice(1);
    const h = dt.getHistory();
    expect(h[h.length - 2]?.choiceIndex ?? h[h.length - 1]?.choiceIndex).toBeDefined();
  });
  it('executes set_variable action on choice', () => {
    const dt = new DialogTrait({ typingSpeed: 9999999 });
    dt.addTree({
      id: 'ct',
      startNode: 'q',
      nodes: new Map([
        [
          'q',
          {
            id: 'q',
            type: 'choice',
            choices: [
              {
                text: 'Pick',
                next: null,
                actions: [{ type: 'set_variable', target: 'picked', value: true }],
              },
            ],
          },
        ],
      ]),
    });
    dt.start('ct');
    dt.selectChoice(0);
    expect(dt.getVariable('picked')).toBe(true);
  });
});

// ─── Branch node ──────────────────────────────────────────────────────────────

describe('DialogTrait — branch node', () => {
  it('follows matching branch condition', () => {
    const dt = new DialogTrait({ variables: { vip: true } });
    dt.addTree({
      id: 'bt',
      startNode: 'branch',
      nodes: {
        branch: {
          id: 'branch',
          type: 'branch',
          branches: [
            { condition: { variable: 'vip', operator: '==', value: true }, next: 'vip_node' },
          ],
        },
        vip_node: { id: 'vip_node', type: 'text', text: 'VIP!' },
      },
    });
    const cb = vi.fn();
    dt.on('node-enter', cb);
    dt.start('bt');
    const entered = cb.mock.calls.map((c: any[]) => c[0].node.id);
    expect(entered).toContain('vip_node');
  });
  it('falls to node.next when no branch matches', () => {
    const dt = new DialogTrait({ variables: { vip: false } });
    dt.addTree({
      id: 'bt',
      startNode: 'branch',
      nodes: {
        branch: {
          id: 'branch',
          type: 'branch',
          next: 'fallback',
          branches: [
            { condition: { variable: 'vip', operator: '==', value: true }, next: 'vip_node' },
          ],
        },
        vip_node: { id: 'vip_node', type: 'text', text: 'VIP' },
        fallback: { id: 'fallback', type: 'text', text: 'Normal' },
      },
    });
    const cb = vi.fn();
    dt.on('node-enter', cb);
    dt.start('bt');
    const entered = cb.mock.calls.map((c: any[]) => c[0].node.id);
    expect(entered).toContain('fallback');
    expect(entered).not.toContain('vip_node');
  });
});

// ─── continue / end ───────────────────────────────────────────────────────────

describe('DialogTrait.continue + end', () => {
  it('continue() returns false when waiting for choice', () => {
    const dt = new DialogTrait({ typingSpeed: 9999999 });
    dt.addTree({
      id: 't',
      startNode: 'q',
      nodes: { q: { id: 'q', type: 'choice', choices: [{ text: 'x', next: null }] } },
    });
    dt.start('t');
    expect(dt.continue()).toBe(false);
  });
  it('end() sets state to inactive and fires end event', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree());
    dt.start('tree1');
    const cb = vi.fn();
    dt.on('end', cb);
    dt.end();
    expect(dt.getState()).toBe('inactive');
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: 'end' }));
  });
});

// ─── pause / resume ───────────────────────────────────────────────────────────

describe('DialogTrait.pause + resume', () => {
  it('pause() sets state to paused from active', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree());
    dt.start('tree1');
    dt.pause();
    expect(dt.getState()).toBe('paused');
  });
  it('resume() restores active state', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree());
    dt.start('tree1');
    dt.pause();
    dt.resume();
    expect(dt.getState()).toBe('active');
  });
  it('resume() restores waiting_choice state when node has choices', () => {
    const dt = new DialogTrait({ typingSpeed: 9999999 });
    dt.addTree({
      id: 't',
      startNode: 'q',
      nodes: { q: { id: 'q', type: 'choice', choices: [{ text: 'x', next: null }] } },
    });
    dt.start('t');
    dt.pause();
    dt.resume();
    expect(dt.getState()).toBe('waiting_choice');
  });
});

// ─── History ──────────────────────────────────────────────────────────────────

describe('DialogTrait.history', () => {
  it('clearHistory empties the history', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree());
    dt.start('tree1');
    dt.clearHistory();
    expect(dt.getHistory()).toHaveLength(0);
  });
  it('getHistory returns a copy (mutation does not affect internal state)', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree());
    dt.start('tree1');
    const h = dt.getHistory();
    h.push({ nodeId: 'fake', timestamp: 0 });
    expect(dt.getHistory()).not.toContainEqual({ nodeId: 'fake', timestamp: 0 });
  });
  it('goBack returns false when not enough history', () => {
    const dt = new DialogTrait();
    expect(dt.goBack()).toBe(false);
  });
});

// ─── skipText ─────────────────────────────────────────────────────────────────

describe('DialogTrait.skipText', () => {
  it('skipText immediately completes text progress', () => {
    const dt = new DialogTrait({ typingSpeed: 1, allowSkip: true });
    dt.addTree(
      makeTree({
        nodes: { greeting: { id: 'greeting', type: 'text', text: 'Hello!', next: null } },
      })
    );
    dt.start('tree1');
    dt.skipText();
    expect(dt.getTextProgress()).toBe('Hello!'.length);
  });
  it('skipText fires text-complete event', () => {
    const dt = new DialogTrait({ typingSpeed: 1, allowSkip: true });
    dt.addTree(
      makeTree({ nodes: { greeting: { id: 'greeting', type: 'text', text: 'Hi', next: null } } })
    );
    dt.start('tree1');
    const cb = vi.fn();
    dt.on('text-complete', cb);
    dt.skipText();
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: 'text-complete' }));
  });
  it('skipText is no-op when allowSkip=false', () => {
    const dt = new DialogTrait({ typingSpeed: 9999999, allowSkip: false });
    dt.addTree(
      makeTree({
        nodes: { greeting: { id: 'greeting', type: 'text', text: 'Hello!', next: null } },
      })
    );
    dt.start('tree1');
    dt.skipText();
    expect(dt.getTextProgress()).toBe(0);
  });
});

// ─── onEnter actions / set_variable ──────────────────────────────────────────

describe('DialogTrait.onEnter actions', () => {
  it('executes set_variable action on node enter', () => {
    const dt = new DialogTrait({ typingSpeed: 9999999 });
    dt.addTree({
      id: 't',
      startNode: 'n',
      nodes: {
        n: {
          id: 'n',
          type: 'text',
          text: 'Hi',
          onEnter: [{ type: 'set_variable', target: 'visited', value: true }],
        },
      },
    });
    dt.start('t');
    expect(dt.getVariable('visited')).toBe(true);
  });
  it('fires action-executed event for each action', () => {
    const dt = new DialogTrait({ typingSpeed: 9999999 });
    dt.addTree({
      id: 't',
      startNode: 'n',
      nodes: {
        n: {
          id: 'n',
          type: 'text',
          text: 'Hi',
          onEnter: [{ type: 'set_variable', target: 'x', value: 1 }],
        },
      },
    });
    const cb = vi.fn();
    dt.on('action-executed', cb);
    dt.start('t');
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ type: 'action-executed' }));
  });
});

// ─── Event listeners ─────────────────────────────────────────────────────────

describe('DialogTrait.on / off', () => {
  it('off removes listener so it is no longer called', () => {
    const dt = new DialogTrait();
    dt.addTree(makeTree());
    const cb = vi.fn();
    dt.on('start', cb);
    dt.off('start', cb);
    dt.start('tree1');
    expect(cb).not.toHaveBeenCalled();
  });
});

// ─── exportState / importState ────────────────────────────────────────────────

describe('DialogTrait.exportState / importState', () => {
  it('exportState returns variables and history', () => {
    const dt = new DialogTrait({ variables: { score: 10 } });
    dt.addTree(makeTree());
    dt.start('tree1');
    const state = dt.exportState();
    expect(state.variables.score).toBe(10);
    expect(state.history.length).toBeGreaterThanOrEqual(1);
  });
  it('importState restores variables', () => {
    const dt = new DialogTrait();
    dt.importState({ variables: { gold: 999 } });
    expect(dt.getVariable('gold')).toBe(999);
  });
  it('importState replaces existing variables', () => {
    const dt = new DialogTrait({ variables: { old: true } });
    dt.importState({ variables: { fresh: 1 } });
    expect(dt.getVariable('old')).toBeUndefined();
    expect(dt.getVariable('fresh')).toBe(1);
  });
  it('importState restores history', () => {
    const dt = new DialogTrait();
    dt.importState({ history: [{ nodeId: 'n1', timestamp: 1000 }] });
    expect(dt.getHistory()[0].nodeId).toBe('n1');
  });
});
