/**
 * OnnxNodeInferenceAdapter — executionProviders contract (always runs).
 *
 * Proves that load() passes { executionProviders } to InferenceSession.create()
 * in correspondence with the adapter's preferredProvider, so the CUDA claim is
 * NOT cosmetic. onnxruntime-node is fully mocked — no native binary or
 * provisioned model file required.
 *
 * Lives in its own file so vi.mock() scoping does not interfere with the real-
 * ORT parity integration tests in onnx-node-adapter.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OnnxNodeInferenceAdapter } from '../onnx-adapter';

// ── Mock setup ────────────────────────────────────────────────────────────────
//
// vi.mock() is hoisted to module top by Vitest so the factory must not close
// over test-local variables. We use vi.hoisted() to declare the spy before the
// hoist boundary and share it across the factory and the test bodies.

const { ortCreateSpy } = vi.hoisted(() => ({
  ortCreateSpy: vi.fn().mockResolvedValue({
    inputNames: ['input'],
    outputNames: ['output'],
    // executionProviders is NOT exposed by ORT Node sessions — we prove via
    // the call arguments to create(), not via session introspection.
    run: vi.fn().mockResolvedValue({}),
    release: vi.fn(),
  }),
}));

// Intercept the dynamic `await import('onnxruntime-node')` inside load().
vi.mock('onnxruntime-node', () => ({
  InferenceSession: { create: ortCreateSpy },
  Tensor: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Last options passed to the mocked InferenceSession.create(). */
function lastCreateOptions(): { executionProviders: string[] } {
  const calls = ortCreateSpy.mock.calls;
  if (calls.length === 0) throw new Error('create() was not called');
  return calls[calls.length - 1][1] as { executionProviders: string[] };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('OnnxNodeInferenceAdapter.load() — executionProviders contract', () => {
  let tmpDir: string;
  let modelPath: string;

  beforeEach(() => {
    // Reset spy call history so each test starts fresh.
    ortCreateSpy.mockClear();

    // Create a real temp file so resolveOnnxModelPath finds it via the direct
    // filesystem-path branch (no sentinel needed — no provision step required).
    tmpDir = mkdtempSync(join(tmpdir(), 'onnx-ep-test-'));
    modelPath = join(tmpDir, 'test.onnx');
    writeFileSync(modelPath, Buffer.alloc(4)); // minimal fake .onnx
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  });

  it("passes ['cpu'] for preferredProvider='cpu'", async () => {
    const adapter = new OnnxNodeInferenceAdapter('cpu');
    await adapter.load(modelPath);
    expect(ortCreateSpy).toHaveBeenCalledOnce();
    expect(lastCreateOptions().executionProviders).toEqual(['cpu']);
  });

  it("passes ['cuda', 'cpu'] for preferredProvider='cuda'", async () => {
    const adapter = new OnnxNodeInferenceAdapter('cuda');
    await adapter.load(modelPath);
    expect(ortCreateSpy).toHaveBeenCalledOnce();
    const eps = lastCreateOptions().executionProviders;
    expect(eps).toEqual(['cuda', 'cpu']);
    // CUDA MUST be first — it is the actually-requested provider.
    expect(eps[0]).toBe('cuda');
  });

  it("passes ['cuda', 'cpu'] when HOLOSCRIPT_CUDA_EP=1 even if preferredProvider='cpu'", async () => {
    const original = process.env.HOLOSCRIPT_CUDA_EP;
    process.env.HOLOSCRIPT_CUDA_EP = '1';
    try {
      const adapter = new OnnxNodeInferenceAdapter('cpu');
      await adapter.load(modelPath);
      expect(ortCreateSpy).toHaveBeenCalledOnce();
      expect(lastCreateOptions().executionProviders).toEqual(['cuda', 'cpu']);
    } finally {
      if (original === undefined) {
        delete process.env.HOLOSCRIPT_CUDA_EP;
      } else {
        process.env.HOLOSCRIPT_CUDA_EP = original;
      }
    }
  });

  it("browser EPs ('wasm', 'webgpu') degrade gracefully to ['cpu'] on Node", async () => {
    // 'wasm' and 'webgpu' are browser-only ExecutionProvider values; on Node
    // they must not request a non-existent EP — falling back to CPU is correct.
    for (const ep of ['wasm', 'webgpu'] as const) {
      ortCreateSpy.mockClear();
      const adapter = new OnnxNodeInferenceAdapter(ep);
      await adapter.load(modelPath);
      expect(lastCreateOptions().executionProviders).toEqual(['cpu']);
    }
  });

  it('passes the resolved file path as the first argument to create()', async () => {
    const adapter = new OnnxNodeInferenceAdapter('cpu');
    await adapter.load(modelPath);
    const [firstArg] = ortCreateSpy.mock.calls[0] as [string, unknown];
    expect(firstArg).toBe(modelPath);
  });
});
