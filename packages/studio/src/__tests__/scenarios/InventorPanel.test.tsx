// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InventorPanel } from '../../industry/scenarios/InventorPanel';

// Mock the inventorScenario functions
vi.mock('@/lib/inventorScenario', () => ({
  calculateTotalCost: vi.fn(() => 3100),
  estimateBuildTimeDays: vi.fn(() => 8),
  simulatePhysicsStressTest: vi.fn(() => ({ passed: true, stressFactor: 7.46 })),
}));

describe('InventorPanel', () => {
  it('renders the inventor panel with blueprint info', () => {
    render(<InventorPanel />);

    // Check header
    expect(screen.getByText('🛠️ Inventor & Hardware Engineering')).toBeInTheDocument();
    expect(screen.getByText('COMPLEXITY: EXPERIMENTAL')).toBeInTheDocument();

    // Check stats (mocked values)
    expect(screen.getByText('3100', { exact: false })).toBeInTheDocument(); // Cost ($3100)
    expect(screen.getByText('8d')).toBeInTheDocument(); // Assembly time

    // Check BOM items
    expect(screen.getByText('Titanium Chassis')).toBeInTheDocument();
    expect(screen.getByText('Carbon Fiber Shell')).toBeInTheDocument();

    // Check validation
    expect(screen.getByText('PASSED ✅', { exact: false })).toBeInTheDocument();
  });
});
