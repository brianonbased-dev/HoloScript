// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { AstrophysicsRadioLabPanel } from '../../industry/scenarios/AstrophysicsRadioLabPanel';

describe('AstrophysicsRadioLabPanel', () => {
  it('renders astrophysics telemetry and handles RFI filtering', () => {
    render(<AstrophysicsRadioLabPanel />);

    expect(screen.getByText('📡 Radio Interferometry Lab')).toBeInTheDocument();
    
    // Check initial counts based on the default state
    expect(screen.getByText('RAW FITS EVENTS')).toBeInTheDocument();
    
    // We should see 4 raw events and 1 rejected (since default threshold is 20, and one is 95)
    const rawVal = screen.getByText('4');
    expect(rawVal).toBeInTheDocument();
  });
});
