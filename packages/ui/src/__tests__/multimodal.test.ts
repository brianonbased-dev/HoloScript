import { describe, it, expect } from 'vitest';
import { checkAlignment } from '../accessibility/multimodal';
import type { VisualDescriptor, LanguageDescriptor, ActionDescriptor } from '../accessibility/multimodal';

function makeVisual(overrides: Partial<VisualDescriptor> = {}): VisualDescriptor {
  return {
    altText: 'A descriptive image',
    hasAdequateContrast: true,
    isFullyHidden: false,
    hasFocusIndicator: true,
    ...overrides,
  };
}

function makeLang(overrides: Partial<LanguageDescriptor> = {}): LanguageDescriptor {
  return {
    accessibleName: 'Submit',
    accessibleDescription: '',
    role: 'button',
    lang: 'en',
    ...overrides,
  };
}

function makeAction(overrides: Partial<ActionDescriptor> = {}): ActionDescriptor {
  return {
    isKeyboardFocusable: true,
    isScreenReaderAccessible: true,
    hasSufficientTouchTarget: true,
    interactionType: 'button',
    ...overrides,
  };
}

describe('checkAlignment()', () => {
  describe('clean element — no issues', () => {
    it('passes with zero issues for a fully accessible interactive element', () => {
      const report = checkAlignment(makeVisual(), makeLang(), makeAction());
      expect(report.passes).toBe(true);
      expect(report.issueCount).toBe(0);
      expect(report.wcagLevel).toBe('AA');
    });

    it('passes for a decorative element (role=presentation, no alt)', () => {
      const report = checkAlignment(
        makeVisual({ altText: '' }),
        makeLang({ role: 'presentation' }),
        makeAction({ interactionType: 'none' }),
      );
      expect(report.passes).toBe(true);
    });
  });

  describe('WCAG 1.1.1 — Non-text Content', () => {
    it('raises critical when non-hidden image has no alt text', () => {
      const report = checkAlignment(
        makeVisual({ altText: '' }),
        makeLang({ role: 'img' }),
        makeAction({ interactionType: 'none' }),
      );
      const issue = report.issues.find(i => i.criterion === '1.1.1' && i.severity === 'critical');
      expect(issue).toBeDefined();
      expect(report.passes).toBe(false);
    });

    it('does not flag a fully-hidden element for missing alt text', () => {
      const report = checkAlignment(
        makeVisual({ altText: '', isFullyHidden: true }),
        makeLang({ role: 'img' }),
        makeAction({ interactionType: 'none' }),
      );
      expect(report.issues.filter(i => i.criterion === '1.1.1' && i.severity === 'critical')).toHaveLength(0);
    });
  });

  describe('WCAG 1.4.3 — Contrast (Minimum)', () => {
    it('raises serious when contrast is insufficient', () => {
      const report = checkAlignment(
        makeVisual({ hasAdequateContrast: false }),
        makeLang(),
        makeAction(),
      );
      const issue = report.issues.find(i => i.criterion === '1.4.3');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('serious');
    });
  });

  describe('WCAG 2.1.1 — Keyboard', () => {
    it('raises critical when interactive element is not keyboard-focusable', () => {
      const report = checkAlignment(
        makeVisual(),
        makeLang(),
        makeAction({ isKeyboardFocusable: false }),
      );
      const issue = report.issues.find(i => i.criterion === '2.1.1');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('critical');
    });
  });

  describe('WCAG 2.4.7 — Focus Visible', () => {
    it('raises serious when focusable element has no focus indicator', () => {
      const report = checkAlignment(
        makeVisual({ hasFocusIndicator: false }),
        makeLang(),
        makeAction({ isKeyboardFocusable: true }),
      );
      const issue = report.issues.find(i => i.criterion === '2.4.7');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('serious');
    });
  });

  describe('WCAG 2.5.5 — Target Size', () => {
    it('raises moderate when touch target is too small', () => {
      const report = checkAlignment(
        makeVisual(),
        makeLang(),
        makeAction({ hasSufficientTouchTarget: false }),
      );
      const issue = report.issues.find(i => i.criterion === '2.5.5');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('moderate');
    });
  });

  describe('WCAG 3.1.1 — Language of Page', () => {
    it('raises moderate when no language is declared', () => {
      const report = checkAlignment(
        makeVisual(),
        makeLang({ lang: '' }),
        makeAction(),
      );
      const issue = report.issues.find(i => i.criterion === '3.1.1');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('moderate');
    });
  });

  describe('WCAG 4.1.2 — Name, Role, Value', () => {
    it('raises critical when interactive element has no accessible name', () => {
      const report = checkAlignment(
        makeVisual(),
        makeLang({ accessibleName: '' }),
        makeAction(),
      );
      const issue = report.issues.find(i => i.criterion === '4.1.2' && i.severity === 'critical');
      expect(issue).toBeDefined();
    });

    it('raises serious when interactive element has no explicit role', () => {
      const report = checkAlignment(
        makeVisual(),
        makeLang({ role: '' }),
        makeAction(),
      );
      const issue = report.issues.find(i => i.criterion === '4.1.2' && i.severity === 'serious');
      expect(issue).toBeDefined();
    });
  });

  describe('WCAG 1.3.1 — Info and Relationships', () => {
    it('raises serious when interactive element is screen-reader-hidden', () => {
      const report = checkAlignment(
        makeVisual(),
        makeLang(),
        makeAction({ isScreenReaderAccessible: false }),
      );
      const issue = report.issues.find(i => i.criterion === '1.3.1');
      expect(issue).toBeDefined();
      expect(issue?.severity).toBe('serious');
    });
  });

  describe('issue ordering', () => {
    it('sorts issues critical → serious → moderate → minor', () => {
      // Trigger contrast (serious) + keyboard (critical) + lang (moderate)
      const report = checkAlignment(
        makeVisual({ hasAdequateContrast: false }),
        makeLang({ lang: '' }),
        makeAction({ isKeyboardFocusable: false }),
      );
      const severities = report.issues.map(i => i.severity);
      for (let idx = 1; idx < severities.length; idx++) {
        expect(['critical', 'serious', 'moderate', 'minor'].indexOf(severities[idx]!)).toBeGreaterThanOrEqual(
          ['critical', 'serious', 'moderate', 'minor'].indexOf(severities[idx - 1]!),
        );
      }
    });
  });

  describe('wcagLevel field', () => {
    it('returns "AA" when no issues', () => {
      expect(checkAlignment(makeVisual(), makeLang(), makeAction()).wcagLevel).toBe('AA');
    });

    it('returns "A" when only serious issues exist', () => {
      const report = checkAlignment(makeVisual({ hasAdequateContrast: false }), makeLang(), makeAction());
      expect(report.wcagLevel).toBe('A');
    });

    it('returns "none" when critical issues exist', () => {
      const report = checkAlignment(makeVisual({ altText: '' }), makeLang({ role: 'img', accessibleName: '' }), makeAction({ interactionType: 'none' }));
      expect(report.wcagLevel).toBe('none');
    });
  });
});
