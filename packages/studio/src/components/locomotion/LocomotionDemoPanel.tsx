'use client';

/**
 * LocomotionDemoPanel — Studio live preview of NeuralAnimationTrait locomotion.
 *
 * Three responsibilities:
 * 1. Show a capsule "agent" node annotated with @trait(neural_animation)
 *    with its current velocity + gait label.
 * 2. Render a 2-D overhead SVG trajectory preview that mirrors the
 *    TrajectoryVisualizer data contract (trajectory: Array<[x,y,z]>).
 * 3. Provide a draggable target puck — dragging it calls onTargetChange(pos)
 *    so callers can feed the new target into the neural_animation trait or
 *    a demo emitter via emitTraitStateUpdate().
 *
 * The panel subscribes to trait state via useTraitState() so it updates in
 * real-time whenever the engine (or a test harness) calls emitTraitStateUpdate().
 *
 * Data flow (demo mode — no live engine required):
 *   emitTraitStateUpdate(nodeId, 'neural_animation', {
 *     locomotion: {
 *       trajectory: [[0,0,0],[1,0,0],...],
 *       speed: 2.4,
 *       gait: 'walk',
 *     }
 *   })
 *   → useTraitState subscription fires
 *   → panel re-renders with updated trajectory + HUD
 */

import { useCallback, useRef, useState } from 'react';
import { useTraitState } from '@/hooks/useTraitState';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocomotionState {
  trajectory?: Array<[number, number, number]>;
  speed?: number;
  gait?: string;
  confidence?: number;
}

export interface TargetPosition {
  x: number;
  z: number;
}

export interface LocomotionDemoPanelProps {
  /** Scene node ID that carries the neural_animation trait. */
  nodeId?: string;
  /** Initial target position in world-space XZ. */
  initialTarget?: TargetPosition;
  /** Called when the user drags the target puck to a new position. */
  onTargetChange?: (pos: TargetPosition) => void;
  /** SVG viewport half-width in world units. Default 5. */
  worldRadius?: number;
  /** Panel width in px. Default 320. */
  width?: number;
}

// ─── SVG helpers ─────────────────────────────────────────────────────────────

/** Map world XZ → SVG XY within a [0, size] × [0, size] square. */
function worldToSVG(
  wx: number,
  wz: number,
  worldRadius: number,
  size: number,
): [number, number] {
  const half = size / 2;
  const sx = half + (wx / worldRadius) * half;
  const sy = half + (wz / worldRadius) * half; // z maps to y (top-down)
  return [sx, sy];
}

function trajectoryToPolyline(
  trajectory: Array<[number, number, number]>,
  worldRadius: number,
  size: number,
): string {
  return trajectory
    .map(([x, , z]) => worldToSVG(x, z, worldRadius, size).join(','))
    .join(' ');
}

// ─── Component ───────────────────────────────────────────────────────────────

const SVG_SIZE = 220;
const AGENT_COLOR = '#60a5fa';   // blue-400
const TARGET_COLOR = '#fb923c';  // orange-400
const TRAJ_NEAR = '#a78bfa';     // violet-400
const TRAJ_FAR = '#312e81';      // indigo-900

export function LocomotionDemoPanel({
  nodeId = 'demo-capsule',
  initialTarget = { x: 2, z: 2 },
  onTargetChange,
  worldRadius = 5,
  width = 320,
}: LocomotionDemoPanelProps) {
  const [target, setTarget] = useState<TargetPosition>(initialTarget);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  // ── Subscribe to neural_animation trait state ──
  const locomotion = useTraitState<LocomotionState>(
    nodeId,
    'neural_animation',
    (s) => s.locomotion as LocomotionState,
    {},
  );

  const trajectory = locomotion?.trajectory ?? [];
  const speed = locomotion?.speed ?? 0;
  const gait = locomotion?.gait ?? 'idle';
  const confidence = locomotion?.confidence ?? 0;

  // ── Draggable target ──────────────────────────────────────────────────────
  const svgToWorld = useCallback(
    (clientX: number, clientY: number): TargetPosition | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      const half = SVG_SIZE / 2;
      const scale = SVG_SIZE / rect.width;
      const x = ((sx * scale - half) / half) * worldRadius;
      const z = ((sy * scale - half) / half) * worldRadius;
      return { x: Math.max(-worldRadius, Math.min(worldRadius, x)), z: Math.max(-worldRadius, Math.min(worldRadius, z)) };
    },
    [worldRadius],
  );

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGCircleElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragging.current) return;
      const pos = svgToWorld(e.clientX, e.clientY);
      if (!pos) return;
      setTarget(pos);
      onTargetChange?.(pos);
    },
    [svgToWorld, onTargetChange],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  // ── Derived SVG coords ────────────────────────────────────────────────────
  const [agentSX, agentSY] = worldToSVG(0, 0, worldRadius, SVG_SIZE);
  const [targetSX, targetSY] = worldToSVG(target.x, target.z, worldRadius, SVG_SIZE);

  const polylinePoints = trajectoryToPolyline(trajectory, worldRadius, SVG_SIZE);
  const hasTrajectory = trajectory.length >= 2;

  return (
    <div
      data-testid="locomotion-demo-panel"
      style={{
        width,
        background: '#0f172a',
        color: '#e2e8f0',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>Locomotion Preview</span>
        <span
          data-testid="locomotion-trait-badge"
          style={{
            fontSize: 11,
            background: '#1e3a5f',
            color: AGENT_COLOR,
            padding: '2px 8px',
            borderRadius: 4,
            fontFamily: 'monospace',
          }}
        >
          @neural_animation
        </span>
      </div>

      {/* 2D overhead SVG viewport */}
      <div style={{ padding: 14 }}>
        <svg
          ref={svgRef}
          data-testid="locomotion-svg-viewport"
          width={SVG_SIZE}
          height={SVG_SIZE}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          style={{
            display: 'block',
            background: '#0a0a1a',
            borderRadius: 6,
            border: '1px solid #1e293b',
            cursor: 'crosshair',
            touchAction: 'none',
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Grid */}
          <line x1={SVG_SIZE / 2} y1={0} x2={SVG_SIZE / 2} y2={SVG_SIZE} stroke="#1e293b" strokeWidth={1} />
          <line x1={0} y1={SVG_SIZE / 2} x2={SVG_SIZE} y2={SVG_SIZE / 2} stroke="#1e293b" strokeWidth={1} />

          {/* Trajectory polyline */}
          {hasTrajectory && (
            <>
              {/* Gradient shadow */}
              <polyline
                data-testid="locomotion-trajectory-shadow"
                points={polylinePoints}
                fill="none"
                stroke={TRAJ_FAR}
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.6}
              />
              {/* Bright line */}
              <polyline
                data-testid="locomotion-trajectory-line"
                points={polylinePoints}
                fill="none"
                stroke={TRAJ_NEAR}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Endpoint dot */}
              {trajectory.length > 0 && (() => {
                const last = trajectory[trajectory.length - 1];
                const [lx, ly] = worldToSVG(last[0], last[2], worldRadius, SVG_SIZE);
                return <circle cx={lx} cy={ly} r={3} fill={TRAJ_NEAR} opacity={0.7} />;
              })()}
            </>
          )}

          {/* Agent capsule (circle) */}
          <circle
            data-testid="locomotion-agent"
            cx={agentSX}
            cy={agentSY}
            r={10}
            fill={AGENT_COLOR}
            opacity={0.9}
          />
          <circle cx={agentSX} cy={agentSY} r={10} fill="none" stroke="#1d4ed8" strokeWidth={1.5} />

          {/* Target puck (draggable) */}
          <circle
            cx={targetSX}
            cy={targetSY}
            r={7}
            fill="none"
            stroke={TARGET_COLOR}
            strokeWidth={2}
            strokeDasharray="4 2"
          />
          <circle
            data-testid="locomotion-target-handle"
            cx={targetSX}
            cy={targetSY}
            r={9}
            fill="transparent"
            style={{ cursor: 'grab' }}
            onPointerDown={handlePointerDown}
          />

          {/* Target label */}
          <text
            x={targetSX + 12}
            y={targetSY + 4}
            fill={TARGET_COLOR}
            fontSize={10}
            fontFamily="monospace"
          >
            target
          </text>
        </svg>

        {/* HUD stats */}
        <div
          style={{
            marginTop: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
          }}
        >
          <Stat label="gait" value={gait} testId="locomotion-gait" />
          <Stat label="speed" value={`${speed.toFixed(1)} m/s`} testId="locomotion-speed" />
          <Stat label="confidence" value={`${Math.round(confidence * 100)}%`} testId="locomotion-confidence" />
        </div>

        {/* Target position readout */}
        <div
          data-testid="locomotion-target-pos"
          style={{ marginTop: 8, color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
        >
          target ({target.x.toFixed(2)}, {target.z.toFixed(2)}) · frames {trajectory.length}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{ background: '#1e293b', padding: '6px 8px', borderRadius: 4 }}
    >
      <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ color: '#e2e8f0', fontFamily: 'monospace' }}>{value}</div>
    </div>
  );
}
