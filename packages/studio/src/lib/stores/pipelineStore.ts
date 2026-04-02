'use client';

/**
 * Pipeline Store — Zustand state for the recursive self-improvement pipeline.
 *
 * Tracks active pipeline runs, layer configurations, and accumulated
 * feedback signals. Follows the same devtools + persist pattern as
 * agentStore.ts and workspaceStore.ts.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type {
  LayerId,
  LayerConfig,
  LayerStatus,
  LayerCycleResult,
  LayerState,
  LayerOutput,
  PipelineRun,
  PipelineMode,
  FeedbackSignal,
} from '../recursive/types';

// ─── Default Layer Configurations ────────────────────────────────────────────

const DEFAULT_LAYER_CONFIGS: Record<LayerId, LayerConfig> = {
  0: {
    id: 0,
    name: 'Code Fixer',
    description: 'Fixes type errors, lint issues, test failures',
    budget: { maxCostUSD: 2.0, maxDurationMs: 300_000, maxCycles: 3, cooldownMs: 5_000 },
    requiresHumanReview: false,
    enabled: true,
    autoEscalate: true,
  },
  1: {
    id: 1,
    name: 'Strategy Optimizer',
    description: 'Adjusts L0 focus rotation, passes, and profiles based on trends',
    budget: { maxCostUSD: 1.0, maxDurationMs: 120_000, maxCycles: 2, cooldownMs: 30_000 },
    requiresHumanReview: true,
    enabled: true,
    autoEscalate: true,
  },
  2: {
    id: 2,
    name: 'Meta-Strategist',
    description: 'Generates new skills, evolves strategies, captures wisdom',
    budget: { maxCostUSD: 1.5, maxDurationMs: 180_000, maxCycles: 1, cooldownMs: 60_000 },
    requiresHumanReview: true,
    enabled: true,
    autoEscalate: false,
  },
};

function generatePipelineId(): string {
  return `pipe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createInitialLayerState(config: LayerConfig): LayerState {
  return {
    config,
    status: 'idle',
    currentCycleId: null,
    cyclesCompleted: 0,
    history: [],
    feedbackBuffer: [],
    lastOutput: null,
  };
}

// ─── Store Interface ─────────────────────────────────────────────────────────

interface PipelineState {
  activePipeline: PipelineRun | null;
  pipelineHistory: PipelineRun[];
  layerConfigs: Record<LayerId, LayerConfig>;
  globalFeedback: FeedbackSignal[];

  // Pipeline lifecycle
  startPipeline: (mode: PipelineMode, targetProject: string) => string;
  pausePipeline: () => void;
  resumePipeline: () => void;
  stopPipeline: () => void;

  // Layer operations
  updateLayerStatus: (layerId: LayerId, status: LayerStatus) => void;
  setLayerCycleId: (layerId: LayerId, cycleId: string | null) => void;
  recordCycleResult: (result: LayerCycleResult) => void;
  setLayerOutput: (layerId: LayerId, output: LayerOutput) => void;

  // Feedback
  pushFeedback: (signal: FeedbackSignal) => void;
  consumeFeedback: (layerId: LayerId) => FeedbackSignal[];
  pushGlobalFeedback: (signal: FeedbackSignal) => void;

  // Configuration
  updateLayerConfig: (layerId: LayerId, patch: Partial<LayerConfig>) => void;
  resetLayerConfigs: () => void;

  // Review gates
  approveReview: (layerId: LayerId) => void;
  rejectReview: (layerId: LayerId) => void;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const usePipelineStore = create<PipelineState>()(
  devtools(
    persist(
      (set, get) => ({
        activePipeline: null,
        pipelineHistory: [],
        layerConfigs: { ...DEFAULT_LAYER_CONFIGS },
        globalFeedback: [],

        startPipeline: (mode, targetProject) => {
          const id = generatePipelineId();
          const configs = get().layerConfigs;
          const run: PipelineRun = {
            id,
            mode,
            targetProject,
            startedAt: new Date().toISOString(),
            completedAt: null,
            status: 'running',
            layers: {
              0: createInitialLayerState(configs[0]),
              1: createInitialLayerState(configs[1]),
              2: createInitialLayerState(configs[2]),
            },
            totalCostUSD: 0,
            totalDurationMs: 0,
            humanReviewsPending: 0,
          };
          set({ activePipeline: run });
          return id;
        },

        pausePipeline: () => {
          set((s) => {
            if (!s.activePipeline) return s;
            return {
              activePipeline: { ...s.activePipeline, status: 'paused' },
            };
          });
        },

        resumePipeline: () => {
          set((s) => {
            if (!s.activePipeline) return s;
            return {
              activePipeline: { ...s.activePipeline, status: 'running' },
            };
          });
        },

        stopPipeline: () => {
          set((s) => {
            if (!s.activePipeline) return s;
            const completed: PipelineRun = {
              ...s.activePipeline,
              status: 'completed',
              completedAt: new Date().toISOString(),
            };
            return {
              activePipeline: null,
              pipelineHistory: [completed, ...s.pipelineHistory].slice(0, 50),
            };
          });
        },

        updateLayerStatus: (layerId, status) => {
          set((s) => {
            if (!s.activePipeline) return s;
            const layers = { ...s.activePipeline.layers };
            layers[layerId] = { ...layers[layerId], status };

            const reviewsPending = ([0, 1, 2] as LayerId[]).filter(
              (id) => layers[id].status === 'awaiting_review'
            ).length;

            return {
              activePipeline: {
                ...s.activePipeline,
                layers,
                humanReviewsPending: reviewsPending,
              },
            };
          });
        },

        setLayerCycleId: (layerId, cycleId) => {
          set((s) => {
            if (!s.activePipeline) return s;
            const layers = { ...s.activePipeline.layers };
            layers[layerId] = { ...layers[layerId], currentCycleId: cycleId };
            return { activePipeline: { ...s.activePipeline, layers } };
          });
        },

        recordCycleResult: (result) => {
          set((s) => {
            if (!s.activePipeline) return s;
            const layers = { ...s.activePipeline.layers };
            const layer = layers[result.layerId];
            layers[result.layerId] = {
              ...layer,
              status: 'completed',
              currentCycleId: null,
              cyclesCompleted: layer.cyclesCompleted + 1,
              history: [...layer.history, result].slice(-100),
              lastOutput: result.output,
            };
            return {
              activePipeline: {
                ...s.activePipeline,
                layers,
                totalCostUSD: s.activePipeline.totalCostUSD + result.costUSD,
                totalDurationMs: s.activePipeline.totalDurationMs + result.durationMs,
              },
            };
          });
        },

        setLayerOutput: (layerId, output) => {
          set((s) => {
            if (!s.activePipeline) return s;
            const layers = { ...s.activePipeline.layers };
            layers[layerId] = { ...layers[layerId], lastOutput: output };
            return { activePipeline: { ...s.activePipeline, layers } };
          });
        },

        pushFeedback: (signal) => {
          set((s) => {
            if (!s.activePipeline) return s;
            // Route feedback to the layer above the source
            const targetLayer = (signal.sourceLayer + 1) as LayerId;
            if (targetLayer > 2) return s;
            const layers = { ...s.activePipeline.layers };
            layers[targetLayer] = {
              ...layers[targetLayer],
              feedbackBuffer: [...layers[targetLayer].feedbackBuffer, signal].slice(-100),
            };
            return { activePipeline: { ...s.activePipeline, layers } };
          });
        },

        consumeFeedback: (layerId) => {
          const state = get();
          if (!state.activePipeline) return [];
          const buffer = [...state.activePipeline.layers[layerId].feedbackBuffer];
          set((s) => {
            if (!s.activePipeline) return s;
            const layers = { ...s.activePipeline.layers };
            layers[layerId] = { ...layers[layerId], feedbackBuffer: [] };
            return { activePipeline: { ...s.activePipeline, layers } };
          });
          return buffer;
        },

        pushGlobalFeedback: (signal) => {
          set((s) => ({
            globalFeedback: [...s.globalFeedback, signal].slice(-50),
          }));
        },

        updateLayerConfig: (layerId, patch) => {
          set((s) => ({
            layerConfigs: {
              ...s.layerConfigs,
              [layerId]: { ...s.layerConfigs[layerId], ...patch },
            },
          }));
        },

        resetLayerConfigs: () => {
          set({ layerConfigs: { ...DEFAULT_LAYER_CONFIGS } });
        },

        approveReview: (layerId) => {
          set((s) => {
            if (!s.activePipeline) return s;
            const layers = { ...s.activePipeline.layers };
            if (layers[layerId].status === 'awaiting_review') {
              layers[layerId] = { ...layers[layerId], status: 'scheduled' };
            }
            const reviewsPending = ([0, 1, 2] as LayerId[]).filter(
              (id) => layers[id].status === 'awaiting_review'
            ).length;
            return {
              activePipeline: {
                ...s.activePipeline,
                layers,
                humanReviewsPending: reviewsPending,
              },
            };
          });
        },

        rejectReview: (layerId) => {
          set((s) => {
            if (!s.activePipeline) return s;
            const layers = { ...s.activePipeline.layers };
            layers[layerId] = { ...layers[layerId], status: 'idle' };
            const reviewsPending = ([0, 1, 2] as LayerId[]).filter(
              (id) => layers[id].status === 'awaiting_review'
            ).length;
            return {
              activePipeline: {
                ...s.activePipeline,
                layers,
                humanReviewsPending: reviewsPending,
              },
            };
          });
        },
      }),
      {
        name: 'pipeline-store',
        partialize: (state) => ({
          // Persist configs and a lightweight run summary (no per-layer history)
          layerConfigs: state.layerConfigs,
          pipelineHistory: state.pipelineHistory.map((run) => ({
            ...run,
            layers: Object.fromEntries(
              Object.entries(run.layers).map(([k, v]) => [k, { ...v, history: [], feedbackBuffer: [] }])
            ) as unknown as PipelineRun['layers'],
          })),
        }),
      }
    ),
    { name: 'pipeline-store' }
  )
);

export { DEFAULT_LAYER_CONFIGS };
