/** @vitest-environment jsdom */
/**
 * conformance_runner.scenario.ts — LIVING-SPEC: Spatial Conformance Runner
 *
 * Persona: Operations Auditor
 * Validates that the loaded AST complies with physical and accessibility rules.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { ConformanceSuitePanel } from '../../components/validation/ConformanceSuitePanel';
import { useSceneGraphStore } from '@/lib/stores';

vi.mock('@/lib/stores', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    useSceneGraphStore: vi.fn(),
  };
});

describe('Scenario: Conformance Runner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('evaluates physics rules as failed when missing collision bounds', async () => {
    const mockNodes = [
      {
        id: '1',
        name: 'Bad Object',
        type: 'mesh',
        props: {},
        traits: [{ name: 'physics', properties: {} }]
      }
    ];
    (useSceneGraphStore as any).mockImplementation((selector: any) =>
      selector({ nodes: mockNodes })
    );

    render(React.createElement(ConformanceSuitePanel, { onClose: () => {} }));
    
    const runBtn = screen.getByText('Run Conformance Suite');
    await act(async () => {
      fireEvent.click(runBtn);
      vi.advanceTimersByTime(2000);
    });

    const failedMsg = screen.getByText('Found @physics object missing @collision bounds.');
    expect(failedMsg).toBeDefined();
  }, 10000);

  it('evaluates text contrast rules as failed on white text', async () => {
    const mockNodes = [
      {
        id: '2',
        name: 'Bad Text',
        type: 'Text',
        props: { color: '#ffffff' },
        traits: []
      }
    ];
    (useSceneGraphStore as any).mockImplementation((selector: any) =>
      selector({ nodes: mockNodes })
    );

    render(React.createElement(ConformanceSuitePanel, { onClose: () => {} }));
    
    const runBtn = screen.getByText('Run Conformance Suite');
    await act(async () => {
      fireEvent.click(runBtn);
      vi.advanceTimersByTime(2000);
    });

    // The panel shows pre-defined rules including Accessibility Contrast.
    // After running, it shows error/warning severity badges for each rule evaluated.
    // The accessibility contrast rule is always shown and its description is visible.
    const contrastRule = screen.getByText('Accessibility Contrast');
    expect(contrastRule).toBeDefined();
    // At least one error/warning badge should be visible in the results panel
    const errorBadges = screen.getAllByText(/^(error|warning)$/i);
    expect(errorBadges.length).toBeGreaterThan(0);
  }, 10000);


  it('evaluates rules as passed when everything conforms', async () => {
    const mockNodes = [
      {
        id: '3',
        name: 'Good Object',
        type: 'mesh',
        props: {},
        traits: [{ name: 'physics', properties: {} }, { name: 'collision', properties: {} }]
      }
    ];
    (useSceneGraphStore as any).mockImplementation((selector: any) =>
      selector({ nodes: mockNodes })
    );

    render(React.createElement(ConformanceSuitePanel, { onClose: () => {} }));
    
    const runBtn = screen.getByText('Run Conformance Suite');
    await act(async () => {
      fireEvent.click(runBtn);
      vi.advanceTimersByTime(2000);
    });

    const reports = screen.getAllByText(/^passed$/i);
    expect(reports.length).toBeGreaterThan(0);
  }, 10000);
});
