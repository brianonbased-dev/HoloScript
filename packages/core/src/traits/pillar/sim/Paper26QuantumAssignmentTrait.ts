/**
 * Paper26QuantumAssignmentTrait — QAOA-based agent task assignment for the
 * uAAL Collective simulation world.
 *
 * Problem framing
 * ───────────────
 * 100 humanoid agents are arranged in 4 concentric rings.  At each QAOA
 * rerun interval the trait builds a graph whose vertices are agents and
 * whose edge weights encode γ-value similarity.  Running Max-Cut on this
 * graph via QAOA (Quantum Approximate Optimization Algorithm) partitions
 * the ring into two complementary capability groups — agents with similar
 * γ tend to end up together, agents with complementary γ cross the cut.
 *
 * Hardware budget per ring
 * ────────────────────────
 *   Ring 0 (12 agents)  — 12-qubit QAOA on real IBM hardware (or Aer)
 *   Ring 1 (24 agents)  — 24-qubit QAOA, Aer simulator only (~2-5 s)
 *   Ring 2 (36 agents)  — classical greedy bisection (QAOA too slow)
 *   Ring 3 (28 agents)  — classical greedy bisection
 *
 * The same fallback applies unconditionally when agentIds.length > 24.
 *
 * Data flow
 * ─────────
 * 1. HoloLand runtime dispatches 'avatar:metrics-update' events per tick.
 * 2. This trait accumulates per-agent γ values into a local cache.
 * 3. When the rerun interval elapses the trait starts an async QAOA job
 *    (or greedy bisection) and emits 'quantum:assignment-result' once done.
 * 4. On 'quantum:assignment-result' the trait emits
 *    'avatar:group-assignment' for each agent in the ring.
 * 5. Avatar renderers listen to 'avatar:group-assignment' and modulate
 *    glowIntensity / animState to show group membership.
 *
 * Circular-dependency guard
 * ─────────────────────────
 * The trait does NOT import from the qm-bridge plugin.  The caller supplies
 * a QAOARunner implementation via createQuantumAssignmentTrait().
 *
 * Compilation targets
 * ───────────────────
 *   OpenXR (Quest 3)  — compile via mcp compile_to_openxr
 *   Web / R3F         — compile via mcp compile_to_r3f
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from '../../TraitTypes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public interface — QAOA runner (implemented by qm-bridge, injected by caller)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal QAOA runner interface.
 *
 * Avoids a direct import from the qm-bridge plugin (which would create a
 * circular package dependency).  The caller constructs the concrete
 * IBMQuantumBackend and passes it to {@link createQuantumAssignmentTrait}.
 */
export interface QAOARunner {
  /**
   * Run a QAOA Max-Cut circuit for the given weight matrix.
   *
   * @param weightMatrix - Symmetric n×n edge-weight matrix (values in [0,1]).
   * @param circuitDepthP - QAOA p parameter (number of QAOA layers). Default 1.
   * @returns Result including the optimal bitstring and quality metrics.
   */
  runQAOA(
    weightMatrix: number[][],
    circuitDepthP?: number,
  ): Promise<{
    /** Length-n binary string — '0' or '1' per agent index */
    optimalBitstring: string;
    /** Max-Cut objective value achieved */
    optimalValue: number;
    /** Approximation ratio vs classical upper-bound */
    approximationRatio: number;
    /** Actual p value used by the backend */
    circuitDepthP: number;
    /** Number of qubits allocated */
    numQubits: number;
    /** Backend identifier, e.g. "ibm_aer" | "ibm_brisbane" */
    executionBackend: string;
    /** Wall-clock seconds for the circuit execution */
    wallTimeSeconds: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config and state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configuration for a single ring's quantum assignment trait instance.
 */
export interface Paper26QuantumAssignmentConfig {
  /** Agent IDs in this assignment group (subset of the 100 agents). */
  agentIds: string[];
  /** Ring this instance covers: 0 = inner council, 3 = outer. */
  ring: 0 | 1 | 2 | 3;
  /**
   * How many SSE ticks between QAOA reruns.
   * @default 50
   */
  rerunIntervalTicks?: number;
  /**
   * QAOA p parameter (number of circuit layers).
   * @default 1
   */
  qaoa_p?: number;
  /**
   * When true the backend targets real IBM quantum hardware.
   * When false (default) the Aer simulator is used.
   * @default false
   */
  useRealHardware?: boolean;
}

/**
 * Mutable runtime state stored on the node instance.
 */
export interface Paper26QuantumAssignmentState {
  /** Last QAOA result bitstring — index i maps to agentIds[i]. */
  assignment: string;
  /** Tick at which QAOA was last triggered. */
  lastRunTick: number;
  /** Approximation ratio from the last successful run. */
  approximationRatio: number;
  /** True while a QAOA job is in flight (prevents re-entrant calls). */
  running: boolean;
  /** Error string from the last failed run, if any. */
  lastError?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal state-slot helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATE_KEY  = '__p26qa_state__';
const GAMMA_KEY  = '__p26qa_gammas__';
const TICK_KEY   = '__p26qa_tick__';

function getState(node: HSPlusNode): Paper26QuantumAssignmentState {
  return (node as unknown as Record<string, unknown>)[STATE_KEY] as Paper26QuantumAssignmentState ?? {
    assignment:        '',
    lastRunTick:       0,
    approximationRatio: 0,
    running:           false,
  };
}

function setState(node: HSPlusNode, s: Paper26QuantumAssignmentState): void {
  (node as unknown as Record<string, unknown>)[STATE_KEY] = s;
}

/** Per-agent γ cache: agentId → latest γ value */
function getGammaCache(node: HSPlusNode): Record<string, number> {
  return (node as unknown as Record<string, unknown>)[GAMMA_KEY] as Record<string, number> ?? {};
}

function setGammaCache(node: HSPlusNode, cache: Record<string, number>): void {
  (node as unknown as Record<string, unknown>)[GAMMA_KEY] = cache;
}

/** Current tick counter (updated from avatar:metrics-update events) */
function getCurrentTick(node: HSPlusNode): number {
  return ((node as unknown as Record<string, unknown>)[TICK_KEY] as number) ?? 0;
}

function setCurrentTick(node: HSPlusNode, tick: number): void {
  (node as unknown as Record<string, unknown>)[TICK_KEY] = tick;
}

// ─────────────────────────────────────────────────────────────────────────────
// Weight matrix construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an n×n symmetric edge-weight matrix from agents' γ values.
 *
 * Edge weight W[i][j] = 1 − |γ_i − γ_j|, rounded to one decimal place.
 *
 * Semantics: high weight = similar γ = likely same group.
 * Running Max-Cut on this graph bisects agents into complementary capability
 * groups (agents with very different γ values are placed across the cut).
 *
 * Missing agents default to γ = 0.5 (uniform prior).
 *
 * @param agentGammas - Map from agentId to γ value in [0,1].
 * @param agentIds    - Ordered list of agent IDs for the matrix rows/cols.
 * @returns Symmetric n×n weight matrix with values in [0,1].
 */
export function buildGammaWeightMatrix(
  agentGammas: Record<string, number>,
  agentIds: string[],
): number[][] {
  const n = agentIds.length;
  const W: number[][] = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const gi = agentGammas[agentIds[i]] ?? 0.5;
      const gj = agentGammas[agentIds[j]] ?? 0.5;
      const w  = Math.round((1 - Math.abs(gi - gj)) * 10) / 10;
      W[i][j] = w;
      W[j][i] = w;
    }
  }
  return W;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classical greedy bisection (fallback for rings 2+3 or n > 24)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classical greedy Max-Cut bisection.
 *
 * Used as a fallback when the QAOA problem is too large for near-term
 * quantum hardware or fast Aer simulation (rings 2+3, or agentIds.length > 24).
 *
 * Algorithm: iterative swap greedy.
 * 1. Start with alternating 0/1 assignment.
 * 2. For each agent, tentatively flip their bit.
 * 3. If the flip improves the cut value, keep it.
 * 4. Repeat until no improvement is found (≤ n passes).
 *
 * Time complexity: O(n³) worst-case, O(n²) typical — fine for n ≤ 36.
 *
 * @param weightMatrix - Symmetric n×n edge-weight matrix.
 * @returns Length-n binary string ('0'|'1') — same index convention as QAOA.
 */
export function classicalGreedyBisection(weightMatrix: number[][]): string {
  const n = weightMatrix.length;
  if (n === 0) return '';

  // Initial assignment: alternate 0/1 to ensure a balanced start
  const bits: number[] = Array.from({ length: n }, (_, i) => i % 2);

  /** Compute total Max-Cut objective for the current assignment. */
  const cutValue = (): number => {
    let total = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (bits[i] !== bits[j]) total += weightMatrix[i][j];
      }
    }
    return total;
  };

  let improved = true;
  let passes   = 0;
  const maxPasses = n; // guaranteed termination

  while (improved && passes < maxPasses) {
    improved = false;
    passes++;
    for (let i = 0; i < n; i++) {
      const before = cutValue();
      bits[i] = 1 - bits[i]; // tentative flip
      const after = cutValue();
      if (after <= before) {
        bits[i] = 1 - bits[i]; // revert
      } else {
        improved = true;
      }
    }
  }

  return bits.map(String).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Ring-tier QAOA budget policy
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum qubit count before falling back to classical bisection. */
const QAOA_MAX_QUBITS = 24;

/**
 * Determine whether a ring should use QAOA or classical bisection.
 *
 * Rings 0 and 1 use QAOA (subject to qubit cap).
 * Rings 2 and 3 always fall back to classical bisection.
 */
function shouldUseQAOA(ring: 0 | 1 | 2 | 3, agentCount: number): boolean {
  if (agentCount > QAOA_MAX_QUBITS) return false;
  return ring <= 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Async assignment runner — called from event handler, result emitted as event
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @internal
 * Kick off the assignment computation (QAOA or greedy) asynchronously.
 * The caller must NOT await this function inside onEvent.
 * Results are communicated back via ctx.emit('quantum:assignment-result').
 */
async function runAssignment(
  qaoa: QAOARunner,
  node: HSPlusNode,
  config: Paper26QuantumAssignmentConfig,
  ctx: TraitContext,
  currentTick: number,
): Promise<void> {
  const agentIds     = config.agentIds;
  const ring         = config.ring;
  const qaoa_p       = config.qaoa_p ?? 1;
  const agentGammas  = getGammaCache(node);
  const weightMatrix = buildGammaWeightMatrix(agentGammas, agentIds);

  if (!shouldUseQAOA(ring, agentIds.length)) {
    // Classical greedy bisection — rings 2+3 or oversized problems
    const assignment = classicalGreedyBisection(weightMatrix);
    ctx.emit('quantum:assignment-skipped', {
      ring,
      agentCount: agentIds.length,
      reason: 'ring_tier_budget',
      assignmentMethod: 'classical_greedy',
    });
    ctx.emit('quantum:assignment-result', {
      ring,
      agentIds,
      assignment,
      approximationRatio:  1.0,   // greedy achieves ≥ 0.5 of optimum; treat as 1 for display
      executionBackend:    'classical',
      wallTimeSeconds:     0,
      tick:                currentTick,
    });
    return;
  }

  // QAOA path — rings 0 or 1, agentIds.length ≤ 24
  try {
    const result = await qaoa.runQAOA(weightMatrix, qaoa_p);
    ctx.emit('quantum:assignment-result', {
      ring,
      agentIds,
      assignment:          result.optimalBitstring,
      approximationRatio:  result.approximationRatio,
      executionBackend:    result.executionBackend,
      wallTimeSeconds:     result.wallTimeSeconds,
      numQubits:           result.numQubits,
      optimalValue:        result.optimalValue,
      tick:                currentTick,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Fall back to greedy on QAOA error so the simulation keeps running
    const assignment = classicalGreedyBisection(weightMatrix);
    ctx.emit('quantum:assignment-result', {
      ring,
      agentIds,
      assignment,
      approximationRatio:  1.0,
      executionBackend:    'classical_fallback',
      wallTimeSeconds:     0,
      tick:                currentTick,
      error:               msg,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Group visual mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive glowIntensity and animState overrides from a group bit.
 *
 * Group 0 ("cut side A") — reduced glow, grounded stance.
 * Group 1 ("cut side B") — elevated glow, open stance.
 */
function groupVisuals(
  bit: '0' | '1',
): { glowIntensityDelta: number; animStateOverride: string } {
  return bit === '1'
    ? { glowIntensityDelta: +0.25, animStateOverride: 'upright_calm' }
    : { glowIntensityDelta: -0.15, animStateOverride: 'lean_in' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory — injects QAOARunner via closure
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a {@link TraitHandler} for quantum task assignment with the given
 * QAOA backend.
 *
 * Usage:
 * ```ts
 * import { IBMQuantumBackend } from '@holoscript/qm-bridge';
 * import { createQuantumAssignmentTrait } from './Paper26QuantumAssignmentTrait.js';
 *
 * const handler = createQuantumAssignmentTrait(new IBMQuantumBackend({ useAer: true }));
 * registry.register(handler);
 * ```
 *
 * @param qaoa - A concrete QAOARunner implementation (injected, not imported).
 * @returns A TraitHandler ready to be registered with the HoloScript runtime.
 */
export function createQuantumAssignmentTrait(
  qaoa: QAOARunner,
): TraitHandler<Paper26QuantumAssignmentConfig> {
  return {
    name: 'paper26_quantum_assignment',

    // ── onAttach ─────────────────────────────────────────────────────────────

    onAttach(node: HSPlusNode, config: Paper26QuantumAssignmentConfig, ctx: TraitContext): void {
      // Initialise state and caches on the node
      setState(node, {
        assignment:         '',
        lastRunTick:        0,
        approximationRatio: 0,
        running:            false,
      });
      setGammaCache(node, {});
      setCurrentTick(node, 0);

      ctx.emit('quantum:assignment-attached', {
        ring:       config.ring,
        agentCount: config.agentIds.length,
        qaoa_p:     config.qaoa_p ?? 1,
        useQAOA:    shouldUseQAOA(config.ring, config.agentIds.length),
      });
    },

    // ── onEvent ──────────────────────────────────────────────────────────────

    onEvent(
      node:   HSPlusNode,
      config: Paper26QuantumAssignmentConfig,
      ctx:    TraitContext,
      event:  TraitEvent,
    ): void {
      const ev = event as TraitEvent & { payload?: Record<string, unknown> };

      // ── avatar:metrics-update ──────────────────────────────────────────────
      if (ev.type === 'avatar:metrics-update') {
        const p = ev.payload ?? {};

        // Update γ cache for the agent identified in the payload
        const agentId = p['agent_id'] as string | undefined;
        const gamma   = p['gamma']    as number | undefined;
        if (typeof agentId === 'string' && typeof gamma === 'number'
            && config.agentIds.includes(agentId)) {
          const cache = getGammaCache(node);
          cache[agentId] = gamma;
          setGammaCache(node, cache);
        }

        // Advance tick counter
        const tick = (p['tick'] as number | undefined) ?? (getCurrentTick(node) + 1);
        setCurrentTick(node, tick);

        // Check rerun interval
        const interval = config.rerunIntervalTicks ?? 50;
        const state    = getState(node);
        const ticksSinceLast = tick - state.lastRunTick;

        if (!state.running && ticksSinceLast >= interval) {
          // Mark running to prevent re-entrant calls
          setState(node, { ...state, running: true, lastRunTick: tick });

          // Fire-and-forget — result is emitted as an event
          void runAssignment(qaoa, node, config, ctx, tick).finally(() => {
            const current = getState(node);
            setState(node, { ...current, running: false });
          });
        }

        return;
      }

      // ── quantum:assignment-result ──────────────────────────────────────────
      if (ev.type === 'quantum:assignment-result') {
        const p = ev.payload ?? {};

        // Only process results that belong to this ring
        if ((p['ring'] as number | undefined) !== config.ring) return;

        const assignment        = (p['assignment']         as string) ?? '';
        const approximationRatio = (p['approximationRatio'] as number) ?? 0;
        const tick              = (p['tick']               as number) ?? getCurrentTick(node);
        const error             = p['error'] as string | undefined;

        // Persist result in node state
        setState(node, {
          assignment,
          lastRunTick:        tick,
          approximationRatio,
          running:            false,
          lastError:          error,
        });

        // Emit per-agent group assignment events
        const agentIds = (p['agentIds'] as string[] | undefined) ?? config.agentIds;
        for (let i = 0; i < agentIds.length; i++) {
          const bit    = (assignment[i] ?? '0') as '0' | '1';
          const visuals = groupVisuals(bit);
          ctx.emit('avatar:group-assignment', {
            agent_id:           agentIds[i],
            ring:               config.ring,
            group:              bit === '1' ? 'B' : 'A',
            glowIntensityDelta: visuals.glowIntensityDelta,
            animStateOverride:  visuals.animStateOverride,
            approximationRatio,
            tick,
          });
        }

        return;
      }
    },

    // ── onDetach ─────────────────────────────────────────────────────────────

    onDetach(node: HSPlusNode, config: Paper26QuantumAssignmentConfig, ctx: TraitContext): void {
      ctx.emit('quantum:assignment-detached', {
        ring:       config.ring,
        agentCount: config.agentIds.length,
      });
      // Clear node slots
      const rec = node as unknown as Record<string, unknown>;
      delete rec[STATE_KEY];
      delete rec[GAMMA_KEY];
      delete rec[TICK_KEY];
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Default export for direct use with a no-op stub backend (testing / preview)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stub QAOARunner that always returns a classical greedy result.
 *
 * Useful in tests and local preview when no real quantum backend is available.
 *
 * @example
 * ```ts
 * const handler = createQuantumAssignmentTrait(stubQAOARunner);
 * ```
 */
export const stubQAOARunner: QAOARunner = {
  async runQAOA(weightMatrix: number[][], circuitDepthP = 1): Promise<{
    optimalBitstring: string;
    optimalValue: number;
    approximationRatio: number;
    circuitDepthP: number;
    numQubits: number;
    executionBackend: string;
    wallTimeSeconds: number;
  }> {
    const bitstring = classicalGreedyBisection(weightMatrix);
    return {
      optimalBitstring:   bitstring,
      optimalValue:       0,
      approximationRatio: 1.0,
      circuitDepthP,
      numQubits:          weightMatrix.length,
      executionBackend:   'stub_classical',
      wallTimeSeconds:    0,
    };
  },
};

/**
 * Pre-built handler using the stub runner.
 *
 * Register this directly in unit tests or when the qm-bridge plugin is not
 * present.
 */
export const paper26QuantumAssignmentHandler: TraitHandler<Paper26QuantumAssignmentConfig> =
  createQuantumAssignmentTrait(stubQAOARunner);
