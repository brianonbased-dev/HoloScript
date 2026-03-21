/**
 * Recursive Self-Improvement Pipeline — Type Definitions
 *
 * Layered agent architecture where L0 fixes code, L1 optimizes L0's strategy,
 * and L2 evolves L1 and generates new skills.
 *
 * Reuses existing daemon types from lib/daemon/types.ts.
 */

import type {
  DaemonPass,
  DaemonProfile,
  PatchProposal,
} from '../daemon/types';

// ─── Layer Identity ──────────────────────────────────────────────────────────

export type LayerId = 0 | 1 | 2;

export type LayerStatus =
  | 'idle'
  | 'scheduled'
  | 'running'
  | 'awaiting_review'
  | 'completed'
  | 'failed'
  | 'paused';

export type PipelineMode =
  | 'single'       // One complete L0→L1→L2 cycle
  | 'continuous'   // Auto-repeat until budget exhausted
  | 'self-target'; // Target HoloScript's own codebase

// ─── Layer Configuration ─────────────────────────────────────────────────────

export interface LayerBudget {
  /** Per-cycle cost cap in USD */
  maxCostUSD: number;
  /** Timeout per cycle in ms */
  maxDurationMs: number;
  /** Max iterations of this layer */
  maxCycles: number;
  /** Minimum gap between cycles in ms */
  cooldownMs: number;
}

export interface LayerConfig {
  id: LayerId;
  name: string;
  description: string;
  budget: LayerBudget;
  /** Gate before output is applied */
  requiresHumanReview: boolean;
  /** Can be disabled individually */
  enabled: boolean;
  /** On failure, escalate to next layer */
  autoEscalate: boolean;
}

// ─── Layer Outputs ───────────────────────────────────────────────────────────

export interface L0Output {
  kind: 'code_patches';
  patches: PatchProposal[];
  qualityDelta: number;
  filesChanged: number;
  focusUsed: string;
}

export interface L1Output {
  kind: 'strategy_adjustment';
  focusRotationChange: string[] | null;
  profileChange: DaemonProfile | null;
  passesChange: DaemonPass[] | null;
  budgetAdjustment: Partial<LayerBudget> | null;
  rationale: string;
}

export interface GeneratedSkill {
  name: string;
  description: string;
  content: string; // .hsplus source
  targetLayer: LayerId;
  confidence: number; // 0-1
}

export interface StrategyPatch {
  description: string;
  targetFile: string;
  diff: string;
  confidence: number;
}

export interface WisdomEntry {
  category: 'pattern' | 'gotcha' | 'wisdom';
  content: string;
  confidence: number;
}

export interface L2Output {
  kind: 'evolution';
  newSkills: GeneratedSkill[];
  strategyPatches: StrategyPatch[];
  architecturalInsights: string[];
  wisdomEntries: WisdomEntry[];
}

export type LayerOutput = L0Output | L1Output | L2Output;

// ─── Feedback Signals ────────────────────────────────────────────────────────

export type FeedbackSignalType =
  | 'quality_trend'
  | 'focus_effectiveness'
  | 'failure_pattern'
  | 'cost_efficiency'
  | 'skill_gap'
  | 'plateau_detected';

export interface FeedbackSignal {
  sourceLayer: LayerId;
  timestamp: string;
  signalType: FeedbackSignalType;
  data: Record<string, unknown>;
}

// ─── Cycle Results ───────────────────────────────────────────────────────────

export type CycleStatus =
  | 'success'
  | 'failure'
  | 'no_improvement'
  | 'budget_exceeded';

export interface LayerCycleResult {
  layerId: LayerId;
  cycleId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  costUSD: number;
  qualityBefore: number;
  qualityAfter: number;
  qualityDelta: number;
  output: LayerOutput;
  inputFromBelow: FeedbackSignal[];
  status: CycleStatus;
}

// ─── Pipeline State ──────────────────────────────────────────────────────────

export interface LayerState {
  config: LayerConfig;
  status: LayerStatus;
  currentCycleId: string | null;
  cyclesCompleted: number;
  history: LayerCycleResult[];
  feedbackBuffer: FeedbackSignal[];
  lastOutput: LayerOutput | null;
}

export interface PipelineRun {
  id: string;
  mode: PipelineMode;
  targetProject: string; // workspace ID or 'self'
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'completed' | 'failed' | 'paused';
  layers: Record<LayerId, LayerState>;
  totalCostUSD: number;
  totalDurationMs: number;
  humanReviewsPending: number;
}

// ─── Trend Summary ───────────────────────────────────────────────────────────

export type QualityTrajectory = 'improving' | 'stagnant' | 'declining';

export interface FocusRanking {
  focus: string;
  avgDelta: number;
  count: number;
}

export interface TrendSummary {
  qualityTrajectory: QualityTrajectory;
  bestFocus: FocusRanking[];
  avgCostPerPoint: number;
  plateauCount: number;
  totalSignals: number;
}
