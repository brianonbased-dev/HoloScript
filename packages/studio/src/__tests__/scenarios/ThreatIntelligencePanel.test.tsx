// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { ThreatIntelligencePanel } from '../../industry/scenarios/ThreatIntelligencePanel';

describe('ThreatIntelligencePanel', () => {
  it('renders threat intel metrics and handles isolation', () => {
    render(<ThreatIntelligencePanel />);

    // Check titles
    expect(screen.getByText('[ SOC ] Threat Intelligence Center')).toBeInTheDocument();
    
    // Check nodes rendering
    expect(screen.getByText('192.168.1.10')).toBeInTheDocument();
    expect(screen.getByText('10.0.0.5')).toBeInTheDocument();
    
    // Contains "COMPROMISED" state initially
    expect(screen.getByText('COMPROMISED')).toBeInTheDocument();
    
    // Defcon Level initially HIGH due to compromised node
    expect(screen.getByText('HIGH')).toBeInTheDocument();

    // Click isolation protocol
    const btn = screen.getByText('! INITIATE ISOLATION PROTOCOL');
    fireEvent.click(btn);

    // Node state should be removed from COMPROMISED, maybe OFFLINE now 
    // (There should be 2 OFFLINE nodes now since one was already offline)
    const offlineNodes = screen.getAllByText('OFFLINE');
    expect(offlineNodes.length).toBe(2);
  });
});
