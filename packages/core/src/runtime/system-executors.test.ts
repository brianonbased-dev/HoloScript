/**
 * Unit tests for system-executors — AUDIT-mode coverage
 *
 * Slice 16 zero-config provisioning executors. Small dispatch-based
 * logic, logger-only side effects. Tests lock output envelope shape
 * since downstream relies on `.success` field.
 *
 * **See**: packages/core/src/runtime/system-executors.ts (slice 16)
 */

import { describe, it, expect } from 'vitest';
import {
  executeSystem,
  executeCoreConfig,
  executeVisualMetadata,
  setupNetworking,
  setupPhysics,
} from './system-executors';
import type {
  CoreConfigNode,
  HoloScriptValue,
  SystemNode,
  VisualMetadataNode,
} from '../types';

describe('setupNetworking', () => {
  it('returns success envelope', async () => {
    const node: SystemNode = { type: 'system', id: 'Networking', properties: {} } as SystemNode;
    const result = await setupNetworking(node);
    expect(result.success).toBe(true);
    expect(result.output).toBe('Networking system provisioned');
    expect(typeof result.executionTime).toBe('number');
  });
});

describe('setupPhysics', () => {
  it('returns success envelope', async () => {
    const node: SystemNode = { type: 'system', id: 'Physics', properties: {} } as SystemNode;
    const result = await setupPhysics(node);
    expect(result.success).toBe(true);
    expect(result.output).toBe('Physics system provisioned');
    expect(typeof result.executionTime).toBe('number');
  });
});

describe('executeSystem — dispatch', () => {
  it('dispatches Networking to setupNetworking', async () => {
    const node: SystemNode = { type: 'system', id: 'Networking', properties: {} } as SystemNode;
    const result = await executeSystem(node);
    expect(result.output).toBe('Networking system provisioned');
  });

  it('dispatches Physics to setupPhysics', async () => {
    const node: SystemNode = { type: 'system', id: 'Physics', properties: {} } as SystemNode;
    const result = await executeSystem(node);
    expect(result.output).toBe('Physics system provisioned');
  });

  it('unknown systemId — logs warn + returns success=true with soft-failure output', async () => {
    const node: SystemNode = { type: 'system', id: 'Unrecognized', properties: {} } as SystemNode;
    const result = await executeSystem(node);
    expect(result.success).toBe(true);
    expect(result.output).toBe('System Unrecognized not recognized, skipping provisioning');
  });
});

describe('executeCoreConfig', () => {
  it('merges properties into the supplied environment record', async () => {
    const env: Record<string, HoloScriptValue> = { existing: 'keep' };
    const node: CoreConfigNode = {
      type: 'coreConfig',
      properties: { newKey: 'added', other: 42 },
    } as CoreConfigNode;

    const result = await executeCoreConfig(node, env);

    expect(result.success).toBe(true);
    expect(result.output).toBe('Core configuration applied');
    expect(env).toEqual({ existing: 'keep', newKey: 'added', other: 42 });
  });

  it('overwrites existing keys with new values', async () => {
    const env: Record<string, HoloScriptValue> = { shared: 'old' };
    const node: CoreConfigNode = {
      type: 'coreConfig',
      properties: { shared: 'new' },
    } as CoreConfigNode;

    await executeCoreConfig(node, env);
    expect(env.shared).toBe('new');
  });

  it('empty properties leaves env unchanged', async () => {
    const env: Record<string, HoloScriptValue> = { a: 1 };
    const before = { ...env };
    const node: CoreConfigNode = { type: 'coreConfig', properties: {} } as CoreConfigNode;

    await executeCoreConfig(node, env);
    expect(env).toEqual(before);
  });

  it('executionTime is recorded', async () => {
    const env = {};
    const node: CoreConfigNode = { type: 'coreConfig', properties: {} } as CoreConfigNode;
    const result = await executeCoreConfig(node, env);
    expect(typeof result.executionTime).toBe('number');
    expect(result.executionTime).toBeGreaterThanOrEqual(0);
  });

  it('mutates the caller-owned env (by-reference contract)', async () => {
    // Critical: callers rely on this passing a reference, not a copy.
    // setEnvironment in simple-executors thread this correctly.
    const env = {};
    const node: CoreConfigNode = {
      type: 'coreConfig',
      properties: { x: 1 },
    } as CoreConfigNode;
    await executeCoreConfig(node, env);
    expect(env).toEqual({ x: 1 });
  });
});

describe('executeVisualMetadata', () => {
  it('returns success envelope', async () => {
    const node: VisualMetadataNode = {
      type: 'visualMetadata',
      properties: { title: 't' },
    } as VisualMetadataNode;
    const result = await executeVisualMetadata(node);
    expect(result.success).toBe(true);
    expect(result.output).toBe('Visual metadata applied');
  });

  it('does not record executionTime (pass-through impl)', async () => {
    // Documents current behavior: visual-metadata is logger-only
    // and does not measure timing (unlike other executors).
    const node: VisualMetadataNode = {
      type: 'visualMetadata',
      properties: {},
    } as VisualMetadataNode;
    const result = await executeVisualMetadata(node);
    expect(result.executionTime).toBeUndefined();
  });
});
