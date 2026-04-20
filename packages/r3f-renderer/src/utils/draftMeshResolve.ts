import type { R3FNode } from '@holoscript/core';

export interface ResolveDraftNodesInput {
  nodes?: R3FNode[];
  node?: R3FNode;
  shape?: string;
}

/** Normalize legacy single-`node` / `shape` props into a batch list for instancing. */
export function resolveDraftNodes(input: ResolveDraftNodesInput): R3FNode[] {
  if (input.nodes && input.nodes.length > 0) {
    return input.nodes;
  }
  const single = input.node;
  if (!single) return [];
  const shape = input.shape;
  if (shape) {
    return [{ ...single, props: { ...single.props, draftShape: shape } }];
  }
  return [single];
}
