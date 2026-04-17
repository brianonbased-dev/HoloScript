import { describe, it, expect } from 'vitest';
import {
  checkAlignment,
  auditComponents,
  computeContrastRatio,
  type ComponentDescriptor,
} from '../lib/multimodalAccessibility';
import * as studioPublicApi from '../index';

// ─── helpers ──────────────────────────────────────────────────────

function makeComp(overrides: Partial<ComponentDescriptor> = {}): ComponentDescriptor {
  return {
    id: 'test-comp',
    name: 'Test Component',
    vision: {},
    language: {},
    action: {},
    ...overrides,
  };
}

// ─── computeContrastRatio ─────────────────────────────────────────

describe('computeContrastRatio', () => {
  it('is exported from the studio public API', () => {
    expect(studioPublicApi.computeContrastRatio).toBe(computeContrastRatio);
    expect(studioPublicApi.checkAlignment).toBe(checkAlignment);
    expect(studioPublicApi.auditComponents).toBe(auditComponents);
  });

  it('returns ~21 for black on white', () => {
    const ratio = computeContrastRatio('#000000', '#ffffff');
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('returns 1 for identical colors', () => {
    const ratio = computeContrastRatio('#808080', '#808080');
    expect(ratio).toBeCloseTo(1, 1);
  });

  it('handles 3-char hex shorthand', () => {
    const ratio = computeContrastRatio('#000', '#fff');
    expect(ratio).toBeCloseTo(21, 0);
  });
});

// ─── checkAlignment — vision ──────────────────────────────────────

describe('checkAlignment — vision', () => {
  it('flags icon-only element without aria-label', () => {
    const result = checkAlignment(
      makeComp({ vision: { isIconOnly: true }, language: {}, action: {} }),
    );
    const issue = result.issues.find((i) => i.wcagCriterion === '1.1.1');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('error');
    expect(issue?.modalities).toContain('vision');
    expect(issue?.modalities).toContain('language');
  });

  it('passes icon-only with aria-label', () => {
    const result = checkAlignment(
      makeComp({
        vision: { isIconOnly: true },
        language: { ariaLabel: 'Close dialog' },
        action: {},
      }),
    );
    expect(result.issues.filter((i) => i.wcagCriterion === '1.1.1')).toHaveLength(0);
  });

  it('flags contrast ratio below 4.5:1', () => {
    // #dddddd on #ffffff ≈ 1.36:1 — below both 3:1 and 4.5:1 thresholds
    const result = checkAlignment(
      makeComp({
        vision: { foregroundColor: '#dddddd', backgroundColor: '#ffffff' },
        language: {},
        action: {},
      }),
    );
    const issue = result.issues.find((i) => i.wcagCriterion === '1.4.3');
    expect(issue).toBeDefined();
    // severity is 'error' for < 3:1, 'warning' for 3:1-4.5:1
    expect(['error', 'warning']).toContain(issue?.severity);
  });

  it('flags contrast between 3:1 and 4.5:1 as warning', () => {
    // #767676 on #ffffff ≈ 4.48:1 (just under AA threshold)
    const result = checkAlignment(
      makeComp({
        vision: { foregroundColor: '#777777', backgroundColor: '#ffffff' },
        language: {},
        action: {},
      }),
    );
    const issue = result.issues.find((i) => i.wcagCriterion === '1.4.3');
    expect(issue?.severity).toBe('warning');
  });

  it('passes high-contrast colors', () => {
    const result = checkAlignment(
      makeComp({
        vision: { foregroundColor: '#000000', backgroundColor: '#ffffff' },
        language: {},
        action: {},
      }),
    );
    expect(result.issues.filter((i) => i.wcagCriterion === '1.4.3')).toHaveLength(0);
  });

  it('flags missing focus indicator', () => {
    const result = checkAlignment(
      makeComp({ vision: { hasFocusIndicator: false }, language: {}, action: {} }),
    );
    const issue = result.issues.find((i) => i.wcagCriterion === '2.4.7');
    expect(issue?.severity).toBe('error');
  });

  it('flags touch target below 24px as error', () => {
    const result = checkAlignment(
      makeComp({
        vision: { boundingBoxPx: { width: 20, height: 20 } },
        language: {},
        action: {},
      }),
    );
    const issue = result.issues.find((i) => i.wcagCriterion === '2.5.5');
    expect(issue?.severity).toBe('error');
  });

  it('flags touch target 24-44px as warning', () => {
    const result = checkAlignment(
      makeComp({
        vision: { boundingBoxPx: { width: 30, height: 30 } },
        language: {},
        action: {},
      }),
    );
    const issue = result.issues.find((i) => i.wcagCriterion === '2.5.5');
    expect(issue?.severity).toBe('warning');
  });

  it('passes touch target ≥44px with no issue', () => {
    const result = checkAlignment(
      makeComp({
        vision: { boundingBoxPx: { width: 44, height: 44 } },
        language: {},
        action: {},
      }),
    );
    expect(result.issues.filter((i) => i.wcagCriterion === '2.5.5')).toHaveLength(0);
  });
});

// ─── checkAlignment — language ────────────────────────────────────

describe('checkAlignment — language', () => {
  it('flags interactive element with no accessible name', () => {
    const result = checkAlignment(
      makeComp({
        vision: {},
        language: {},
        action: { isFocusable: true, hasClickHandler: true },
      }),
    );
    const issue = result.issues.find((i) => i.wcagCriterion === '4.1.2');
    expect(issue?.severity).toBe('error');
  });

  it('passes interactive element with aria-label', () => {
    const result = checkAlignment(
      makeComp({
        vision: {},
        language: { ariaLabel: 'Submit form', role: 'button' },
        action: { isFocusable: true, hasClickHandler: true, hasKeyboardHandler: true },
      }),
    );
    expect(result.issues.filter((i) => i.wcagCriterion === '4.1.2' && i.severity === 'error')).toHaveLength(0);
  });

  it('flags invalid heading level', () => {
    const result = checkAlignment(
      makeComp({ language: { headingLevel: 7 } }),
    );
    const issue = result.issues.find((i) => i.wcagCriterion === '1.3.1');
    expect(issue?.severity).toBe('error');
  });

  it('flags very low readability score', () => {
    const result = checkAlignment(
      makeComp({ language: { readabilityScore: 10 } }),
    );
    const issue = result.issues.find((i) => i.wcagCriterion === '3.1.5');
    expect(issue?.severity).toBe('warning');
  });
});

// ─── checkAlignment — action ──────────────────────────────────────

describe('checkAlignment — action', () => {
  it('flags click handler without keyboard access', () => {
    const result = checkAlignment(
      makeComp({
        vision: {},
        language: {},
        action: { hasClickHandler: true, hasKeyboardHandler: false, isFocusable: false },
      }),
    );
    const issue = result.issues.find((i) => i.wcagCriterion === '2.1.1');
    expect(issue?.severity).toBe('error');
  });

  it('passes element with both click and keyboard handlers', () => {
    const result = checkAlignment(
      makeComp({
        vision: {},
        language: { ariaLabel: 'Open menu', role: 'button' },
        action: { hasClickHandler: true, hasKeyboardHandler: true, isFocusable: true, tabIndex: 0 },
      }),
    );
    expect(result.issues.filter((i) => i.wcagCriterion === '2.1.1')).toHaveLength(0);
  });

  it('flags role=status without aria-live', () => {
    const result = checkAlignment(
      makeComp({
        vision: {},
        language: { role: 'status' },
        action: { hasLiveRegion: false },
      }),
    );
    const issue = result.issues.find((i) => i.wcagCriterion === '4.1.3');
    expect(issue?.severity).toBe('warning');
  });
});

// ─── cross-modal alignment ────────────────────────────────────────

describe('checkAlignment — cross-modal', () => {
  it('flags label-in-name mismatch (2.5.3)', () => {
    const result = checkAlignment(
      makeComp({
        vision: { isIconOnly: false },
        language: { textContent: 'Save', ariaLabel: 'Submit form' },
        action: {},
      }),
    );
    const issue = result.issues.find((i) => i.wcagCriterion === '2.5.3');
    expect(issue?.severity).toBe('error');
    expect(issue?.modalities).toContain('vision');
    expect(issue?.modalities).toContain('language');
  });

  it('passes when aria-label matches visible text', () => {
    const result = checkAlignment(
      makeComp({
        vision: {},
        language: { textContent: 'Save', ariaLabel: 'Save' },
        action: {},
      }),
    );
    expect(result.issues.filter((i) => i.wcagCriterion === '2.5.3')).toHaveLength(0);
  });

  it('flags action element invisible across all modalities', () => {
    const result = checkAlignment(
      makeComp({
        vision: {},
        language: {},
        action: { hasClickHandler: true },
      }),
    );
    const issue = result.issues.find(
      (i) => i.wcagCriterion === '1.1.1' && i.modalities.length === 3,
    );
    expect(issue).toBeDefined();
  });
});

// ─── alignment score and WCAG conformance ─────────────────────────

describe('checkAlignment — scoring', () => {
  it('fully passing element scores 100', () => {
    const result = checkAlignment(
      makeComp({
        vision: { hasFocusIndicator: true, boundingBoxPx: { width: 44, height: 44 } },
        language: { ariaLabel: 'Close', role: 'button', textContent: 'Close' },
        action: { isFocusable: true, hasClickHandler: true, hasKeyboardHandler: true, tabIndex: 0 },
      }),
    );
    expect(result.alignmentScore).toBe(100);
    expect(result.wcagConformance).toBe('AA');
    expect(result.issues).toHaveLength(0);
  });

  it('element with errors has conformance=none', () => {
    const result = checkAlignment(
      makeComp({
        vision: {},
        language: {},
        action: { hasClickHandler: true, isFocusable: false, hasKeyboardHandler: false },
      }),
    );
    expect(result.wcagConformance).toBe('none');
    expect(result.alignmentScore).toBeLessThan(100);
  });
});

// ─── auditComponents ──────────────────────────────────────────────

describe('auditComponents', () => {
  it('audits multiple components and produces summary', () => {
    const components: ComponentDescriptor[] = [
      makeComp({
        id: 'comp-a',
        name: 'Good Button',
        vision: { hasFocusIndicator: true, boundingBoxPx: { width: 44, height: 44 } },
        language: { ariaLabel: 'Submit', role: 'button', textContent: 'Submit' },
        action: { isFocusable: true, hasClickHandler: true, hasKeyboardHandler: true, tabIndex: 0 },
      }),
      makeComp({
        id: 'comp-b',
        name: 'Bad Icon',
        vision: { isIconOnly: true, hasFocusIndicator: false },
        language: {},
        action: { hasClickHandler: true, isFocusable: false },
      }),
    ];

    const report = auditComponents(components);
    expect(report.totalComponents).toBe(2);
    expect(report.summary.errorCount).toBeGreaterThan(0);
    expect(report.summary.componentsFullyPassing).toBe(1);
    expect(report.results).toHaveLength(2);
    expect(report.auditedAt).toBeTruthy();
  });

  it('detects cross-modal issues in summary', () => {
    const components: ComponentDescriptor[] = [
      makeComp({
        id: 'cross-modal',
        name: 'Mismatched Label',
        vision: {},
        language: { textContent: 'Save', ariaLabel: 'Delete' },
        action: {},
      }),
    ];

    const report = auditComponents(components);
    expect(report.summary.crossModalIssueCount).toBeGreaterThan(0);
  });

  it('returns empty issues for fully compliant components', () => {
    const components: ComponentDescriptor[] = [
      makeComp({
        id: 'clean',
        name: 'Clean',
        vision: { hasFocusIndicator: true },
        language: { role: 'region' },
        action: {},
      }),
    ];

    const report = auditComponents(components);
    expect(report.summary.totalIssues).toBe(0);
    expect(report.summary.componentsFullyPassing).toBe(1);
  });
});
