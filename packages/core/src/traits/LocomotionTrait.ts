/**
 * LocomotionTrait — real per-frame movement integration for HoloScript entities.
 *
 * This is the runtime that the `move` statement (MovementStatementNode) and the
 * `@locomotion(...)` trait compile to. It is the canonical implementation of the
 * always-add-VR-locomotion requirement (F.118): left-stick glide, right-stick
 * snap-turn, and teleport, driven from a single `@locomotion` declaration and a
 * WebXR offset reference space.
 *
 * Design follows the PatrolTrait idiom exactly: per-frame integration reads
 * `node.position` (a [x,y,z] triple) and emits `set_position` / `set_rotation`
 * events rather than mutating the node directly (so networked sync + CRDT
 * tracking still see the change). State lives on `node.__locomotionState`.
 *
 * Movement commands arrive via `onEvent`:
 *   - `locomotion:set_mode`        — switch mode (glide/walk/fly/teleport/…)
 *   - `locomotion:input`           — left-stick glide axes {x, z} in [-1, 1]
 *   - `locomotion:snap_turn`       — right-stick snap (F.118), {direction: ±1}
 *   - `locomotion:teleport_request`— teleport arc landed, {target: [x,y,z]}
 *   - `locomotion:move`            — direct wiring from MovementStatementNode
 *   - `bt_action` / `action:*`     — BehaviorTree bridge (glide/walk/fly/stop)
 *
 * @module traits/locomotion
 */

import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import type { LocomotionMode } from './locomotion/LocomotionActions';

type Vec3 = [number, number, number];

/** Authoring config for `@locomotion(...)`. snake_case to match the trait DSL. */
export interface LocomotionConfig {
  mode: LocomotionMode;
  /** Base movement speed in metres/second. */
  speed: number;
  /** Factor applied to speed when mode === 'run'. */
  run_multiplier: number;
  /** Apply downward gravity acceleration when not flying/swimming. */
  gravity: boolean;
  gravity_strength: number;
  /** Target height above ground for fly mode (metres). */
  fly_height: number;
  /** Y offset below the water surface for swim mode. */
  swim_depth: number;
  /** Ordered waypoints for path mode — each [x, y, z]. */
  path_waypoints: Vec3[];
  path_loop: boolean;
  /** Entity id to orbit, with radius (m) and angular speed (rad/s). */
  orbit_target: string | null;
  orbit_radius: number;
  orbit_speed: number;
  /** Entity id to follow, stopping at follow_distance (m). */
  follow_target: string | null;
  follow_distance: number;
  // ── VR locomotion (F.118) ──────────────────────────────────────────────────
  /** Which hand's stick drives glide. */
  vr_glide_hand: 'left' | 'right';
  /** Snap-turn step in degrees (0 = smooth turning). */
  snap_turn_angle: number;
  /** Seconds to lock out repeat snap-turns. */
  snap_turn_cooldown: number;
  /** Milliseconds of teleport fade. */
  teleport_fade_ms: number;
}

interface LocomotionState {
  mode: LocomotionMode;
  /** Current world position [x, y, z] — authoritative integration accumulator. */
  position: Vec3;
  /** Per-frame velocity [x, y, z] set by glide/input and integrated each frame. */
  velocity: Vec3;
  /** Accumulated yaw (radians) from snap/smooth turning. */
  yaw: number;
  orbitAngle: number;
  pathIndex: number;
  isGrounded: boolean;
  snapCooldown: number;
  teleportTarget: Vec3 | null;
}

const DEFAULT_CONFIG: LocomotionConfig = {
  mode: 'walk',
  speed: 2,
  run_multiplier: 2,
  gravity: true,
  gravity_strength: 9.8,
  fly_height: 2,
  swim_depth: 0.5,
  path_waypoints: [],
  path_loop: true,
  orbit_target: null,
  orbit_radius: 3,
  orbit_speed: 0.5,
  follow_target: null,
  follow_distance: 1.5,
  vr_glide_hand: 'left',
  snap_turn_angle: 45,
  snap_turn_cooldown: 0.3,
  teleport_fade_ms: 200,
};

function dist3(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0],
    dy = a[1] - b[1],
    dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export const locomotionHandler: TraitHandler<LocomotionConfig> = {
  name: 'locomotion',

  defaultConfig: DEFAULT_CONFIG,

  onAttach(node: HSPlusNode, config: LocomotionConfig, context: TraitContext): void {
    const pos = (node.position ?? [0, 0, 0]) as Vec3;
    const state: LocomotionState = {
      mode: config.mode ?? DEFAULT_CONFIG.mode,
      position: [pos[0], pos[1], pos[2]],
      velocity: [0, 0, 0],
      yaw: 0,
      orbitAngle: 0,
      pathIndex: 0,
      isGrounded: true,
      snapCooldown: 0,
      teleportTarget: null,
    };
    node.__locomotionState = state;
    context.emit?.('locomotion:attached', { node, mode: state.mode });
  },

  onDetach(node: HSPlusNode, _config: LocomotionConfig, context: TraitContext): void {
    context.emit?.('locomotion:detached', { node });
    delete node.__locomotionState;
  },

  onUpdate(node: HSPlusNode, config: LocomotionConfig, context: TraitContext, delta: number): void {
    const state = node.__locomotionState as LocomotionState | undefined;
    if (!state || delta <= 0) return;

    const pos = state.position;
    const mode = state.mode;
    const speed = mode === 'run' ? config.speed * (config.run_multiplier ?? 2) : config.speed;
    let vx = 0,
      vy = 0,
      vz = 0;

    if (state.snapCooldown > 0) state.snapCooldown -= delta;

    if (mode === 'glide' || mode === 'walk' || mode === 'run') {
      // Camera-relative glide: rotate stick velocity by accumulated/headset yaw.
      const yaw = context.vr?.headset?.rotation ? context.vr.headset.rotation[1] : state.yaw;
      const cy = Math.cos(yaw),
        sy = Math.sin(yaw);
      vx = state.velocity[0] * cy - state.velocity[2] * sy;
      vz = state.velocity[0] * sy + state.velocity[2] * cy;
      if (config.gravity && !state.isGrounded) {
        state.velocity[1] -= config.gravity_strength * delta;
        vy = state.velocity[1];
      }
    } else if (mode === 'fly') {
      vx = state.velocity[0];
      vz = state.velocity[2];
      const hit = context.physics?.raycast?.(pos, [0, -1, 0], 50);
      const groundY = hit ? hit.point[1] : 0;
      vy = lerp(0, (groundY + config.fly_height - pos[1]) * 3, clamp(delta * 4, 0, 1));
    } else if (mode === 'swim') {
      vx = state.velocity[0];
      vz = state.velocity[2];
      vy = clamp((-config.swim_depth - pos[1]) * 2, -speed * 0.5, speed * 0.5);
    } else if (mode === 'teleport') {
      if (state.teleportTarget) {
        state.position = [...state.teleportTarget];
        state.teleportTarget = null;
        context.emit?.('locomotion:teleported', { node, position: [...state.position] });
        return;
      }
    } else if (mode === 'path' && config.path_waypoints.length > 0) {
      const wp = config.path_waypoints[state.pathIndex];
      const d = dist3(pos, wp);
      if (d > 0.05) {
        const step = (speed * delta) / d;
        vx = ((wp[0] - pos[0]) * step) / delta;
        vy = ((wp[1] - pos[1]) * step) / delta;
        vz = ((wp[2] - pos[2]) * step) / delta;
      } else {
        state.pathIndex = config.path_loop
          ? (state.pathIndex + 1) % config.path_waypoints.length
          : Math.min(state.pathIndex + 1, config.path_waypoints.length - 1);
        context.emit?.('locomotion:waypoint_reached', { node, index: state.pathIndex });
      }
    } else if (mode === 'orbit' && config.orbit_target) {
      state.orbitAngle += config.orbit_speed * delta;
      const t = context.physics?.getBodyPosition?.(config.orbit_target) ?? pos;
      const tx = t[0] + Math.cos(state.orbitAngle) * config.orbit_radius;
      const tz = t[2] + Math.sin(state.orbitAngle) * config.orbit_radius;
      vx = (tx - pos[0]) / delta;
      vz = (tz - pos[2]) / delta;
    } else if (mode === 'follow' && config.follow_target) {
      const t = context.physics?.getBodyPosition?.(config.follow_target);
      if (t) {
        const d = dist3(pos, t);
        if (d > config.follow_distance) {
          const r = speed / d;
          vx = (t[0] - pos[0]) * r;
          vy = (t[1] - pos[1]) * r;
          vz = (t[2] - pos[2]) * r;
        }
      }
    }

    if (vx !== 0 || vy !== 0 || vz !== 0) {
      state.position = [pos[0] + vx * delta, pos[1] + vy * delta, pos[2] + vz * delta];
      context.emit?.('set_position', { node, position: [...state.position] });

      // Ground check + haptic footstep (VR, F.118)
      const ground = context.physics?.raycast?.(state.position, [0, -1, 0], 0.2);
      state.isGrounded = ground !== null && ground !== undefined;
      if (state.isGrounded && (Math.abs(vx) > 0.1 || Math.abs(vz) > 0.1)) {
        context.haptics?.pulse?.(config.vr_glide_hand ?? 'left', 0.05, 30);
      }
    }
  },

  onEvent(
    node: HSPlusNode,
    config: LocomotionConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__locomotionState as LocomotionState | undefined;
    if (!state) return;
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const read = <T>(k: string): T | undefined => (event[k] ?? payload[k]) as T | undefined;

    switch (event.type) {
      case 'locomotion:set_mode': {
        const m = read<LocomotionMode>('mode');
        if (m) {
          state.mode = m;
          state.velocity = [0, 0, 0];
        }
        break;
      }
      case 'locomotion:input': {
        // Left-stick glide axes in [-1, 1].
        const ix = read<number>('x') ?? 0;
        const iz = read<number>('z') ?? 0;
        const spd =
          state.mode === 'run' ? config.speed * (config.run_multiplier ?? 2) : config.speed;
        state.velocity[0] = ix * spd;
        state.velocity[2] = iz * spd;
        break;
      }
      case 'locomotion:snap_turn': {
        if (state.snapCooldown <= 0) {
          const dir = read<number>('direction') ?? 1;
          state.yaw += (((config.snap_turn_angle ?? 45) * Math.PI) / 180) * (dir < 0 ? -1 : 1);
          state.snapCooldown = config.snap_turn_cooldown ?? 0.3;
          context.emit?.('set_rotation', { node, rotation: [0, state.yaw, 0] });
          context.haptics?.pulse?.('right', 0.1, 20);
        }
        break;
      }
      case 'locomotion:teleport_request': {
        const target = read<Vec3>('target');
        if (target) {
          state.teleportTarget = [target[0], target[1], target[2]];
          state.mode = 'teleport';
          context.emit?.('locomotion:teleport_fade_start', {
            node,
            durationMs: config.teleport_fade_ms ?? 200,
          });
        }
        break;
      }
      case 'locomotion:move': {
        // Direct wiring from a compiled MovementStatementNode.
        const dest = read<Vec3 | string>('destination');
        const modeOverride = read<LocomotionMode>('mode');
        if (modeOverride) state.mode = modeOverride;
        if (Array.isArray(dest)) {
          if (state.mode === 'teleport') {
            state.teleportTarget = [dest[0], dest[1], dest[2]];
          } else {
            config.path_waypoints = [[dest[0], dest[1], dest[2]]];
            state.pathIndex = 0;
            if (state.mode !== 'path' && state.mode !== 'orbit') state.mode = 'path';
          }
        } else if (typeof dest === 'string') {
          config.follow_target = dest;
          state.mode = 'follow';
        }
        break;
      }
      default: {
        if (event.type === 'bt_action' || event.type.startsWith('action:')) {
          const actionName = (read<string>('action') ??
            event.type.replace('action:', '')) as string;
          const requestId = read<string>('requestId');
          let handled = true;
          if (['glide', 'walk', 'run', 'fly', 'swim', 'teleport'].includes(actionName)) {
            state.mode = actionName as LocomotionMode;
          } else if (actionName === 'stop') {
            state.velocity = [0, 0, 0];
          } else {
            handled = false;
          }
          if (requestId) {
            context.emit?.('action:result', { requestId, status: handled ? 'success' : 'failure' });
          }
        }
        break;
      }
    }
  },
};

export default locomotionHandler;
