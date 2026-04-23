/**
 * UI command executors — extracted from HoloScriptRuntime (W1-T4 slice 18)
 *
 * Seven imperative UI commands dispatched by the generic-node
 * executor: show / hide / create / animate / pulse / move / delete.
 * Each touches spatial memory + (optionally) particle effects and
 * animations.
 *
 * All seven return `Promise<Record<string, unknown>>` (not the
 * broader ExecutionResult) because they flow through the generic-
 * node path in HSR rather than the top-level executeNode result.
 *
 * **Pattern**: state-container context with delegated particle
 * helpers (pattern 5). `createParticleEffect` and
 * `createConnectionStream` are passed as callbacks so the UI
 * executors can reuse the slice-4 implementations without
 * knowing the security-limit threading.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 18 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 1761-1955)
 *         packages/core/src/runtime/particle-effects.ts (slice 4)
 */

import { logger } from '../logger';
import type {
  ASTNode,
  Animation,
  HologramProperties,
  HologramShape,
  SpatialPosition,
} from '../types';

/** Context threaded in by the runtime — state + particle callbacks. */
export interface UICommandContext {
  /** Spatial position memory for named targets. */
  spatialMemory: Map<string, SpatialPosition>;
  /** Active animations registry. */
  animations: Map<string, Animation>;
  /** Particle-effect creator (HSR wrapper that threads the Map + security limit). */
  createParticleEffect: (name: string, position: SpatialPosition, color: string, count: number) => void;
  /** Connection-stream creator (HSR wrapper). */
  createConnectionStream: (
    from: string,
    to: string,
    fromPos: SpatialPosition,
    toPos: SpatialPosition,
    dataType: string,
  ) => void;
}

// ──────────────────────────────────────────────────────────────────
// Default hologram / animation parameters — named consts so magic
// numbers become named concepts.
// ──────────────────────────────────────────────────────────────────

const SHOW_PARTICLE_COUNT = 15;
const HIDE_PARTICLE_COUNT = 10;
const CREATE_PARTICLE_COUNT = 20;
const PULSE_PARTICLE_COUNT = 30;
const DELETE_PARTICLE_COUNT = 15;

const HIDE_COLOR = '#ff0000';
const DELETE_COLOR = '#ff0000';
const PULSE_COLOR = '#ffff00';

const DEFAULT_SHOW_HOLOGRAM: HologramProperties = {
  shape: 'orb',
  color: '#00ffff',
  size: 0.8,
  glow: true,
  interactive: true,
};

const DEFAULT_CREATE_COLOR = '#00ffff';
const DEFAULT_CREATE_SIZE = 1;

const DEFAULT_ANIMATE_PROPERTY = 'position[1]';
const DEFAULT_ANIMATE_DURATION_MS = 1000;
const DEFAULT_PULSE_DURATION_MS = 500;
const PULSE_SCALE_FROM = 1;
const PULSE_SCALE_TO = 1.5;

// ──────────────────────────────────────────────────────────────────
// Commands
// ──────────────────────────────────────────────────────────────────

/** Execute `show <target>`. */
export async function executeShowCommand(
  target: string,
  node: ASTNode & { position?: SpatialPosition; hologram?: HologramProperties },
  ctx: UICommandContext,
): Promise<Record<string, unknown>> {
  const hologram = node.hologram || DEFAULT_SHOW_HOLOGRAM;
  const position = node.position || ([0, 0, 0] as SpatialPosition);
  ctx.spatialMemory.set(target, position);
  ctx.createParticleEffect(`${target}_show`, position, hologram.color, SHOW_PARTICLE_COUNT);

  logger.info('Show command executed', { target, position });

  return { showed: target, hologram, position };
}

/** Execute `hide <target>`. */
export async function executeHideCommand(
  target: string,
  _node: ASTNode,
  ctx: UICommandContext,
): Promise<Record<string, unknown>> {
  const position = ctx.spatialMemory.get(target) || ([0, 0, 0] as SpatialPosition);
  ctx.createParticleEffect(`${target}_hide`, position, HIDE_COLOR, HIDE_PARTICLE_COUNT);

  logger.info('Hide command executed', { target });

  return { hidden: target };
}

/** Execute `create <shape> <name>`. */
export async function executeCreateCommand(
  tokens: string[],
  node: ASTNode & { position?: SpatialPosition; hologram?: HologramProperties },
  ctx: UICommandContext,
): Promise<Record<string, unknown>> {
  if (tokens.length < 2) {
    return { error: 'Create command requires shape and name' };
  }

  const shape = tokens[0];
  const name = tokens[1];
  const position = node.position || ([0, 0, 0] as SpatialPosition);

  const hologram: HologramProperties = {
    shape: shape as HologramShape,
    color: node.hologram?.color || DEFAULT_CREATE_COLOR,
    size: node.hologram?.size || DEFAULT_CREATE_SIZE,
    glow: node.hologram?.glow !== false,
    interactive: node.hologram?.interactive !== false,
  };

  ctx.spatialMemory.set(name, position);
  ctx.createParticleEffect(`${name}_create`, position, hologram.color, CREATE_PARTICLE_COUNT);

  logger.info('Create command executed', { shape, name, position });

  return { created: name, shape, hologram, position };
}

/** Execute `animate <target> <property> <duration>`. */
export async function executeAnimateCommand(
  target: string,
  tokens: string[],
  _node: ASTNode,
  ctx: UICommandContext,
): Promise<Record<string, unknown>> {
  const property = tokens[0] || DEFAULT_ANIMATE_PROPERTY;
  const duration = parseInt(tokens[1] || String(DEFAULT_ANIMATE_DURATION_MS), 10);

  const animation: Animation = {
    target,
    property,
    from: 0,
    to: 1,
    duration,
    startTime: Date.now(),
    easing: 'ease-in-out',
  };

  ctx.animations.set(`${target}_${property}`, animation);

  logger.info('Animate command executed', { target, property, duration });

  return { animating: target, animation };
}

/** Execute `pulse <target> <duration>` (yoyo + loop scale animation). */
export async function executePulseCommand(
  target: string,
  tokens: string[],
  _node: ASTNode,
  ctx: UICommandContext,
): Promise<Record<string, unknown>> {
  const duration = parseInt(tokens[0] || String(DEFAULT_PULSE_DURATION_MS), 10);
  const position = ctx.spatialMemory.get(target) || ([0, 0, 0] as SpatialPosition);

  ctx.createParticleEffect(`${target}_pulse`, position, PULSE_COLOR, PULSE_PARTICLE_COUNT);

  const animation: Animation = {
    target,
    property: 'scale',
    from: PULSE_SCALE_FROM,
    to: PULSE_SCALE_TO,
    duration,
    startTime: Date.now(),
    easing: 'sine',
    yoyo: true,
    loop: true,
  };

  ctx.animations.set(`${target}_pulse`, animation);

  logger.info('Pulse command executed', { target, duration });

  return { pulsing: target, duration };
}

/** Execute `move <target> <x> <y> <z>`. Creates a connection stream if target existed. */
export async function executeMoveCommand(
  target: string,
  tokens: string[],
  _node: ASTNode,
  ctx: UICommandContext,
): Promise<Record<string, unknown>> {
  const x = parseFloat(tokens[0] || '0');
  const y = parseFloat(tokens[1] || '0');
  const z = parseFloat(tokens[2] || '0');
  const position: SpatialPosition = [x, y, z];

  const current = ctx.spatialMemory.get(target);
  if (current) {
    ctx.spatialMemory.set(target, position);
    ctx.createConnectionStream(target, `${target}_move`, current, position, 'movement');
  } else {
    ctx.spatialMemory.set(target, position);
  }

  logger.info('Move command executed', { target, position });

  return { moved: target, to: position };
}

/** Execute `delete <target>`. */
export async function executeDeleteCommand(
  target: string,
  _node: ASTNode,
  ctx: UICommandContext,
): Promise<Record<string, unknown>> {
  const position = ctx.spatialMemory.get(target);
  if (position) {
    ctx.createParticleEffect(`${target}_delete`, position, DELETE_COLOR, DELETE_PARTICLE_COUNT);
    ctx.spatialMemory.delete(target);
  }

  logger.info('Delete command executed', { target });

  return { deleted: target };
}
