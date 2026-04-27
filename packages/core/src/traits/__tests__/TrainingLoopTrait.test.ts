/**
 * TrainingLoopTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { trainingLoopHandler } from '../TrainingLoopTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __trainState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_epochs: 100, learning_rate: 0.001 };

describe('TrainingLoopTrait', () => {
  it('has name "training_loop"', () => {
    expect(trainingLoopHandler.name).toBe('training_loop');
  });

  it('train:start emits train:started', () => {
    const node = makeNode();
    trainingLoopHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    trainingLoopHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'train:start',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('train:started', { maxEpochs: 100, lr: 0.001 });
  });

  it('train:step emits train:progress with epoch count', () => {
    const node = makeNode();
    trainingLoopHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    trainingLoopHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'train:start' } as never);
    node.emit.mockClear();
    trainingLoopHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'train:step', loss: 0.5,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('train:progress', { epoch: 1, loss: 0.5 });
  });
});
