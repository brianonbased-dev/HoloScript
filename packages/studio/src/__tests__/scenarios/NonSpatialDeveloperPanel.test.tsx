// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { NonSpatialDeveloperPanel } from '../../industry/scenarios/NonSpatialDeveloperPanel';

vi.mock('@/lib/nonspatialScenario', () => ({
  calculateSpatialSyncLatency: vi.fn(() => 2445), // P99 Latency
  estimateStateMutationCost: vi.fn(() => 6050),
  validateSpatialMapping: vi.fn(() => ({
    valid: false,
    warnings: ['Endpoint /api/v1/game/worldState has large payload (6000KB)'],
  })),
}));

describe('NonSpatialDeveloperPanel', () => {
  it('renders web-to-spatial bridging metrics', () => {
    render(<NonSpatialDeveloperPanel />);

    // Check titles
    expect(screen.getByText('💻 Traditional to Spatial Mapping')).toBeInTheDocument();
    expect(screen.getByText('ARCH: SERVERLESS')).toBeInTheDocument();

    // Check fields
    expect(screen.getByText('2445 ms')).toBeInTheDocument();
    expect(screen.getByText('6050')).toBeInTheDocument();

    // Check warnings
    expect(
      screen.getByText('⚠️ Endpoint /api/v1/game/worldState has large payload (6000KB)', {
        exact: false,
      })
    ).toBeInTheDocument();
  });
});
