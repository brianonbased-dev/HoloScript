/**
 * Choreography Trait Handler
 *
 * Enables nodes to participate in multi-agent choreography.
 * Part of HoloScript v3.1 Agentic Choreography.
 *
 * Features:
 * - Plan creation and execution
 * - Step registration and execution
 * - HITL gate integration
 * - Event subscription for choreography updates
 *
 * @version 3.1.0
 * @milestone v3.1 (March 2026)
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import type { AgentManifest } from '../agents/AgentManifest';
import type {
  ChoreographyPlan,
  ChoreographyResult,
  ChoreographyStatus,
  StepContext,
} from '../choreography/ChoreographyTypes';
import { ChoreographyEngine } from '../choreography/ChoreographyEngine';
import {
  ChoreographyPlanner,
  PlanBuilder,
  plan as createPlanBuilder,
} from '../choreography/ChoreographyPlanner';
import type { StepDefinition } from '../choreography/ChoreographyPlanner';

// =============================================================================
// TYPES
// =============================================================================

type ChoreographyMode = 'participant' | 'orchestrator' | 'hybrid';

interface ChoreographyEvent {
  type: 'plan_started' | 'plan_completed' | 'step_started' | 'step_completed' | 'hitl_required';
  planId: string;
  stepId?: string;
  data?: unknown;
  timestamp: number;
}

interface ChoreographyState {
  mode: ChoreographyMode;
  activePlans: Map<string, ChoreographyPlan>;
  completedPlans: Map<string, ChoreographyResult>;
  pendingHitl: Set<string>;
  eventHistory: ChoreographyEvent[];
  engine: ChoreographyEngine | null;
  planner: ChoreographyPlanner | null;
  registeredActions: Map<string, ActionDefinition>;
  agentManifest: AgentManifest | null;
}

interface ActionDefinition {
  name: string;
  handler: (
    inputs: Record<string, unknown>,
    context: StepContext
  ) => Promise<Record<string, unknown>>;
  description?: string;
  inputs?: string[];
  outputs?: string[];
}

interface ChoreographyConfig {
  /** Operating mode */
  mode: ChoreographyMode;
  /** Auto-start engine on attach */
  auto_start: boolean;
  /** Maximum concurrent plans (orchestrator mode) */
  max_concurrent_plans: number;
  /** Default step timeout (ms) */
  default_step_timeout: number;
  /** Event history limit */
  event_history_limit: number;
  /** Whether to pause on HITL gates */
  hitl_auto_pause: boolean;
  /** Execute fallback plans on failure */
  execute_fallback: boolean;
  /** Verbose logging */
  verbose: boolean;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CHOREOGRAPHY_CONFIG: ChoreographyConfig = {
  mode: 'participant',
  auto_start: true,
  max_concurrent_plans: 4,
  default_step_timeout: 30000,
  event_history_limit: 100,
  hitl_auto_pause: true,
  execute_fallback: true,
  verbose: false,
};

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

function createDefaultState(): ChoreographyState {
  return {
    mode: 'participant',
    activePlans: new Map(),
    completedPlans: new Map(),
    pendingHitl: new Set(),
    eventHistory: [],
    engine: null,
    planner: null,
    registeredActions: new Map(),
    agentManifest: null,
  };
}

type NodeWithChoreography = HSPlusNode & {
  __choreography_state?: ChoreographyState;
};

function getState(node: HSPlusNode): ChoreographyState {
  const n = node as NodeWithChoreography;
  if (!n.__choreography_state) {
    throw new Error('Choreography trait not attached');
  }
  return n.__choreography_state;
}

function addEvent(
  state: ChoreographyState,
  type: ChoreographyEvent['type'],
  planId: string,
  config: ChoreographyConfig,
  stepId?: string
): void {
  const event: ChoreographyEvent = {
    type,
    planId,
    stepId,
    timestamp: Date.now(),
  };

  state.eventHistory.push(event);

  // Trim history if needed
  while (state.eventHistory.length > config.event_history_limit) {
    state.eventHistory.shift();
  }
}

// =============================================================================
// HANDLER IMPLEMENTATION
// =============================================================================

/**
 * Choreography trait handler
 */
export const choreographyHandler: TraitHandler<ChoreographyConfig> = {
  name: 'choreography',

  defaultConfig: DEFAULT_CHOREOGRAPHY_CONFIG,

  onAttach(node: HSPlusNode, config: ChoreographyConfig, _context: TraitContext) {
    const cfg = { ...DEFAULT_CHOREOGRAPHY_CONFIG, ...config };
    const state = createDefaultState();
    state.mode = cfg.mode;

    // Store state on node
    (node as NodeWithChoreography).__choreography_state = state;

    // Initialize planner
    state.planner = new ChoreographyPlanner();

    // Initialize engine for orchestrator mode
    if (cfg.mode === 'orchestrator' || cfg.mode === 'hybrid') {
      state.engine = new ChoreographyEngine({
        maxConcurrency: cfg.max_concurrent_plans,
        defaultTimeout: cfg.default_step_timeout,
        executeFallback: cfg.execute_fallback,
        autoHitlPause: cfg.hitl_auto_pause,
        verbose: cfg.verbose,
      });

      // Set up action handler that routes to registered actions
      state.engine.setActionHandler(async (agent, action, inputs, context) => {
        const actionDef = state.registeredActions.get(action);
        if (!actionDef) {
          throw new Error(`Unknown action: ${action}`);
        }
        return actionDef.handler(inputs, context);
      });

      // Subscribe to engine events
      state.engine.on('plan:started', (plan) => {
        addEvent(state, 'plan_started', plan.id, cfg);
      });

      state.engine.on('plan:completed', (result) => {
        state.completedPlans.set(result.planId, result);
        addEvent(state, 'plan_completed', result.planId, cfg);
      });

      state.engine.on('step:started', (step, plan) => {
        addEvent(state, 'step_started', plan.id, cfg, step.id);
      });

      state.engine.on('step:completed', (result, plan) => {
        addEvent(state, 'step_completed', plan.id, cfg, result.stepId);
      });

      state.engine.on('hitl:required', (step, plan) => {
        state.pendingHitl.add(step.id);
        addEvent(state, 'hitl_required', plan.id, cfg, step.id);
      });
    }
  },

  onDetach(node: HSPlusNode, _config: ChoreographyConfig, _context: TraitContext) {
    const n = node as NodeWithChoreography;
    const state = n.__choreography_state;
    if (state) {
      // Cancel all active plans
      if (state.engine) {
        for (const planId of state.activePlans.keys()) {
          state.engine.cancel(planId).catch(() => {});
        }
      }

      // Clean up
      state.activePlans.clear();
      state.registeredActions.clear();
      state.engine = null;
      state.planner = null;
    }
    delete n.__choreography_state;
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a choreography plan
 */
export function createChoreographyPlan(
  node: HSPlusNode,
  goal: string,
  agents: AgentManifest[],
  steps: StepDefinition[]
): ChoreographyPlan {
  const state = getState(node);
  if (!state.planner) {
    throw new Error('Planner not initialized');
  }

  return state.planner.createPlan({
    goal,
    agents,
    steps,
  });
}

/**
 * Get a fluent plan builder
 */
export function getPlanBuilder(goal: string): PlanBuilder {
  return createPlanBuilder(goal);
}

/**
 * Execute a choreography plan
 */
export async function executeChoreography(
  node: HSPlusNode,
  plan: ChoreographyPlan,
  variables?: Record<string, unknown>
): Promise<ChoreographyResult> {
  const state = getState(node);
  if (!state.engine) {
    throw new Error('Engine not initialized. Mode must be orchestrator or hybrid.');
  }

  state.activePlans.set(plan.id, plan);

  try {
    return await state.engine.execute(plan, variables);
  } finally {
    state.activePlans.delete(plan.id);
  }
}

/**
 * Pause a running plan
 */
export async function pauseChoreography(node: HSPlusNode, planId: string): Promise<void> {
  const state = getState(node);
  if (!state.engine) {
    throw new Error('Engine not initialized');
  }
  await state.engine.pause(planId);
}

/**
 * Resume a paused plan
 */
export async function resumeChoreography(node: HSPlusNode, planId: string): Promise<void> {
  const state = getState(node);
  if (!state.engine) {
    throw new Error('Engine not initialized');
  }
  await state.engine.resume(planId);
}

/**
 * Cancel a running plan
 */
export async function cancelChoreography(node: HSPlusNode, planId: string): Promise<void> {
  const state = getState(node);
  if (!state.engine) {
    throw new Error('Engine not initialized');
  }
  await state.engine.cancel(planId);
}

/**
 * Approve a HITL gate
 */
export function approveHitl(node: HSPlusNode, planId: string, stepId: string): void {
  const state = getState(node);
  if (!state.engine) {
    throw new Error('Engine not initialized');
  }
  state.pendingHitl.delete(stepId);
  state.engine.approveHitl(planId, stepId);
}

/**
 * Reject a HITL gate
 */
export function rejectHitl(node: HSPlusNode, planId: string, stepId: string, reason: string): void {
  const state = getState(node);
  if (!state.engine) {
    throw new Error('Engine not initialized');
  }
  state.pendingHitl.delete(stepId);
  state.engine.rejectHitl(planId, stepId, reason);
}

/**
 * Register an action this node can perform
 */
export function registerAction(
  node: HSPlusNode,
  name: string,
  handler: (
    inputs: Record<string, unknown>,
    context: StepContext
  ) => Promise<Record<string, unknown>>,
  options?: { description?: string; inputs?: string[]; outputs?: string[] }
): void {
  const state = getState(node);
  state.registeredActions.set(name, {
    name,
    handler,
    description: options?.description,
    inputs: options?.inputs,
    outputs: options?.outputs,
  });
}

/**
 * Unregister an action
 */
export function unregisterAction(node: HSPlusNode, name: string): boolean {
  const state = getState(node);
  return state.registeredActions.delete(name);
}

/**
 * Get registered action names
 */
export function getRegisteredActions(node: HSPlusNode): string[] {
  const state = getState(node);
  return Array.from(state.registeredActions.keys());
}

/**
 * Get active plan IDs
 */
export function getActivePlans(node: HSPlusNode): string[] {
  const state = getState(node);
  return Array.from(state.activePlans.keys());
}

/**
 * Get plan status
 */
export function getPlanStatus(node: HSPlusNode, planId: string): ChoreographyStatus | null {
  const state = getState(node);
  const plan = state.activePlans.get(planId);
  return plan?.status || null;
}

/**
 * Get pending HITL step IDs
 */
export function getPendingHitl(node: HSPlusNode): string[] {
  const state = getState(node);
  return Array.from(state.pendingHitl);
}

/**
 * Get event history
 */
export function getEventHistory(node: HSPlusNode, limit?: number): ChoreographyEvent[] {
  const state = getState(node);
  if (limit) {
    return state.eventHistory.slice(-limit);
  }
  return [...state.eventHistory];
}

export default choreographyHandler;
