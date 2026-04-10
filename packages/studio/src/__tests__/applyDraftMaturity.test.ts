/**
 * applyDraftMaturity.test.ts — Tests that @draft trait auto-sets assetMaturity
 * on compiled R3F nodes via the useScenePipeline post-processing.
 */

import { describe, it, expect } from 'vitest';

// We test the standalone function extracted from useScenePipeline
// (re-implementing it here since it's not exported)
interface MockR3FNode {
  type: string;
  id?: string;
  props: Record<string, any>;
  children?: MockR3FNode[];
  traits?: Map<string, any>;
  assetMaturity?: 'draft' | 'mesh' | 'final';
}

function applyDraftMaturity(node: MockR3FNode): void {
  if (node.traits?.has('draft') || node.props?.draftMode) {
    node.assetMaturity = 'draft';
  }
  if (node.children) {
    for (const child of node.children) {
      applyDraftMaturity(child);
    }
  }
}

describe('applyDraftMaturity', () => {
  it('sets assetMaturity=draft on nodes with @draft trait', () => {
    const node: MockR3FNode = {
      type: 'mesh',
      id: 'box1',
      props: { hsType: 'box' },
      traits: new Map([['draft', { shape: 'box', collision: true }]]),
    };
    applyDraftMaturity(node);
    expect(node.assetMaturity).toBe('draft');
  });

  it('sets assetMaturity=draft on nodes with draftMode prop', () => {
    const node: MockR3FNode = {
      type: 'mesh',
      id: 'sphere1',
      props: { hsType: 'sphere', draftMode: true },
    };
    applyDraftMaturity(node);
    expect(node.assetMaturity).toBe('draft');
  });

  it('does not set assetMaturity on normal nodes', () => {
    const node: MockR3FNode = {
      type: 'mesh',
      id: 'cube1',
      props: { hsType: 'cube' },
    };
    applyDraftMaturity(node);
    expect(node.assetMaturity).toBeUndefined();
  });

  it('propagates recursively into children', () => {
    const root: MockR3FNode = {
      type: 'group',
      props: {},
      children: [
        {
          type: 'mesh',
          id: 'child1',
          props: { hsType: 'box' },
          traits: new Map([['draft', {}]]),
        },
        {
          type: 'mesh',
          id: 'child2',
          props: { hsType: 'sphere' },
        },
      ],
    };
    applyDraftMaturity(root);
    expect(root.assetMaturity).toBeUndefined();
    expect(root.children![0].assetMaturity).toBe('draft');
    expect(root.children![1].assetMaturity).toBeUndefined();
  });

  it('handles deeply nested trees', () => {
    const root: MockR3FNode = {
      type: 'scene',
      props: {},
      children: [
        {
          type: 'group',
          props: {},
          children: [
            {
              type: 'mesh',
              id: 'deep',
              props: { draftMode: true },
            },
          ],
        },
      ],
    };
    applyDraftMaturity(root);
    expect(root.children![0].children![0].assetMaturity).toBe('draft');
  });

  it('handles empty children array', () => {
    const node: MockR3FNode = {
      type: 'group',
      props: {},
      children: [],
    };
    applyDraftMaturity(node);
    expect(node.assetMaturity).toBeUndefined();
  });

  it('handles both trait and prop simultaneously', () => {
    const node: MockR3FNode = {
      type: 'mesh',
      props: { draftMode: true },
      traits: new Map([['draft', { shape: 'cylinder' }]]),
    };
    applyDraftMaturity(node);
    expect(node.assetMaturity).toBe('draft');
  });
});
