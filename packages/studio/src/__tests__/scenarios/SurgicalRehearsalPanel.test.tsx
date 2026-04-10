// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SurgicalRehearsalPanel } from '../../industry/scenarios/SurgicalRehearsalPanel';

// Mock the surgicalRehearsal library functions since we're testing the UI rendering
vi.mock('@/lib/surgicalRehearsal', () => ({
  estimateProcedureDuration: vi.fn(() => 70),
  bloodLossRisk: vi.fn(() => 'medium'),
  toolsRequired: vi.fn(() => ['scalpel', 'forceps']),
  anesthesiaCheck: vi.fn(() => true),
  overallRiskLevel: vi.fn(() => 'moderate'),
}));

describe('SurgicalRehearsalPanel', () => {
  it('renders the surgical rehearsal panel with procedure info', () => {
    render(<SurgicalRehearsalPanel />);

    // Check header
    expect(screen.getByText('🏥 Surgical Rehearsal')).toBeInTheDocument();
    expect(screen.getByText('MODERATE RISK')).toBeInTheDocument();

    // Check procedure section
    expect(screen.getByText('📋 Procedure: Laparoscopic Cholecystectomy')).toBeInTheDocument();

    // Check summary cards
    expect(screen.getByText('70 min')).toBeInTheDocument();
    expect(screen.getByText('MEDIUM')).toBeInTheDocument(); // matches bloodLossRisk mock
    expect(screen.getAllByText('2').length).toBeGreaterThan(0); // matches toolsRequired mock length and ASA

    // Check steps rendering
    expect(screen.getByText('Trocar Placement')).toBeInTheDocument();
    expect(screen.getByText('Dissection')).toBeInTheDocument();
    expect(screen.getByText('Remove gallbladder')).toBeInTheDocument(); // description check
  });

  it('renders patient and anesthesia information accurately', () => {
    render(<SurgicalRehearsalPanel />);

    // Check Patient section
    expect(screen.getByText('👤 Patient')).toBeInTheDocument();
    expect(screen.getByText('55')).toBeInTheDocument(); // Age
    expect(screen.getByText('28.4')).toBeInTheDocument(); // BMI
    expect(screen.getByText(/Penicillin/)).toBeInTheDocument(); // Allergy

    // Check Anesthesia section
    expect(screen.getByText('💉 Anesthesia')).toBeInTheDocument();
    expect(screen.getByText('Sevoflurane')).toBeInTheDocument();
    expect(screen.getByText('✅ Cleared')).toBeInTheDocument();
  });
});
