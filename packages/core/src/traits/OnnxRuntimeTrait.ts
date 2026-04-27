/**
 * OnnxRuntimeTrait — ONNX model execution runtime.
 *
 * idea-run-3 (research/2026-04-26_idea-run-3-neural-locomotion.md) named
 * this trait as a CONFIRMED Pattern B violation: 44 LOC stub where
 * `onnx:load` flipped `loaded:true` and `onnx:run` incremented a counter,
 * neither doing any actual ONNX inference. /stub-audit confirmed.
 *
 * This commit wires the trait to the real `InferenceAdapter` interface
 * shipped in BUILD-1 scaffolding (commit dbd4510cc, packages/core/src/traits/
 * engines/onnx-adapter.ts). Per RULING 2 — engine math lives once in
 * core/traits/engines, traits delegate.
 *
 * Behavior change: `onnx:loaded` and `onnx:output` are now emitted ASYNC
 * (after the underlying adapter's load/run promise resolves), where they
 * were previously emitted SYNCHRONOUSLY but lying. Async-but-honest beats
 * sync-but-fake.
 *
 * The default adapter (NoOpInferenceAdapter) is deterministic pass-through
 * scaffolding — caller must inject a real backend (ONNX Runtime Web,
 * ONNX Runtime Node, or PureJsAdapter) via config.adapterFactory for
 * real inference. Real adapters ship in BUILD-1 follow-up alongside the
 * actual NN architecture per /founder ruling 2026-04-26.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import {
  createNoOpInferenceAdapter,
  type InferenceAdapter,
  type Float32Tensor,
} from './engines/onnx-adapter';

export interface OnnxRuntimeConfig {
  execution_provider: string;
  /**
   * Optional factory for the inference backend. Defaults to NoOpInferenceAdapter.
   * Caller injects ONNX Runtime Web / Node / PureJS for real inference.
   */
  adapterFactory?: () => InferenceAdapter;
}

interface OnnxRuntimeState {
  /** modelId → adapter instance. One adapter per loaded model. */
  models: Map<string, InferenceAdapter>;
  /** modelId → load promise (so concurrent run-before-load is safe). */
  loadPromises: Map<string, Promise<void>>;
  /** Total inference calls completed across all models — diagnostic. */
  inferences: number;
}

export const onnxRuntimeHandler: TraitHandler<OnnxRuntimeConfig> = {
  name: 'onnx_runtime',
  defaultConfig: { execution_provider: 'cpu' },

  onAttach(node: HSPlusNode): void {
    const state: OnnxRuntimeState = {
      models: new Map(),
      loadPromises: new Map(),
      inferences: 0,
    };
    node.__onnxState = state;
  },

  onDetach(node: HSPlusNode): void {
    const state = node.__onnxState as OnnxRuntimeState | undefined;
    if (state) {
      // Dispose every loaded adapter — backends may hold GPU/native resources.
      for (const adapter of state.models.values()) {
        adapter.dispose();
      }
      state.models.clear();
      state.loadPromises.clear();
    }
    delete node.__onnxState;
  },

  onUpdate(): void {
    // No per-tick work — all activity is event-driven.
  },

  onEvent(
    node: HSPlusNode,
    config: OnnxRuntimeConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__onnxState as OnnxRuntimeState | undefined;
    if (!state) return;

    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'onnx:load': {
        const modelId = event.modelId as string;
        const modelUrl = (event.modelUrl as string | undefined) ?? modelId;
        if (!modelId) {
          context.emit?.('onnx:error', { error: 'onnx:load missing modelId' });
          return;
        }
        if (state.models.has(modelId)) {
          // Idempotent — already loaded; emit ready signal so caller proceeds.
          context.emit?.('onnx:loaded', {
            modelId,
            provider: config.execution_provider,
            cached: true,
          });
          return;
        }
        const adapter = (config.adapterFactory ?? createNoOpInferenceAdapter)();
        state.models.set(modelId, adapter);
        const loadPromise = adapter.load(modelUrl).then(
          () => {
            // /critic Annoying #11 fix: GC the load promise once resolved.
            // Concurrent run-before-load callers already captured the promise;
            // future runs see the loaded adapter directly. No need to keep
            // the promise indefinitely.
            state.loadPromises.delete(modelId);
            context.emit?.('onnx:loaded', {
              modelId,
              provider: config.execution_provider,
              adapterName: adapter.name,
            });
          },
          (err: unknown) => {
            // Load failed — remove from state so a retry can attempt afresh.
            state.models.delete(modelId);
            state.loadPromises.delete(modelId);
            context.emit?.('onnx:error', {
              modelId,
              phase: 'load',
              error: err instanceof Error ? err.message : String(err),
            });
          }
        );
        state.loadPromises.set(modelId, loadPromise);
        break;
      }

      case 'onnx:run': {
        const modelId = event.modelId as string;
        const inputs = event.inputs as Record<string, Float32Tensor> | undefined;
        const outputNames = event.outputs as string[] | undefined;
        if (!modelId) {
          context.emit?.('onnx:error', { error: 'onnx:run missing modelId' });
          return;
        }
        if (!inputs || Object.keys(inputs).length === 0) {
          context.emit?.('onnx:error', {
            modelId,
            error: 'onnx:run requires at least one input tensor',
          });
          return;
        }
        const adapter = state.models.get(modelId);
        if (!adapter) {
          context.emit?.('onnx:error', {
            modelId,
            error: `onnx:run on unknown model — issue 'onnx:load' first`,
          });
          return;
        }
        // Wait for load to complete (no-op if already loaded), then run.
        const loadPromise = state.loadPromises.get(modelId) ?? Promise.resolve();
        loadPromise
          .then(() => adapter.run({ inputs, outputs: outputNames }))
          .then((result) => {
            state.inferences++;
            context.emit?.('onnx:output', {
              modelId,
              inferences: state.inferences,
              outputs: result.outputs,
              durationMs: result.durationMs,
              providerUsed: result.providerUsed,
            });
          })
          .catch((err: unknown) => {
            context.emit?.('onnx:error', {
              modelId,
              phase: 'run',
              error: err instanceof Error ? err.message : String(err),
            });
          });
        break;
      }

      case 'onnx:dispose': {
        const modelId = event.modelId as string;
        if (!modelId) return;
        const adapter = state.models.get(modelId);
        if (adapter) {
          adapter.dispose();
          state.models.delete(modelId);
          state.loadPromises.delete(modelId);
          context.emit?.('onnx:disposed', { modelId });
        }
        break;
      }
    }
  },
};

export default onnxRuntimeHandler;
