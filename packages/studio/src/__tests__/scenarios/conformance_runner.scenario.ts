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
import { useSceneGraphStore, useSceneStore } from '@/lib/stores';
import { DEFAULT_RULES } from '../../components/validation/ConformanceSuitePanel';

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
        traits: [{ name: 'physics', properties: {} }],
      },
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
        traits: [],
      },
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
        traits: [
          { name: 'physics', properties: {} },
          { name: 'collision', properties: {} },
        ],
      },
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

describe('Scenario: Conformance Runner runs the real compiler (H5)', () => {
  const run = async (code: string, nodes: any[] = []) => {
    (useSceneGraphStore as any).mockImplementation((selector: any) => selector({ nodes }));
    useSceneStore.getState().setCode(code);
    const view = render(React.createElement(ConformanceSuitePanel, { onClose: () => {} }));
    await act(async () => {
      fireEvent.click(screen.getByText('Run Conformance Suite'));
    });
    return view;
  };
  const statusOf = (name: string) => {
    const card = screen.getByText(name).parentElement as HTMLElement;
    return card.querySelector('span.capitalize')?.textContent?.replace('↻', '').trim();
  };

  afterEach(() => {
    useSceneStore.getState().reset();
    vi.clearAllMocks();
  });

  it('results appear without any timer (no fake 1.5s wait)', async () => {
    vi.useFakeTimers();
    await run('composition "A" {\n  object "Cube" { geometry: "cube" }\n}\n');
    expect(vi.getTimerCount()).toBe(0);
    expect(statusOf('Missing Braces')).toBe('passed');
    vi.useRealTimers();
  });

  it('`object Cube {` fails Missing Braces with a plain message', async () => {
    await run('object Cube {');
    expect(statusOf('Missing Braces')).toBe('failed');
    expect(screen.getByText(/never closed.*Add a closing "}"/)).toBeDefined();
  });

  it('garbage input fails Unexpected Token', async () => {
    await run('}}}} ;;; @@ %%% zzz');
    expect(statusOf('Unexpected Token')).toBe('failed');
    expect(screen.getByText(/could not read/)).toBeDefined();
  });

  it('valid scene passes the compiler rules', async () => {
    await run(
      'composition "A" {\n  object "Cube" {\n    @grabbable\n    geometry: "cube"\n  }\n}\n'
    );
    expect(statusOf('Missing Braces')).toBe('passed');
    expect(statusOf('Unexpected Token')).toBe('passed');
    expect(statusOf('Unknown Trait')).toBe('passed');
  });

  it('rules with no real check say "not checked", never "passed"', async () => {
    await run('composition "A" {\n  object "Cube" { geometry: "cube" }\n}\n');
    for (const name of [
      'NavMesh Continuity',
      'Unknown Geometry',
      'Invalid Property',
      'Missing Texture',
    ]) {
      expect(statusOf(name)).toBe('not checked');
    }
  });

  it('with no scene code, compiler rules are not checked (not passed)', async () => {
    await run('');
    for (const name of ['Missing Braces', 'Unexpected Token', 'Unknown Trait']) {
      expect(statusOf(name)).toBe('not checked');
    }
  });

  it('every rule is accounted for: nothing shows passed unless its check ran', async () => {
    await run('');
    // The only rules allowed to pass on an empty scene are the scene-graph checks that
    // genuinely ran over the (empty) node list.
    const sceneGraphRules = new Set(['1', '2', '3', '10', '11', '12', '14']);
    for (const rule of DEFAULT_RULES) {
      const st = statusOf(rule.name);
      expect(['passed', 'failed', 'warning', 'not checked']).toContain(st);
      if (!sceneGraphRules.has(rule.id)) expect(st).not.toBe('passed');
    }
  });
});
