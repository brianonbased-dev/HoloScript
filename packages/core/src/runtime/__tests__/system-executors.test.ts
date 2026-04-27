import { describe, it, expect, vi } from 'vitest';
import {
  executeSystem,
  setupNetworking,
  setupPhysics,
  executeCoreConfig,
  executeVisualMetadata,
} from '../system-executors.js';
import type { SystemNode, CoreConfigNode, VisualMetadataNode } from '../../types.js';

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeSystemNode(id: string): SystemNode {
  return { type: 'system', id, properties: {} } as unknown as SystemNode;
}

describe('setupNetworking', () => {
  it('returns success', async () => {
    const result = await setupNetworking(makeSystemNode('Networking'));
    expect(result.success).toBe(true);
    expect(String(result.output)).toContain('Networking');
  });

  it('includes executionTime', async () => {
    const result = await setupNetworking(makeSystemNode('Networking'));
    expect(typeof result.executionTime).toBe('number');
  });
});

describe('setupPhysics', () => {
  it('returns success', async () => {
    const result = await setupPhysics(makeSystemNode('Physics'));
    expect(result.success).toBe(true);
    expect(String(result.output)).toContain('Physics');
  });

  it('includes executionTime', async () => {
    const result = await setupPhysics(makeSystemNode('Physics'));
    expect(typeof result.executionTime).toBe('number');
  });
});

describe('executeSystem', () => {
  it('dispatches Networking', async () => {
    const result = await executeSystem(makeSystemNode('Networking'));
    expect(result.success).toBe(true);
    expect(String(result.output)).toContain('Networking');
  });

  it('dispatches Physics', async () => {
    const result = await executeSystem(makeSystemNode('Physics'));
    expect(result.success).toBe(true);
    expect(String(result.output)).toContain('Physics');
  });

  it('handles unknown system id gracefully', async () => {
    const result = await executeSystem(makeSystemNode('UnknownSystem'));
    expect(result.success).toBe(true);
    expect(String(result.output)).toContain('UnknownSystem');
  });
});

describe('executeCoreConfig', () => {
  it('merges properties into environment', async () => {
    const env: Record<string, unknown> = {};
    const node: CoreConfigNode = {
      type: 'core',
      properties: { gravity: 9.8, debug: true },
    } as unknown as CoreConfigNode;
    const result = await executeCoreConfig(node, env as Record<string, never>);
    expect(result.success).toBe(true);
    expect(env['gravity']).toBe(9.8);
    expect(env['debug']).toBe(true);
  });

  it('includes executionTime', async () => {
    const env: Record<string, unknown> = {};
    const node: CoreConfigNode = { type: 'core', properties: {} } as unknown as CoreConfigNode;
    const result = await executeCoreConfig(node, env as Record<string, never>);
    expect(typeof result.executionTime).toBe('number');
  });

  it('works with empty properties', async () => {
    const env: Record<string, unknown> = { existing: 1 };
    const node: CoreConfigNode = { type: 'core', properties: {} } as unknown as CoreConfigNode;
    await executeCoreConfig(node, env as Record<string, never>);
    expect(env['existing']).toBe(1);
  });
});

describe('executeVisualMetadata', () => {
  it('returns success', async () => {
    const node: VisualMetadataNode = {
      type: 'visual_metadata',
      properties: { theme: 'dark' },
    } as unknown as VisualMetadataNode;
    const result = await executeVisualMetadata(node);
    expect(result.success).toBe(true);
    expect(String(result.output)).toContain('metadata');
  });
});
