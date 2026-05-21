/**
 * Paper26AgentAvatarTrait — humanoid avatar for a uAAL simulation agent.
 *
 * Maps live CogVM metrics → avatar appearance + animation for HoloLand /
 * Quest 3.  One avatar instance runs per uAAL agent slot in the "uAAL
 * Collective" world (uaal-collective.world.holo).
 *
 * Visual contract
 * ───────────────
 * Metric          → Visual channel
 * ─────────────────────────────────────────────────────────────────────────
 * γ (hemisphere   → Body glow intensity + upright posture scale
 *   agreement)      High γ = cyan bright glow, tall open stance
 *                   Low γ  = dim purple, slight forward lean
 *
 * lifecycle       → Animation state (see LifecycleAnim map below)
 *
 * totalLoss       → Facial expression tension + micro-tremor
 *                   High loss = furrowed brow, subtle jitter
 *
 * diversityRatio  → Particle aura density around the avatar
 *                   High diversity = dense multi-color particles
 *
 * Floating HUD (2.3m above foot origin)
 * ──────────────────────────────────────
 *   agent_id  |  γ XX%  |  LIFECYCLE
 *   loss: X.XXXX   ρ: XX%
 *
 * Population-level HUD (central pillar) — driven by simStore SSE, not this
 * trait.  See packages/holomesh-web/src/app/sim/paper26/page.tsx for the
 * web mirror.
 *
 * Data flow
 * ─────────
 * 1. Paper26SimRunner pushes metrics every checkpoint via HTTP POST
 *    → /sim/paper26/api/push → simStore → SSE broadcast
 * 2. HoloLand runtime opens an SSE connection to
 *    https://sim.holoscript.studio/sim/paper26/api/stream
 * 3. Each tick, the runtime dispatches 'avatar:metrics-update' events to
 *    the matching avatar node (keyed by agent_id)
 * 4. This trait's onEvent handler updates the avatar state accordingly
 *
 * Compilation targets
 * ───────────────────
 *   OpenXR (Quest 3)  — compile via mcp compile_to_openxr
 *   VisionOS          — compile via mcp compile_to_visionos
 *   Web / R3F         — compile via mcp compile_to_r3f
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from '../../TraitTypes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface Paper26AvatarConfig {
  /** Agent slot identifier — must match sim agent_id (e.g. sim_agent_042) */
  agent_id: string;
  /** World-space position [x, y, z] in metres (foot origin) */
  position: [number, number, number];
  /** Ring index (0–3) — affects ring-accent colour */
  ring: 0 | 1 | 2 | 3;
  /** Whether this is a sycophantic agent (secondary eval) */
  sycophantic?: boolean;
}

export interface Paper26AvatarState {
  gamma:        number;   // 0–1 hemisphere agreement
  lifecycle:    string;   // 'init' | 'learning' | 'converging' | 'stable' | 'diverging'
  totalLoss:    number;
  diversity:    number;   // 0–1
  lastUpdated:  number;   // ms timestamp
}

/** What the renderer consumes to drive the avatar each frame */
export interface Paper26AvatarRenderState {
  position:    [number, number, number];
  glowColor:   string;   // CSS hex
  glowIntensity: number; // 0–1
  postureScale:  number; // 0.85–1.05 (vertical lean factor)
  animState:   LifecycleAnim;
  expressionTension: number; // 0–1 (drives brow + jaw morph targets)
  particleDensity:   number; // 0–1
  hudLines: [string, string]; // two-line floating HUD text
  isSycophantic: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle → animation state machine
// ─────────────────────────────────────────────────────────────────────────────

export type LifecycleAnim =
  | 'idle_neutral'     // init
  | 'active_observe'   // learning — head turns, hand gestures
  | 'lean_in'          // converging — body leans toward arena centre
  | 'upright_calm'     // stable — tall, relaxed
  | 'step_back'        // diverging — weight shift back
  | 'mirror_pose';     // sycophantic — mirrors nearest agent

const LIFECYCLE_ANIM: Record<string, LifecycleAnim> = {
  init:         'idle_neutral',
  learning:     'active_observe',
  converging:   'lean_in',
  stable:       'upright_calm',
  diverging:    'step_back',
  sycophantic:  'mirror_pose',
};

// ─────────────────────────────────────────────────────────────────────────────
// Ring accent colours (outer ring is warmer, inner is cooler)
// ─────────────────────────────────────────────────────────────────────────────

const RING_BASE_COLOR: Record<number, string> = {
  0: '#22d3ee',  // inner  — cyan-bright
  1: '#a855f7',  // ring 1 — purple
  2: '#6366f1',  // ring 2 — indigo
  3: '#818cf8',  // outer  — muted indigo
};

// ─────────────────────────────────────────────────────────────────────────────
// Render state derivation
// ─────────────────────────────────────────────────────────────────────────────

function deriveRenderState(
  config: Paper26AvatarConfig,
  state: Paper26AvatarState,
): Paper26AvatarRenderState {
  const { gamma, lifecycle, totalLoss, diversity } = state;

  // Glow: high γ → cyan bright; low γ → dim purple
  const glowColor     = gamma > 0.6 ? '#22d3ee' : gamma > 0.3 ? '#a855f7' : '#3b0764';
  const glowIntensity = 0.2 + gamma * 0.8;

  // Posture: γ maps to [0.87, 1.03] — subtle, not cartoonish
  const postureScale = 0.87 + gamma * 0.16;

  // Animation
  const animKey    = config.sycophantic ? 'sycophantic' : lifecycle;
  const animState  = LIFECYCLE_ANIM[animKey] ?? 'idle_neutral';

  // Facial tension: normalise loss to [0,1] using a soft cap at 2.0
  const expressionTension = Math.min(totalLoss / 2.0, 1.0);

  // Particles: diversity ratio directly drives density
  const particleDensity = diversity;

  // HUD
  const gammaStr   = (gamma * 100).toFixed(0).padStart(3, ' ');
  const lifecycleLabel = lifecycle.toUpperCase().padEnd(10, ' ');
  const lossStr    = totalLoss.toFixed(4);
  const divStr     = (diversity * 100).toFixed(0);
  const hudLines: [string, string] = [
    `${config.agent_id}  γ ${gammaStr}%  ${lifecycleLabel}`,
    `loss ${lossStr}  ρ ${divStr}%`,
  ];

  return {
    position:           config.position,
    glowColor,
    glowIntensity,
    postureScale,
    animState,
    expressionTension,
    particleDensity,
    hudLines,
    isSycophantic:      config.sycophantic ?? false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trait handler
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_AVATAR_STATE: Paper26AvatarState = {
  gamma:       0,
  lifecycle:   'init',
  totalLoss:   0,
  diversity:   1.0,
  lastUpdated: 0,
};

function getAvatarState(node: HSPlusNode): Paper26AvatarState {
  return (node as Record<string, unknown>)['__p26avatar_state__'] as Paper26AvatarState
    ?? { ...DEFAULT_AVATAR_STATE };
}

function setAvatarState(node: HSPlusNode, state: Paper26AvatarState): void {
  (node as Record<string, unknown>)['__p26avatar_state__'] = state;
}

export const paper26AvatarHandler: TraitHandler<Paper26AvatarConfig> = {
  name: 'paper26_agent_avatar',

  onAttach(node, config, ctx) {
    setAvatarState(node, { ...DEFAULT_AVATAR_STATE });
    ctx.emit('avatar:attached', {
      agent_id: config.agent_id,
      position: config.position,
      ring:     config.ring,
    });
  },

  onEvent(node, config, ctx, event) {
    const ev = event as TraitEvent & { payload?: Record<string, unknown> };

    // Live push from HoloLand runtime (originating from sim SSE stream)
    if (ev.type === 'avatar:metrics-update') {
      const p = ev.payload ?? {};
      const prev = getAvatarState(node);
      const next: Paper26AvatarState = {
        gamma:       (p['gamma']     as number) ?? prev.gamma,
        lifecycle:   (p['lifecycle'] as string) ?? prev.lifecycle,
        totalLoss:   (p['totalLoss'] as number) ?? prev.totalLoss,
        diversity:   (p['diversity'] as number) ?? prev.diversity,
        lastUpdated: Date.now(),
      };
      setAvatarState(node, next);
      ctx.emit('avatar:render-state', deriveRenderState(config, next));
      return;
    }

    // Intra-agent tick (when avatar runs co-located with sim runner)
    if (ev.type === 'cogvm:tick') {
      // No-op: render state is driven by metrics-update events, not tick
      return;
    }
  },

  onDetach(node, _config, ctx) {
    ctx.emit('avatar:detached', { agent_id: _config.agent_id });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Ring layout helpers — generate all 100 agent positions
// ─────────────────────────────────────────────────────────────────────────────

/** Concentric ring spec: { count, radius } */
const RING_SPEC = [
  { count: 12, radius: 4  },   // ring 0 — innermost
  { count: 24, radius: 8  },   // ring 1
  { count: 36, radius: 12 },   // ring 2
  { count: 28, radius: 16 },   // ring 3 — outermost
] as const;

export function generateAgentPositions(): Array<Paper26AvatarConfig & { index: number }> {
  const positions: Array<Paper26AvatarConfig & { index: number }> = [];
  let agentIndex = 0;

  for (const [ringIndex, spec] of RING_SPEC.entries()) {
    const angleStep = (2 * Math.PI) / spec.count;
    // Offset each ring slightly so agents don't radially align
    const angleOffset = ringIndex * (Math.PI / (spec.count * 2));

    for (let i = 0; i < spec.count; i++) {
      const angle = i * angleStep + angleOffset;
      const x     = spec.radius * Math.cos(angle);
      const z     = spec.radius * Math.sin(angle);
      const id    = `sim_agent_${String(agentIndex).padStart(3, '0')}`;

      positions.push({
        index:      agentIndex,
        agent_id:   id,
        position:   [
          parseFloat(x.toFixed(3)),
          0,
          parseFloat(z.toFixed(3)),
        ],
        ring:       ringIndex as 0 | 1 | 2 | 3,
        sycophantic: false, // override for secondary eval
      });

      agentIndex++;
    }
  }

  return positions;
}

/** SSE-to-avatar router: maps incoming SSE tick to per-agent metrics-update events.
 *  Call this from the HoloLand runtime once the SSE stream is connected. */
export interface SSEMetricsTick {
  metrics: {
    tick:             number;
    medianGamma:      number;
    p90Gamma:         number;
    meanTotalLoss:    number;
    stdTotalLoss:     number;
    meanDiversity:    number;
    lifecycleDistrib: Record<string, number>;
  };
}

/**
 * Derive per-agent avatar update from a population-level SSE tick.
 *
 * Population metrics → per-avatar approximation:
 *   • γ is drawn from a truncated normal centred at medianGamma with σ=0.15
 *     seeded by the agent's stable index so the visual spread is
 *     deterministic across reconnects.
 *   • lifecycle is sampled from lifecycleDistrib proportions, again seeded.
 *   • loss and diversity are shared (mean values) — per-agent tracking is
 *     only available when the runner is connected in real time.
 */
export function derivePerAgentUpdates(
  tick: SSEMetricsTick,
  agentPositions: Array<Paper26AvatarConfig & { index: number }>,
): Array<{ agent_id: string; payload: Record<string, unknown> }> {
  const { metrics } = tick;
  const lifecycleEntries = Object.entries(metrics.lifecycleDistrib);

  return agentPositions.map(({ agent_id, index }) => {
    // Deterministic pseudo-random from agent index + tick
    const seed  = (index * 2654435761 + metrics.tick * 40503) >>> 0;
    const rng01 = ((seed ^ (seed >>> 16)) * 0x45d9f3b >>> 0) / 0xffffffff;

    // γ: normal-ish spread around median
    const sigma = (metrics.p90Gamma - metrics.medianGamma) / 1.28; // ≈ σ from p90
    const gamma = Math.max(0, Math.min(1, metrics.medianGamma + (rng01 - 0.5) * 2.5 * sigma));

    // lifecycle: sample by cumulative proportion
    let cumulative = 0;
    const rng2 = ((seed ^ (seed >>> 8)) * 0x9e3779b9 >>> 0) / 0xffffffff;
    let lifecycle = lifecycleEntries[0]?.[0] ?? 'init';
    for (const [lc, frac] of lifecycleEntries) {
      cumulative += frac;
      if (rng2 <= cumulative) { lifecycle = lc; break; }
    }

    return {
      agent_id,
      payload: {
        gamma,
        lifecycle,
        totalLoss: metrics.meanTotalLoss,
        diversity: metrics.meanDiversity,
      },
    };
  });
}
