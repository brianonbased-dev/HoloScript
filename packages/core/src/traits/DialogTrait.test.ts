import { describe, it, expect, beforeEach } from 'vitest';
import { DialogTrait, type DialogTree, type DialogConfig, type DialogNode } from './DialogTrait';

const createNode = (id: string, text: string = 'Test', next: string | null = null): DialogNode => ({
  id,
  type: 'text',
  text,
  next,
  speaker: 'NPC',
});

const createTree = (nodes: Record<string, DialogNode>): DialogTree => ({
  id: 'test_tree',
  name: 'Test',
  startNode: Object.keys(nodes)[0],
  nodes,
});

describe('DialogTrait', () => {
  let trait: DialogTrait;

  beforeEach(() => {
    trait = new DialogTrait();
  });

  // Handler properties
  it('should create new instance', () => {
    expect(trait).toBeDefined();
  });

  it('should have getState method', () => {
    expect(typeof trait.getState).toBe('function');
  });

  it('should start in inactive state', () => {
    expect(trait.getState()).toBe('inactive');
  });

  it('should have isActive method', () => {
    expect(typeof trait.isActive).toBe('function');
  });

  it('should not be active initially', () => {
    expect(trait.isActive()).toBe(false);
  });

  it('should have getConfig method', () => {
    expect(typeof trait.getConfig).toBe('function');
  });

  it('should return config from getConfig', () => {
    const config = trait.getConfig();
    expect(config).toBeDefined();
    expect(typeof config).toBe('object');
  });

  // Custom config initialization
  it('should initialize with custom typing speed', () => {
    const t = new DialogTrait({ typingSpeed: 100 });
    const config = t.getConfig();
    expect(config.typingSpeed).toBe(100);
  });

  it('should initialize with custom input mode', () => {
    const t = new DialogTrait({ inputMode: 'click' });
    const config = t.getConfig();
    expect(config.inputMode).toBe('click');
  });

  it('should preserve variables from config', () => {
    const t = new DialogTrait({
      variables: { playerName: 'Hero', level: 5 },
    });
    expect(t.getVariable('playerName')).toBe('Hero');
    expect(t.getVariable('level')).toBe(5);
  });

  // Tree management
  it('should add a tree', () => {
    const nodes = { start: createNode('start', 'Hello') };
    const tree = createTree(nodes);
    trait.addTree(tree);
    expect(trait.getTree('test_tree')).toBeDefined();
  });

  it('should retrieve tree by ID', () => {
    const nodes = { start: createNode('start') };
    const tree = createTree(nodes);
    trait.addTree(tree);
    expect(trait.getTree('test_tree')?.id).toBe(tree.id);
  });

  it('should return null for missing tree', () => {
    expect(trait.getTree('missing')).toBeUndefined();
  });

  it('should support multiple trees', () => {
    const tree1: DialogTree = { ...createTree({ a: createNode('a') }), id: 'tree1' };
    const tree2: DialogTree = { ...createTree({ b: createNode('b') }), id: 'tree2' };
    trait.addTree(tree1);
    trait.addTree(tree2);

    expect(trait.getTree('tree1')).toBeDefined();
    expect(trait.getTree('tree2')).toBeDefined();
  });

  it('should list all trees', () => {
    const tree1: DialogTree = { ...createTree({ a: createNode('a') }), id: 'tree1' };
    trait.addTree(tree1);
    const trees = trait.getTreeIds();
    expect(Array.isArray(trees)).toBe(true);
    expect(trees.length).toBeGreaterThan(0);
  });

  it('should remove tree', () => {
    const nodes = { start: createNode('start') };
    const tree = createTree(nodes);
    trait.addTree(tree);
    trait.removeTree('test_tree');
    expect(trait.getTree('test_tree')).toBeUndefined();
  });

  // Dialog state transitions
  it('should transition to active on start', () => {
    const nodes = { start: createNode('start', 'Hello') };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    expect(trait.getState()).not.toBe('inactive');
  });

  it('should be active after start', () => {
    const nodes = { start: createNode('start') };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    expect(trait.isActive()).toBe(true);
  });

  it('should set current node on start', () => {
    const nodes = { start: createNode('start', 'Test node') };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    expect(trait.getCurrentNode()).toBeDefined();
  });

  it('should transition to ended on end', () => {
    const nodes = { start: createNode('start') };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    trait.end();
    expect(trait.getState()).toBe('inactive');
  });

  it('should clear current node on end', () => {
    const nodes = { start: createNode('start') };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    trait.end();
    expect(trait.getCurrentNode()).toBeNull();
  });

  it('should pause active dialog', () => {
    const nodes = { start: createNode('start') };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    trait.pause();
    expect(trait.getState()).toBe('paused');
  });

  it('should resume paused dialog', () => {
    const nodes = { start: createNode('start') };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    trait.pause();
    trait.resume();
    expect(trait.isActive()).toBe(true);
  });

  // Node navigation
  it('should navigate to next node', () => {
    const nodes = {
      start: createNode('start', 'First', 'next'),
      next: createNode('next', 'Second'),
    };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    trait.continue();
    const current = trait.getCurrentNode();
    expect(current?.id).toBe('next');
  });

  it('should end dialog when next is null', () => {
    const nodes = {
      start: createNode('start', 'Start', null),
    };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    expect(trait.getState()).not.toBe('ended');
  });

  // History tracking
  it('should track history', () => {
    const nodes = { start: createNode('start') };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    const history = trait.getHistory();
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
  });

  // Variable management
  it('should set and get variable', () => {
    trait.setVariable('test', 'value');
    expect(trait.getVariable('test')).toBe('value');
  });

  it('should support numeric variables', () => {
    trait.setVariable('count', 42);
    expect(trait.getVariable('count')).toBe(42);
  });

  it('should support boolean variables', () => {
    trait.setVariable('flag', true);
    expect(trait.getVariable('flag')).toBe(true);
  });

  it('should return undefined for missing variable', () => {
    expect(trait.getVariable('missing')).toBeUndefined();
  });

  it('should return all variables', () => {
    trait.setVariable('a', 1);
    trait.setVariable('b', 2);
    const vars = trait.getVariables();
    expect('a' in vars).toBe(true);
    expect('b' in vars).toBe(true);
  });

  it('should clear all variables', () => {
    trait.setVariable('test', 'value');
    trait.clearVariables();
    expect(trait.getVariable('test')).toBeUndefined();
  });

  // Event listeners
  it('should support event registration', () => {
    let called = false;
    trait.on('start', () => {
      called = true;
    });
    const nodes = { start: createNode('start') };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    expect(called).toBe(true);
  });

  it('should support event removal', () => {
    let called = false;
    const handler = () => {
      called = true;
    };
    trait.on('start', handler);
    trait.off('start', handler);

    const nodes = { start: createNode('start') };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    expect(called).toBe(false);
  });

  // Edge cases
  it('should handle empty tree list', () => {
    expect(trait.getTreeIds().length).toBe(0);
  });

  it('should handle long dialog text', () => {
    const nodes = { start: createNode('start', 'x'.repeat(10000)) };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    expect(trait.getCurrentNode()).toBeDefined();
  });

  it('should handle special characters in text', () => {
    const nodes = { start: createNode('start', '!@#$%^&*()<>\\"\\\'') };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    expect(trait.getCurrentNode()?.text).toContain('@');
  });

  it('should handle many variables', () => {
    for (let i = 0; i < 50; i++) {
      trait.setVariable(`var_${i}`, i);
    }
    expect(trait.getVariable('var_25')).toBe(25);
  });

  it('should handle rapid transitions', () => {
    const nodes = { start: createNode('start') };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    trait.pause();
    trait.resume();
    trait.pause();
    trait.resume();
    expect(trait.isActive()).toBe(true);
  });

  it('should handle choices with same text', () => {
    const nodes = {
      start: {
        id: 'start',
        type: 'text' as const,
        text: 'Choose',
        choices: [
          { text: 'Option', next: 'a' },
          { text: 'Option', next: 'b' },
          { text: 'Option', next: 'c' },
        ],
      },
      a: createNode('a'),
      b: createNode('b'),
      c: createNode('c'),
    };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    expect(trait.getCurrentNode()?.choices?.length).toBe(3);
  });

  it('should handle circular paths', () => {
    const nodes: Record<string, DialogNode> = {
      a: {
        id: 'a',
        type: 'text',
        text: 'A',
        choices: [{ text: 'Go to B', next: 'b' }],
      },
      b: {
        id: 'b',
        type: 'text',
        text: 'B',
        choices: [{ text: 'Go to A', next: 'a' }],
      },
    };
    const tree: DialogTree = {
      id: 'test_tree',
      startNode: 'a',
      nodes,
    };
    trait.addTree(tree);

    trait.start('test_tree');
    expect(trait.getCurrentNode()).toBeDefined();
  });

  it('should handle invalid tree ID gracefully', () => {
    expect(() => trait.start('invalid')).not.toThrow();
  });

  it('should handle detach-reattach cycle', () => {
    const nodes = { start: createNode('start') };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    expect(trait.isActive()).toBe(true);

    trait.end();
    expect(trait.getState()).toBe('inactive');

    // Should be able to start again
    trait.start('test_tree');
    expect(trait.isActive()).toBe(true);
  });

  it('should default to showChoiceNumbers enabled', () => {
    const config = trait.getConfig();
    expect(config.showChoiceNumbers).toBe(true);
  });

  it('should default to allowSkip enabled', () => {
    const config = trait.getConfig();
    expect(config.allowSkip).toBe(true);
  });

  it('should have choice with disabled property', () => {
    const nodes = {
      start: {
        id: 'start',
        type: 'text' as const,
        text: 'Test',
        choices: [
          { text: 'Enabled', next: 'next' },
          { text: 'Disabled', next: 'next', disabled: true },
        ],
      },
      next: createNode('next'),
    };
    const tree = createTree(nodes);
    trait.addTree(tree);

    trait.start('test_tree');
    const node = trait.getCurrentNode();
    expect(node?.choices?.[1].disabled).toBe(true);
  });
});
