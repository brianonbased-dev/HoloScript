// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { AbsorbOrchestratorPanel } from '../../industry/scenarios/AbsorbOrchestratorPanel';

describe('AbsorbOrchestratorPanel', () => {
  it('renders orchestration funnel tasks and handles percentages', () => {
    render(<AbsorbOrchestratorPanel />);

    // Check titles
    expect(screen.getByText('🌀 Absorb & Orchestration Funnel')).toBeInTheDocument();
    
    // Check nodes rendering
    expect(screen.getByText('Refactor Core Rendering')).toBeInTheDocument();
    expect(screen.getByText('IDLE')).toBeInTheDocument(); // Initial state
    
    // We should see total tokens from initial state: 0 + 2500 + 5500 = 8000
    expect(screen.getByText('8000')).toBeInTheDocument();
  });
});
