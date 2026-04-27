import { describe, it, expect } from 'vitest';
import {
  NoOpInferenceAdapter,
  createNoOpInferenceAdapter,
  type InferenceRequest,
} from '../onnx-adapter';

describe('NoOpInferenceAdapter', () => {
  it('starts unloaded', () => {
    const a = new NoOpInferenceAdapter();
    expect(a.loaded).toBe(false);
    expect(a.loadedModelUrl).toBeNull();
  });

  it('load() flips loaded=true + records URL', async () => {
    const a = createNoOpInferenceAdapter() as NoOpInferenceAdapter;
    await a.load('biped_humanoid_v2.onnx');
    expect(a.loaded).toBe(true);
    expect(a.loadedModelUrl).toBe('biped_humanoid_v2.onnx');
  });

  it('run() throws if not loaded', async () => {
    const a = new NoOpInferenceAdapter();
    const req: InferenceRequest = {
      inputs: { x: { data: new Float32Array(4), shape: [1, 4] } },
    };
    await expect(a.run(req)).rejects.toThrow(/load\(\)/);
  });

  it('run() throws on empty inputs', async () => {
    const a = new NoOpInferenceAdapter();
    await a.load('m.onnx');
    await expect(a.run({ inputs: {} })).rejects.toThrow(/at least one input/);
  });

  it('run() returns zero-filled output matching first input shape', async () => {
    const a = new NoOpInferenceAdapter();
    await a.load('m.onnx');
    const input = new Float32Array([1, 2, 3, 4, 5, 6]);
    const res = await a.run({
      inputs: { x: { data: input, shape: [2, 3] } },
    });
    expect(res.outputs.output).toBeDefined();
    expect(res.outputs.output.shape).toEqual([2, 3]);
    expect(res.outputs.output.data.length).toBe(6);
    expect(Array.from(res.outputs.output.data)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(res.providerUsed).toBe('cpu');
    expect(res.durationMs).toBe(0);
  });

  it('run() respects requested output names', async () => {
    const a = new NoOpInferenceAdapter();
    await a.load('m.onnx');
    const res = await a.run({
      inputs: { x: { data: new Float32Array(4), shape: [4] } },
      outputs: ['pose', 'phase', 'contacts'],
    });
    expect(Object.keys(res.outputs).sort()).toEqual(['contacts', 'phase', 'pose']);
    for (const name of ['pose', 'phase', 'contacts']) {
      expect(res.outputs[name].shape).toEqual([4]);
      expect(res.outputs[name].data.length).toBe(4);
    }
  });

  it('dispose() flips loaded=false + clears URL', async () => {
    const a = new NoOpInferenceAdapter();
    await a.load('m.onnx');
    a.dispose();
    expect(a.loaded).toBe(false);
    expect(a.loadedModelUrl).toBeNull();
  });

  it('load() is idempotent (repeated calls update URL)', async () => {
    const a = new NoOpInferenceAdapter();
    await a.load('m1.onnx');
    await a.load('m2.onnx');
    expect(a.loaded).toBe(true);
    expect(a.loadedModelUrl).toBe('m2.onnx');
  });

  it('preferredProvider defaults to cpu (no GPU dependency in noop)', () => {
    const a = new NoOpInferenceAdapter();
    expect(a.preferredProvider).toBe('cpu');
  });
});
