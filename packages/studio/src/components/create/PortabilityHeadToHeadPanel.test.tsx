/* @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  PORTABILITY_ARTIFACTS,
  PORTABILITY_COMPARISON_LINE,
  PORTABILITY_SOURCE,
  PortabilityHeadToHeadPanel,
} from './PortabilityHeadToHeadPanel';

describe('PortabilityHeadToHeadPanel', () => {
  it('shows the required Omma comparison line and artifact links', () => {
    const onOpenDemo = vi.fn();
    render(<PortabilityHeadToHeadPanel onOpenDemo={onOpenDemo} />);

    expect(screen.getByTestId('portability-head-to-head')).toHaveTextContent(
      PORTABILITY_COMPARISON_LINE
    );
    expect(screen.getByText('HoloScript source')).toBeInTheDocument();
    expect(screen.getByText('Browser/WebGPU')).toBeInTheDocument();
    expect(screen.getByText('Unity package')).toBeInTheDocument();
    expect(screen.getByText('Robot/sim')).toBeInTheDocument();
    expect(screen.getByText('CAEL receipt pack')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('portability-open-demo'));
    expect(onOpenDemo).toHaveBeenCalledTimes(1);
  });

  it('ships durable source that links the same prompt to target artifacts', () => {
    expect(PORTABILITY_ARTIFACTS.length).toBeGreaterThanOrEqual(6);
    expect(PORTABILITY_SOURCE).toContain('composition OmmaPortabilityHeadToHead');
    expect(PORTABILITY_SOURCE).toContain('receipt: "omma-portability-head-to-head.v1"');
    expect(PORTABILITY_SOURCE).toContain('time_to_wow_path.holo');
    expect(PORTABILITY_SOURCE).toContain('multi_target_fanout.holo');
    expect(PORTABILITY_SOURCE).toContain('Browser/WebGPU preview');
    expect(PORTABILITY_SOURCE).toContain('Unity gameplay package');
    expect(PORTABILITY_SOURCE).toContain('Robot/sim URDF + SDF');
    expect(PORTABILITY_SOURCE).toContain('CAEL/provenance receipt pack');
  });
});
