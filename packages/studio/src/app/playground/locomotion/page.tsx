'use client';

/**
 * /playground/locomotion — Studio demo route for NeuralAnimationTrait
 * locomotion preview.
 *
 * Shows the LocomotionDemoPanel wired to a demo node ID. The "Simulate
 * frame" button calls emitTraitStateUpdate() to push a synthetic
 * 12-frame trajectory, letting you verify the trait-state subscription
 * without a live engine.
 */

import { useCallback, useState } from 'react';
import { ResponsiveStudioLayout } from '@/components/layouts/ResponsiveStudioLayout';
import { LocomotionDemoPanel } from '@/components/locomotion/LocomotionDemoPanel';
import { emitTraitStateUpdate } from '@/hooks/useTraitState';
import type { TargetPosition } from '@/components/locomotion/LocomotionDemoPanel';

const DEMO_NODE_ID = 'playground-locomotion-capsule';

/** Build a synthetic 12-frame trajectory arc toward the target. */
function buildDemoTrajectory(
  target: TargetPosition,
  frames = 12,
): Array<[number, number, number]> {
  return Array.from({ length: frames }, (_, i) => {
    const t = i / (frames - 1);
    return [target.x * t, 0, target.z * t] as [number, number, number];
  });
}

export default function LocomotionPlaygroundPage() {
  const [target, setTarget] = useState<TargetPosition>({ x: 2, z: 2 });
  const [gait, setGait] = useState<'walk' | 'run' | 'crouch'>('walk');

  const handleSimulate = useCallback(() => {
    const trajectory = buildDemoTrajectory(target);
    const speed = gait === 'run' ? 5.5 : gait === 'crouch' ? 0.8 : 2.4;
    const confidence = gait === 'run' ? 0.94 : gait === 'crouch' ? 0.71 : 0.88;
    emitTraitStateUpdate(DEMO_NODE_ID, 'neural_animation', {
      locomotion: { trajectory, speed, gait, confidence },
    });
  }, [target, gait]);

  return (
    <ResponsiveStudioLayout title="Locomotion preview">
      <div className="flex h-full flex-col gap-4 overflow-auto p-6">
        <div>
          <h1 className="text-lg font-semibold text-studio-text">
            NeuralAnimationTrait — Locomotion demo
          </h1>
          <p className="mt-1 text-sm text-studio-muted">
            Drag the target puck, choose a gait, then click Simulate to push a synthetic
            12-frame trajectory into the panel via{' '}
            <code className="font-mono text-[11px]">emitTraitStateUpdate</code>.
          </p>
        </div>

        <div className="flex flex-wrap gap-6">
          {/* Controls */}
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs uppercase tracking-wider text-studio-muted mb-1">
                Gait
              </label>
              <div className="flex gap-2">
                {(['walk', 'run', 'crouch'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGait(g)}
                    className={[
                      'rounded px-3 py-1.5 text-xs font-medium transition-colors',
                      gait === g
                        ? 'bg-blue-600 text-white'
                        : 'bg-studio-panel text-studio-muted hover:text-studio-text',
                    ].join(' ')}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleSimulate}
              className="rounded bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors"
            >
              Simulate frame
            </button>

            <p className="text-[11px] text-studio-muted">
              Node ID:{' '}
              <span className="font-mono">{DEMO_NODE_ID}</span>
            </p>
          </div>

          {/* Panel */}
          <LocomotionDemoPanel
            nodeId={DEMO_NODE_ID}
            initialTarget={target}
            onTargetChange={setTarget}
            worldRadius={5}
            width={320}
          />
        </div>
      </div>
    </ResponsiveStudioLayout>
  );
}
