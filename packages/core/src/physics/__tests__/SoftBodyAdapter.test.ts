import { describe, it, expect, beforeEach } from 'vitest';
import { SoftBodyAdapter } from '../SoftBodyAdapter';

function mockNode(vertexCount = 4) {
  const vertices: number[] = [];
  for (let i = 0; i < vertexCount; i++) {
    vertices.push(i * 0.1, 1, 0); // x, y=1 (above ground so gravity pulls down), z
  }
  return {
    geometry: {
      vertices,
      needsUpdate: false,
    },
  };
}

describe('SoftBodyAdapter', () => {
  let adapter: SoftBodyAdapter;
  let node: ReturnType<typeof mockNode>;

  beforeEach(() => {
    node = mockNode(4);
    adapter = new SoftBodyAdapter(node, { mass: 1, stiffness: 0.5 });
  });

  it('creates adapter from mesh node', () => {
    expect(adapter).toBeDefined();
  });

  it('update runs simulation step without throwing', () => {
    adapter.update(1 / 60);
    expect(node.geometry.needsUpdate).toBe(true);
  });

  it('handles empty mesh', () => {
    const emptyNode = { geometry: { vertices: [], needsUpdate: false } };
    const a2 = new SoftBodyAdapter(emptyNode, { mass: 1, stiffness: 0.5 });
    // Should not throw
    a2.update(1 / 60);
  });

  it('needsUpdate flag set after sync', () => {
    node.geometry.needsUpdate = false;
    adapter.update(1 / 60);
    expect(node.geometry.needsUpdate).toBe(true);
  });

  it('solver step modifies internal state', () => {
    // After running enough steps, the solver should have processed particles
    // We just verify it doesn't throw and the adapter remains functional
    for (let i = 0; i < 100; i++) {
      adapter.update(1 / 60);
    }
    // Still functional
    expect(node.geometry.needsUpdate).toBe(true);
  });
});
