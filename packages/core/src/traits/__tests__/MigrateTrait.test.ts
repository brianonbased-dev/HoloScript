/**
 * MigrateTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { migrateHandler } from '../MigrateTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __migrateState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { current_version: 0, auto_run: false };

describe('MigrateTrait', () => {
  it('has name "migrate"', () => {
    expect(migrateHandler.name).toBe('migrate');
  });

  it('defaultConfig current_version=0', () => {
    expect(migrateHandler.defaultConfig?.current_version).toBe(0);
  });

  it('onAttach initializes steps=[] and currentVersion=0', () => {
    const node = makeNode();
    migrateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__migrateState as { steps: unknown[]; currentVersion: number };
    expect(state.steps).toEqual([]);
    expect(state.currentVersion).toBe(0);
  });

  it('migrate:register adds a step', () => {
    const node = makeNode();
    migrateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    migrateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'migrate:register', version: 1, description: 'Add users table',
    } as never);
    const state = node.__migrateState as { steps: { version: number }[] };
    expect(state.steps.length).toBe(1);
    expect(state.steps[0].version).toBe(1);
  });

  it('migrate:run applies steps and emits migrate:complete', () => {
    const node = makeNode();
    migrateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    migrateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'migrate:register', version: 1, description: 'Step 1',
    } as never);
    migrateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'migrate:register', version: 2, description: 'Step 2',
    } as never);
    node.emit.mockClear();
    migrateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'migrate:run', targetVersion: 2,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('migrate:complete', expect.objectContaining({
      fromVersion: 0, toVersion: 2, stepsRun: 2,
    }));
  });
});
