/**
 * InferenceTrait — adapter-backed inference contract.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  inferenceHandler,
  type InferenceAdapter,
  type InferenceConfig,
  type InferenceErrorPayload,
  type InferenceRequest,
} from '../InferenceTrait';
import {
  attachTrait,
  createMockContext,
  createMockNode,
  getEventCount,
  getLastEvent,
  sendEvent,
  type MockContext,
} from './traitTestHelpers';

type InferenceNode = Record<string, unknown> & {
  __inferenceState?: { totalRuns: number; totalTokens: number };
};

type InferenceResultEvent = {
  modelId: string;
  output: unknown;
  latencyMs: number;
  maxTokens: number;
  runNumber: number;
  adapterId?: string;
  tokensUsed: number;
  totalTokens: number;
};

type InferenceContext = MockContext & {
  modelAdapters?: Map<string, InferenceAdapter>;
};

function setup(config: Partial<InferenceConfig> = {}): {
  node: InferenceNode;
  ctx: MockContext;
  config: Partial<InferenceConfig>;
} {
  const node = createMockNode('inference') as InferenceNode;
  const ctx = createMockContext();
  attachTrait(inferenceHandler, node, config, ctx);
  return { node, ctx, config };
}

/** Flush pending microtasks from the async fire-and-forget adapter run. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe('InferenceTrait', () => {
  it('has name "inference"', () => {
    expect(inferenceHandler.name).toBe('inference');
  });

  it('defaultConfig timeout_ms=30000, max_tokens=4096', () => {
    expect(inferenceHandler.defaultConfig?.timeout_ms).toBe(30000);
    expect(inferenceHandler.defaultConfig?.max_tokens).toBe(4096);
  });

  it('onAttach initializes run and token counters', () => {
    const { node } = setup();
    expect(node.__inferenceState).toMatchObject({ totalRuns: 0, totalTokens: 0 });
  });

  it('onDetach removes state', () => {
    const { node, ctx } = setup();
    inferenceHandler.onDetach?.(
      node as never,
      inferenceHandler.defaultConfig as InferenceConfig,
      ctx as never
    );
    expect(node.__inferenceState).toBeUndefined();
  });

  it('missing adapter emits typed inference:error and no null-output success result', () => {
    const { node, ctx } = setup();
    sendEvent(inferenceHandler, node, {}, ctx, {
      type: 'inference:run',
      modelId: 'gpt-mini',
      input: 'hello',
    });

    expect(getEventCount(ctx, 'inference:result')).toBe(0);
    expect(getLastEvent(ctx, 'inference:error')).toMatchObject({
      code: 'INFERENCE_ADAPTER_NOT_FOUND',
      modelId: 'gpt-mini',
      runNumber: 1,
      recoverable: false,
    });
  });

  it('calls a registered adapter and forwards clamped timeout/token limits', async () => {
    let capturedRequest: InferenceRequest | undefined;
    const adapter: InferenceAdapter = {
      id: 'unit-adapter',
      models: ['gpt-mini'],
      run: vi.fn((request: InferenceRequest) => {
        capturedRequest = request;
        return {
          output: { text: 'pong' },
          latencyMs: 7,
          tokensUsed: 3,
        };
      }),
    };
    const { node, ctx, config } = setup({
      timeout_ms: 100,
      max_tokens: 128,
      adapters: [adapter],
    });

    sendEvent(inferenceHandler, node, config, ctx, {
      type: 'inference:run',
      modelId: 'gpt-mini',
      input: 'ping',
      options: { timeout_ms: 5000, max_tokens: 8192, temperature: 0.1 },
    });
    await flushMicrotasks();

    expect(adapter.run).toHaveBeenCalledTimes(1);
    expect(capturedRequest).toMatchObject({
      modelId: 'gpt-mini',
      input: 'ping',
      runNumber: 1,
      options: { timeoutMs: 100, maxTokens: 128, temperature: 0.1 },
    });
    expect(capturedRequest?.signal).toBeInstanceOf(AbortSignal);

    const result = getLastEvent(ctx, 'inference:result') as InferenceResultEvent;
    expect(result).toMatchObject({
      modelId: 'gpt-mini',
      output: { text: 'pong' },
      latencyMs: 7,
      maxTokens: 128,
      runNumber: 1,
      adapterId: 'unit-adapter',
      tokensUsed: 3,
      totalTokens: 3,
    });
  });

  it('uses model adapters registered on the trait context', async () => {
    const adapter: InferenceAdapter = {
      id: 'context-model-adapter',
      modelIds: ['local-model'],
      run: () => ({ output: 'ok', latencyMs: 2 }),
    };
    const node = createMockNode('context-inf') as InferenceNode;
    const ctx = createMockContext() as InferenceContext;
    ctx.modelAdapters = new Map([['local-model', adapter]]);
    attachTrait(inferenceHandler, node, {}, ctx);

    sendEvent(inferenceHandler, node, {}, ctx, {
      type: 'inference:run',
      modelId: 'local-model',
      input: { prompt: 'hello' },
    });
    await flushMicrotasks();

    expect(getEventCount(ctx, 'inference:error')).toBe(0);
    expect(getLastEvent(ctx, 'inference:result')).toMatchObject({
      modelId: 'local-model',
      output: 'ok',
      adapterId: 'context-model-adapter',
    });
  });

  it('adapter rejection emits typed inference:error and no result', async () => {
    const adapter: InferenceAdapter = {
      id: 'failing-adapter',
      run: async () => {
        throw new Error('backend offline');
      },
    };
    const { node, ctx, config } = setup({ adapter });

    sendEvent(inferenceHandler, node, config, ctx, {
      type: 'inference:run',
      modelId: 'any-model',
      input: 'hello',
    });
    await flushMicrotasks();

    expect(getEventCount(ctx, 'inference:result')).toBe(0);
    expect(getLastEvent(ctx, 'inference:error')).toMatchObject({
      code: 'INFERENCE_ADAPTER_FAILED',
      error: 'backend offline',
      adapterId: 'failing-adapter',
      modelId: 'any-model',
      runNumber: 1,
    } satisfies Partial<InferenceErrorPayload>);
  });

  it('adapter timeout emits INFERENCE_TIMEOUT and aborts the request signal', async () => {
    vi.useFakeTimers();
    let capturedRequest: InferenceRequest | undefined;
    try {
      const adapter: InferenceAdapter = {
        id: 'slow-adapter',
        run: (request: InferenceRequest) => {
          capturedRequest = request;
          return new Promise(() => undefined);
        },
      };
      const { node, ctx, config } = setup({ timeout_ms: 10, adapter });

      sendEvent(inferenceHandler, node, config, ctx, {
        type: 'inference:run',
        modelId: 'slow-model',
        input: 'hello',
      });
      await vi.advanceTimersByTimeAsync(10);
      await flushMicrotasks();

      expect(getEventCount(ctx, 'inference:result')).toBe(0);
      expect(capturedRequest?.signal.aborted).toBe(true);
      expect(getLastEvent(ctx, 'inference:error')).toMatchObject({
        code: 'INFERENCE_TIMEOUT',
        adapterId: 'slow-adapter',
        modelId: 'slow-model',
        timeoutMs: 10,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('increments totalRuns for every attempted inference:run', () => {
    const { node, ctx } = setup();
    for (let i = 0; i < 3; i++) {
      sendEvent(inferenceHandler, node, {}, ctx, {
        type: 'inference:run',
        modelId: 'model',
        input: 'x',
      });
    }
    expect(node.__inferenceState?.totalRuns).toBe(3);
  });
});
