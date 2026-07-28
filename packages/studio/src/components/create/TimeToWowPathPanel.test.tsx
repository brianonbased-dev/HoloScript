/* @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TIME_TO_WOW_SOURCE, TimeToWowPathPanel } from './TimeToWowPathPanel';

describe('TimeToWowPathPanel', () => {
  it('shows the prompt-to-running-project promise and starts the flow', () => {
    const onStart = vi.fn();
    render(<TimeToWowPathPanel onStart={onStart} />);

    expect(screen.getByTestId('time-to-wow-path')).toHaveTextContent('Prompt → Running Project');
    expect(screen.getByText('live preview + source')).toBeInTheDocument();
    expect(screen.getByText('GLB')).toBeInTheDocument();
    expect(screen.getByText('JSON')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('AUDIO')).toBeInTheDocument();
    expect(screen.getByText('web · glTF · GLB · zip')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('time-to-wow-start'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('ships durable HoloScript source for the generated first screen', () => {
    expect(TIME_TO_WOW_SOURCE).toContain('scene "Neon Orchard Launchpad"');
    expect(TIME_TO_WOW_SOURCE).toContain('receipt: "time-to-wow.v1"');
    expect(TIME_TO_WOW_SOURCE).toContain('import model "assets/drone.glb"');
    expect(TIME_TO_WOW_SOURCE).toContain('import data "assets/orchard-telemetry.csv"');
    expect(TIME_TO_WOW_SOURCE).toContain('formats: ["web", "gltf", "glb", "zip"]');
  });
});
