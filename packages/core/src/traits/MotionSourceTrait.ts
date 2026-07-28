/**
 * MotionSource Trait (@motion_source)
 *
 * Declares WHERE an embodied agent's body motion comes from and routes it into
 * the existing animation pipeline. This is the "embodied motion" seam.
 *
 * An AvatarEmbodiment agent (@avatar_embodiment) exposes a `currentAnimation`
 * field, and @animation (AnimationTrait) can play / blend clips — but nothing
 * decides *which* motion to play or *where* the clips come from. @motion_source
 * fills exactly that gap. It does NOT re-implement clip playback (that is
 * AnimationTrait) or skeleton retargeting (that is MixamoIntegration / the asset
 * pipeline). It WIRES them: it resolves a high-level motion intent ("idle",
 * "wave", "walk") to a clip from a motion catalog/library, drives the node's
 * AnimationTrait (crossfade / play / blend parameter), and mirrors the active
 * motion onto the AvatarEmbodiment state so the rest of the avatar pipeline
 * stays in sync.
 *
 * Sources (`kind`):
 *  - "library"      — named motion library (e.g. mixamo / motionbricks); intents
 *                     map to catalog clips, optionally retargeted to the skeleton
 *                     (see {@link MotionRetargetConfig}; the asset pipeline /
 *                     MixamoIntegration consumes the retarget descriptor).
 *  - "mocap"        — live tracking stream drives motion (BodyTracking host).
 *  - "procedural"   — parametric locomotion: a `speed` value selects idle/walk/run.
 *  - "agent_intent" — the agent's high-level intent string is resolved against the
 *                     catalog, so an AI-driven NPC moves by deciding *what* to do.
 *
 * @example
 * ```hsplus
 * object "AgentBody" {
 *   @avatar_embodiment { tracking_source: "ai", ik_mode: "full_body" }
 *   @animation { }
 *   @motion_source {
 *     kind: "library",
 *     library: "mixamo",
 *     default_motion: "idle",
 *     blend: 0.25,
 *     catalog: {
 *       idle: { asset: "idle.fbx", loop: true },
 *       wave: { asset: "wave.fbx", loop: false, duration: 1.2 },
 *       walk: { asset: "walk.fbx", loop: true }
 *     },
 *     retarget: { skeleton: "mixamo", scale: 1.0 }
 *   }
 * }
 * ```
 *
 * @version 1.0.0
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

/** Where an embodied agent's body motion originates. */
export type MotionSourceKind = 'library' | 'mocap' | 'procedural' | 'agent_intent';

/** A single motion catalog entry. A bare string is shorthand for `{ asset }`. */
export interface MotionClipDef {
  /** Asset path / id of the motion clip (e.g. "walk.fbx"). */
  asset: string;
  /** Clip duration in seconds (default 1.0). */
  duration?: number;
  /** Loop the clip (default true — most locomotion/idle motions loop). */
  loop?: boolean;
  /** Default playback speed multiplier. */
  speed?: number;
}

/** Intent -> clip mapping. Intent names double as AnimationTrait clip/state names. */
export type MotionCatalog = Record<string, string | MotionClipDef>;

/**
 * Skeleton retargeting descriptor. This is a declarative passthrough consumed by
 * the asset pipeline / MixamoIntegration — @motion_source does not perform the
 * retarget itself (that would pull a network/asset dependency into the runtime
 * trait), it carries the intent so the library clips land on the right rig.
 */
export interface MotionRetargetConfig {
  /** Target skeleton / rig family, e.g. "mixamo", "vrm", "humanoid". */
  skeleton?: string;
  /** Uniform scale applied during retarget. */
  scale?: number;
  /** Named retarget preset (see MixamoPresetMapper / CharacterTemplateRegistry). */
  preset?: string;
}

/** Procedural locomotion config: a speed value selects a gait clip. */
export interface ProceduralMotionConfig {
  /** AnimationTrait blend parameter to feed the raw speed into (default "speed"). */
  speed_param?: string;
  /** Speed thresholds (units/sec) at which to switch gait. */
  thresholds?: { walk: number; run: number };
  /** Catalog intents to use for each gait band. */
  clips?: { idle: string; walk: string; run: string };
}

/** @motion_source configuration. */
export interface MotionSourceConfig {
  /** Motion source kind (default "library"). */
  kind?: MotionSourceKind;
  /** Named motion library, e.g. "mixamo" / "motionbricks". */
  library?: string;
  /** Intent -> clip catalog. */
  catalog?: MotionCatalog;
  /** Skeleton retargeting descriptor. */
  retarget?: MotionRetargetConfig;
  /** Motion played on attach (default "idle"). */
  default_motion?: string;
  /** Crossfade duration in seconds when switching motion (default 0.25). */
  blend?: number;
  /** Procedural re-evaluation rate in Hz (default 30). */
  frequency?: number;
  /** Procedural locomotion config (used when kind === "procedural"). */
  procedural?: ProceduralMotionConfig;
  /** Auto-play the default motion on attach (default true). */
  autoplay?: boolean;
}

/** Runtime state stored on the node. */
interface MotionSourceState {
  kind: MotionSourceKind;
  currentMotion: string;
  /** Latest speed signal (driven by the `motion_speed` event), units/sec. */
  speed: number;
  /** Accumulator for procedural re-eval throttling. */
  elapsed: number;
  /** Whether the most recent motion was actually applied to an AnimationTrait. */
  applied: boolean;
  /** Whether the catalog has been registered into the AnimationTrait yet. */
  registered: boolean;
  /** Available intent names. */
  catalogKeys: string[];
}

/**
 * Structural view of the AnimationTrait instance stored on `node.__animation_instance`.
 * Declared structurally (not imported) to keep @motion_source decoupled from the
 * concrete AnimationTrait class while still driving its real public API.
 */
interface AnimationDriverLike {
  addClip?: (clip: {
    name: string;
    asset?: string;
    duration: number;
    wrapMode?: string;
    speed?: number;
  }) => void;
  addState?: (state: { name: string; clip?: string }) => void;
  crossfade?: (stateName: string, duration?: number, layer?: number) => boolean;
  play?: (clipName: string, layer?: number) => boolean;
  setState?: (stateName: string, layer?: number) => boolean;
  setFloat?: (name: string, value: number) => void;
  getCurrentClip?: (layer?: number) => string | undefined;
  getCurrentState?: (layer?: number) => string | undefined;
  stop?: (layer?: number) => void;
}

// =============================================================================
// HELPERS
// =============================================================================

function normalizeClip(def: string | MotionClipDef): MotionClipDef {
  return typeof def === 'string' ? { asset: def } : def;
}

function getDriver(node: HSPlusNode): AnimationDriverLike | undefined {
  return node.__animation_instance as AnimationDriverLike | undefined;
}

function getState(node: HSPlusNode): MotionSourceState | undefined {
  return node.__motionSourceState as MotionSourceState | undefined;
}

/**
 * Register the motion catalog into the node's AnimationTrait as clips + 1-clip
 * states, so crossfade(intent) resolves. Idempotent: runs once per node, but
 * tolerates the AnimationTrait attaching AFTER @motion_source (lazy via state.registered).
 */
function registerCatalog(node: HSPlusNode, config: MotionSourceConfig): boolean {
  const state = getState(node);
  const driver = getDriver(node);
  if (!state || !driver || state.registered) return state?.registered ?? false;

  const catalog = config.catalog ?? {};
  for (const [intent, raw] of Object.entries(catalog)) {
    const def = normalizeClip(raw);
    driver.addClip?.({
      name: intent,
      asset: def.asset,
      duration: def.duration ?? 1.0,
      wrapMode: def.loop === false ? 'once' : 'loop',
      speed: def.speed,
    });
    driver.addState?.({ name: intent, clip: intent });
  }
  state.registered = true;
  return true;
}

/** Apply a motion intent: drive the AnimationTrait and mirror onto the avatar pipeline. */
function applyMotion(
  node: HSPlusNode,
  config: MotionSourceConfig,
  context: TraitContext,
  intent: string
): void {
  const state = getState(node);
  if (!state) return;

  registerCatalog(node, config);
  const driver = getDriver(node);
  const blend = config.blend ?? 0;

  let applied = false;
  if (driver) {
    if (blend > 0 && typeof driver.crossfade === 'function') {
      applied = driver.crossfade(intent, blend) === true;
    }
    if (!applied && typeof driver.play === 'function') {
      applied = driver.play(intent) === true;
    }
    if (!applied && typeof driver.setState === 'function') {
      applied = driver.setState(intent) === true;
    }
  }

  state.currentMotion = intent;
  state.applied = applied;

  // Mirror onto the AvatarEmbodiment pipeline so lip-sync/emotion stay in sync.
  const emb = node.__avatarEmbodimentState as { currentAnimation?: string } | undefined;
  if (emb) emb.currentAnimation = intent;

  context.emit('on_motion_changed', { node, motion: intent, applied });
}

/** Choose a gait intent from the current speed. */
function selectGait(
  speed: number,
  thresholds: { walk: number; run: number },
  clips: { idle: string; walk: string; run: string }
): string {
  if (speed >= thresholds.run) return clips.run;
  if (speed >= thresholds.walk) return clips.walk;
  return clips.idle;
}

// =============================================================================
// HANDLER
// =============================================================================

export const motionSourceHandler: TraitHandler<MotionSourceConfig> = {
  name: 'motion_source',

  defaultConfig: {
    kind: 'library',
    blend: 0.25,
    frequency: 30,
    default_motion: 'idle',
    autoplay: true,
  } as MotionSourceConfig,

  onAttach(node: HSPlusNode, config: MotionSourceConfig, context: TraitContext): void {
    const catalog = config.catalog ?? {};
    const state: MotionSourceState = {
      kind: config.kind ?? 'library',
      currentMotion: config.default_motion ?? 'idle',
      speed: 0,
      elapsed: 0,
      applied: false,
      registered: false,
      catalogKeys: Object.keys(catalog),
    };
    node.__motionSourceState = state;

    registerCatalog(node, config);

    if (config.autoplay !== false && state.currentMotion) {
      applyMotion(node, config, context, state.currentMotion);
    }

    context.emit('on_motion_source_ready', {
      node,
      kind: state.kind,
      library: config.library,
      motions: state.catalogKeys,
    });
  },

  onDetach(node: HSPlusNode): void {
    delete node.__motionSourceState;
  },

  onUpdate(
    node: HSPlusNode,
    config: MotionSourceConfig,
    context: TraitContext,
    delta: number
  ): void {
    const state = getState(node);
    if (!state) return;
    if ((config.kind ?? 'library') !== 'procedural') return;

    // Throttle procedural re-evaluation to the configured frequency.
    state.elapsed += delta;
    const interval = 1 / (config.frequency ?? 30);
    if (state.elapsed < interval) return;
    state.elapsed = 0;

    const proc = config.procedural ?? {};
    const thresholds = proc.thresholds ?? { walk: 0.1, run: 3.0 };
    const clips = proc.clips ?? {
      idle: config.default_motion ?? 'idle',
      walk: 'walk',
      run: 'run',
    };

    // Feed the raw speed into the AnimationTrait blend parameter for blend trees.
    getDriver(node)?.setFloat?.(proc.speed_param ?? 'speed', state.speed);

    const gait = selectGait(state.speed, thresholds, clips);
    if (gait !== state.currentMotion) {
      applyMotion(node, config, context, gait);
    }
  },

  onEvent(
    node: HSPlusNode,
    config: MotionSourceConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = getState(node);
    if (!state) return;

    const type = typeof event === 'string' ? event : event.type;
    const payload = (event && typeof event === 'object' ? (event.payload ?? event) : {}) as Record<
      string,
      unknown
    >;

    if (type === 'motion_request') {
      const intent = (payload.intent ?? payload.motion ?? payload.clip) as string | undefined;
      if (intent) applyMotion(node, config, context, intent);
    } else if (type === 'motion_speed') {
      const speed = Number(payload.speed ?? 0);
      if (!Number.isNaN(speed)) state.speed = speed;
    } else if (type === 'motion_stop') {
      getDriver(node)?.stop?.();
      state.applied = false;
      context.emit('on_motion_stopped', { node });
    }
  },
};

export default motionSourceHandler;
