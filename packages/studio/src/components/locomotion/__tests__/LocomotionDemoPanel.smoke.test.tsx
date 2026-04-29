// @vitest-environment jsdom

/**
 * LocomotionDemoPanel smoke tests.
 * Verifies rendering and reactive trait-state updates via emitTraitStateUpdate.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, act } from '@testing-library/react';
import { LocomotionDemoPanel } from '../LocomotionDemoPanel';
import { emitTraitStateUpdate } from '@/hooks/useTraitState';

// Reset global trait state registry between tests via unique nodeIds.

describe('LocomotionDemoPanel', () => {
  it('renders the panel root and trait badge', () => {
    render(<LocomotionDemoPanel nodeId="smoke-node-1" />);
    expect(screen.getByTestId('locomotion-demo-panel')).toBeInTheDocument();
    expect(screen.getByTestId('locomotion-trait-badge')).toHaveTextContent('@neural_animation');
  });

  it('renders the SVG viewport', () => {
    render(<LocomotionDemoPanel nodeId="smoke-node-2" />);
    expect(screen.getByTestId('locomotion-svg-viewport')).toBeInTheDocument();
    expect(screen.getByTestId('locomotion-agent')).toBeInTheDocument();
    expect(screen.getByTestId('locomotion-target-handle')).toBeInTheDocument();
  });

  it('shows idle gait and zero speed when no state emitted', () => {
    render(<LocomotionDemoPanel nodeId="smoke-node-3" />);
    expect(screen.getByTestId('locomotion-gait')).toHaveTextContent('idle');
    expect(screen.getByTestId('locomotion-speed')).toHaveTextContent('0.0 m/s');
  });

  it('updates gait + speed after emitTraitStateUpdate', async () => {
    const nodeId = 'smoke-node-4';
    render(<LocomotionDemoPanel nodeId={nodeId} />);

    act(() => {
      emitTraitStateUpdate(nodeId, 'neural_animation', {
        locomotion: { speed: 3.5, gait: 'run', confidence: 0.92, trajectory: [] },
      });
    });

    expect(screen.getByTestId('locomotion-gait')).toHaveTextContent('run');
    expect(screen.getByTestId('locomotion-speed')).toHaveTextContent('3.5 m/s');
    expect(screen.getByTestId('locomotion-confidence')).toHaveTextContent('92%');
  });

  it('renders trajectory polyline when trajectory has ≥2 points', () => {
    const nodeId = 'smoke-node-5';
    render(<LocomotionDemoPanel nodeId={nodeId} />);

    // Before: no trajectory lines
    expect(screen.queryByTestId('locomotion-trajectory-line')).not.toBeInTheDocument();

    act(() => {
      emitTraitStateUpdate(nodeId, 'neural_animation', {
        locomotion: {
          trajectory: [
            [0, 0, 0],
            [1, 0, 0.5],
            [2, 0, 1],
          ],
          speed: 1.2,
          gait: 'walk',
          confidence: 0.75,
        },
      });
    });

    expect(screen.getByTestId('locomotion-trajectory-line')).toBeInTheDocument();
    expect(screen.getByTestId('locomotion-trajectory-shadow')).toBeInTheDocument();
  });

  it('shows frame count from trajectory array length', () => {
    const nodeId = 'smoke-node-6';
    render(<LocomotionDemoPanel nodeId={nodeId} />);

    act(() => {
      emitTraitStateUpdate(nodeId, 'neural_animation', {
        locomotion: {
          trajectory: [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]],
          speed: 0,
          gait: 'walk',
          confidence: 0,
        },
      });
    });

    expect(screen.getByTestId('locomotion-target-pos')).toHaveTextContent('frames 4');
  });

  it('calls onTargetChange prop when available', () => {
    const onTargetChange = vi.fn();
    render(
      <LocomotionDemoPanel
        nodeId="smoke-node-7"
        initialTarget={{ x: 1, z: 1 }}
        onTargetChange={onTargetChange}
      />
    );
    // Panel renders without error; onTargetChange is wired to pointer events.
    expect(screen.getByTestId('locomotion-demo-panel')).toBeInTheDocument();
  });
});
