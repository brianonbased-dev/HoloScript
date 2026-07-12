/* @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  FANOUT_RECEIPT_PACK,
  FANOUT_TARGETS,
  MULTI_TARGET_SOURCE,
  MultiTargetFanoutPanel,
} from './MultiTargetFanoutPanel';

describe('MultiTargetFanoutPanel', () => {
  it('shows at least three target classes and dispatches the fan-out', () => {
    const onDispatch = vi.fn();
    render(<MultiTargetFanoutPanel onDispatch={onDispatch} />);

    expect(screen.getByTestId('multi-target-fanout')).toHaveTextContent(
      'Prompt → Multi-target fan-out'
    );
    expect(screen.getByText('Browser')).toBeInTheDocument();
    expect(screen.getByText('Unity')).toBeInTheDocument();
    expect(screen.getByText('Robot/sim')).toBeInTheDocument();
    expect(screen.getByText('XR')).toBeInTheDocument();
    expect(screen.getByText('Service/MCP')).toBeInTheDocument();
    expect(screen.getByText('Asset pack')).toBeInTheDocument();
    expect(screen.getByText('receipt-pack://multi-target-fanout.v1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('multi-target-dispatch'));
    expect(onDispatch).toHaveBeenCalledTimes(1);
  });

  it('ships durable HoloScript source and merged per-target receipts', () => {
    expect(FANOUT_TARGETS.length).toBeGreaterThanOrEqual(3);
    expect(FANOUT_RECEIPT_PACK).toContain('browser-webgpu-r3f');
    expect(FANOUT_RECEIPT_PACK).toContain('unity-gameplay');
    expect(FANOUT_RECEIPT_PACK).toContain('robot-sim');
    expect(MULTI_TARGET_SOURCE).toContain('composition MultiTargetFanoutRun');
    expect(MULTI_TARGET_SOURCE).toContain('receipt: "multi-target-fanout.v1"');
    expect(MULTI_TARGET_SOURCE).toContain('streamStatus: true');
    expect(MULTI_TARGET_SOURCE).toContain('compareTargetDiffs: true');
    expect(MULTI_TARGET_SOURCE).toContain('compile_to_webgpu');
    expect(MULTI_TARGET_SOURCE).toContain('compile_to_unity');
    expect(MULTI_TARGET_SOURCE).toContain('compile_to_urdf');
  });
});
