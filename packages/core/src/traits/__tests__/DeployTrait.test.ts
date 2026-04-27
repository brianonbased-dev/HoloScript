/**
 * DeployTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { deployHandler } from '../DeployTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __deployState: undefined as unknown,
});

const defaultConfig = { stages: ['prepare', 'deploy', 'verify'], auto_verify: true };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('DeployTrait — metadata', () => {
  it('has name "deploy"', () => {
    expect(deployHandler.name).toBe('deploy');
  });

  it('defaultConfig stages includes prepare, deploy, verify', () => {
    expect(deployHandler.defaultConfig?.stages).toEqual(['prepare', 'deploy', 'verify']);
  });
});

describe('DeployTrait — lifecycle', () => {
  it('onAttach initializes empty deployments map', () => {
    const node = makeNode();
    deployHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__deployState as { deployments: Map<string, unknown> };
    expect(state.deployments).toBeInstanceOf(Map);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    deployHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    deployHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__deployState).toBeUndefined();
  });
});

describe('DeployTrait — onEvent', () => {
  it('deploy:start creates deployment and emits first stage', () => {
    const node = makeNode();
    deployHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    deployHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'deploy:start', version: '1.2.3', target: 'production',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('deploy:stage', expect.objectContaining({
      stage: 'prepare', status: 'started',
    }));
  });

  it('deploy:advance progresses to next stage', () => {
    const node = makeNode();
    deployHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    deployHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'deploy:start', version: '1.0.0', target: 'staging',
    } as never);
    // Get the deployId from the emitted call
    const startCall = node.emit.mock.calls.find(([t]) => t === 'deploy:stage');
    const deployId = startCall?.[1]?.deployId as string;
    node.emit.mockClear();
    deployHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'deploy:advance', deployId,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('deploy:stage', expect.objectContaining({
      deployId, stage: 'deploy', status: 'started',
    }));
  });

  it('deploy:advance at last stage emits deploy:complete', () => {
    const node = makeNode();
    deployHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    deployHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'deploy:start', version: '2.0.0', target: 'prod',
    } as never);
    const startCall = node.emit.mock.calls.find(([t]) => t === 'deploy:stage');
    const deployId = startCall?.[1]?.deployId as string;
    // Advance through all stages
    for (let i = 1; i < defaultConfig.stages.length; i++) {
      deployHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
        type: 'deploy:advance', deployId,
      } as never);
    }
    // Last advance should complete
    node.emit.mockClear();
    deployHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'deploy:advance', deployId,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('deploy:complete', expect.objectContaining({
      deployId, version: '2.0.0', target: 'prod',
    }));
  });

  it('deploy:advance on unknown deployId does nothing', () => {
    const node = makeNode();
    deployHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    deployHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'deploy:advance', deployId: 'ghost_id',
    } as never);
    expect(node.emit).not.toHaveBeenCalled();
  });
});
