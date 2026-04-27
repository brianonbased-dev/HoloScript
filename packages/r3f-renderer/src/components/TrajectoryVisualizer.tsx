/**
 * TrajectoryVisualizer — predictive locomotion path bar.
 *
 * Subscribes to `state.locomotion.trajectory` from NeuralAnimationTrait
 * (idea-run-3 WIRE-3) and renders the predicted path as a polyline on the
 * floor. Color interpolates orange (near future) → green (far future) so
 * the user can read trajectory uncertainty at a glance — same visual idiom
 * as the AI4Animation reference port (Holden 2017).
 *
 * Consumer pattern:
 *   const trajectory = useTraitState(node, 'neural_animation', s => s.locomotion?.trajectory);
 *   <TrajectoryVisualizer trajectory={trajectory ?? []} origin={node.position} />
 *
 * The trait emits a 12-frame trajectory at 1/30s horizon (default). The
 * visualizer is shape-agnostic: pass any `Array<[number,number,number]>`.
 *
 * Pure presentation — no trait wiring lives here. The HoloScript scene-runner
 * (or app code) is responsible for subscribing to trait state and passing
 * the trajectory prop. Keeps this component testable without a trait runtime.
 */

import { useMemo, useRef } from 'react';
import * as THREE from 'three';

export interface TrajectoryVisualizerProps {
  /**
   * Sequence of (x, y, z) positions in world-space relative to `origin`.
   * Each point is the predicted root-bone position at frame N of the horizon.
   * Empty array → renders nothing (component is a no-op).
   */
  trajectory: Array<[number, number, number]>;
  /**
   * World-space anchor for the trajectory. The first trajectory point is
   * drawn at `origin + trajectory[0]`. Defaults to world origin.
   */
  origin?: [number, number, number];
  /**
   * Hex color for the near-future end of the gradient. Default = orange (#ff9933).
   */
  nearColor?: number;
  /**
   * Hex color for the far-future end of the gradient. Default = green (#33dd66).
   */
  farColor?: number;
  /**
   * Y-offset added to all points (lifts the path off the floor for visibility).
   * Default = 0.02 (2cm above the floor plane).
   */
  floorOffset?: number;
  /**
   * Line width. Note: WebGL native lines render at 1px regardless on most
   * platforms — for thicker lines use `@react-three/drei` Line component.
   * Default = 2.
   */
  lineWidth?: number;
  /** Whether the visualizer is rendered. Default true. */
  visible?: boolean;
}

/**
 * Build vertex colors interpolating from nearColor to farColor across N points.
 * Exported so tests can verify the gradient without rendering.
 */
export function buildGradientColors(
  count: number,
  nearColor: number,
  farColor: number
): Float32Array {
  const colors = new Float32Array(count * 3);
  const near = new THREE.Color(nearColor);
  const far = new THREE.Color(farColor);
  if (count === 0) return colors;
  if (count === 1) {
    colors[0] = near.r;
    colors[1] = near.g;
    colors[2] = near.b;
    return colors;
  }
  const tmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    tmp.copy(near).lerp(far, t);
    colors[i * 3 + 0] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  return colors;
}

/**
 * Build the position buffer from trajectory + origin + floorOffset.
 * Exported so tests can verify positioning without rendering.
 */
export function buildPositionBuffer(
  trajectory: Array<[number, number, number]>,
  origin: [number, number, number],
  floorOffset: number
): Float32Array {
  const positions = new Float32Array(trajectory.length * 3);
  for (let i = 0; i < trajectory.length; i++) {
    const p = trajectory[i];
    positions[i * 3 + 0] = origin[0] + p[0];
    positions[i * 3 + 1] = origin[1] + p[1] + floorOffset;
    positions[i * 3 + 2] = origin[2] + p[2];
  }
  return positions;
}

export function TrajectoryVisualizer({
  trajectory,
  origin = [0, 0, 0],
  nearColor = 0xff9933,
  farColor = 0x33dd66,
  floorOffset = 0.02,
  lineWidth = 2,
  visible = true,
}: TrajectoryVisualizerProps): JSX.Element | null {
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);

  const { positions, colors } = useMemo(() => {
    return {
      positions: buildPositionBuffer(trajectory, origin, floorOffset),
      colors: buildGradientColors(trajectory.length, nearColor, farColor),
    };
  }, [trajectory, origin, floorOffset, nearColor, farColor]);

  if (!visible || trajectory.length < 2) return null;

  return (
    <line>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={trajectory.length}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
          count={trajectory.length}
        />
      </bufferGeometry>
      <lineBasicMaterial vertexColors linewidth={lineWidth} />
    </line>
  );
}
