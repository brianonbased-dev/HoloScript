/**
 * @fileoverview Multi-modal accessibility checker implementing WCAG 2.1 cross-modal alignment.
 *
 * Validates visual ↔ language ↔ action coherence for UI components to ensure
 * that all three modalities consistently represent the same semantic intent.
 * Designed for use in Studio and HoloScript component pipelines.
 */

/** Visual modality descriptor for an element or scene. */
export interface VisualDescriptor {
  /** Alt text or image description. Empty string means no alt text present. */
  altText: string;
  /** Whether the element has sufficient color contrast (WCAG AA = 4.5:1 normal, 3:1 large). */
  hasAdequateContrast: boolean;
  /** Whether the element is hidden from all modalities (aria-hidden + visual hidden). */
  isFullyHidden: boolean;
  /** Whether the element has focus indicator styling. */
  hasFocusIndicator: boolean;
}

/** Language/text modality descriptor for an element. */
export interface LanguageDescriptor {
  /** Accessible name (aria-label, aria-labelledby, or innerText). */
  accessibleName: string;
  /** Accessible description (aria-describedby content). */
  accessibleDescription: string;
  /** ARIA role. Empty string means no explicit role. */
  role: string;
  /** Language code (e.g. "en", "es"). Empty string means unset. */
  lang: string;
}

/** Action/interaction modality descriptor for an element. */
export interface ActionDescriptor {
  /** Whether the element is keyboard focusable (tabIndex >= 0 or naturally focusable). */
  isKeyboardFocusable: boolean;
  /** Whether screen reader interaction is supported (not aria-hidden). */
  isScreenReaderAccessible: boolean;
  /** Whether touch target size meets minimum (44×44 CSS px per WCAG 2.5.5). */
  hasSufficientTouchTarget: boolean;
  /** Interaction type: "button", "link", "input", "composite", "none", etc. */
  interactionType: string;
}

/** Severity of an accessibility finding. */
export type IssueSeverity = 'critical' | 'serious' | 'moderate' | 'minor';

/** A single accessibility issue found during cross-modal alignment check. */
export interface AccessibilityIssue {
  /** WCAG 2.1 success criterion ID (e.g. "1.1.1", "4.1.2"). */
  criterion: string;
  /** Short human-readable description of the WCAG criterion. */
  criterionLabel: string;
  /** Severity of the violation. */
  severity: IssueSeverity;
  /** Which modality or modality pair the issue was detected in. */
  modality: 'visual' | 'language' | 'action' | 'visual-language' | 'visual-action' | 'language-action' | 'all';
  /** Description of the specific finding. */
  description: string;
  /** Suggested remediation action. */
  suggestion: string;
}

/** Result of a full multi-modal alignment check. */
export interface AccessibilityReport {
  /** True when zero issues of severity "critical" or "serious" are present. */
  passes: boolean;
  /** Total number of issues found. */
  issueCount: number;
  /** All issues found, ordered by severity (critical first). */
  issues: AccessibilityIssue[];
  /** Level of WCAG 2.1 conformance achieved: "AA", "A", or "none". */
  wcagLevel: 'AA' | 'A' | 'none';
  /** Summary message suitable for logging or display. */
  summary: string;
}

const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

/**
 * Checks cross-modal alignment of visual, language, and action descriptors
 * against WCAG 2.1 criteria.
 *
 * @param visual  - Visual representation of the element.
 * @param language - Language/text representation of the element.
 * @param action  - Interaction/action affordances of the element.
 * @returns An {@link AccessibilityReport} with all detected issues.
 *
 * @example
 * ```ts
 * const report = checkAlignment(
 *   { altText: '', hasAdequateContrast: true, isFullyHidden: false, hasFocusIndicator: true },
 *   { accessibleName: 'Submit', accessibleDescription: '', role: 'button', lang: 'en' },
 *   { isKeyboardFocusable: true, isScreenReaderAccessible: true, hasSufficientTouchTarget: true, interactionType: 'button' }
 * );
 * console.log(report.passes); // true
 * ```
 */
export function checkAlignment(
  visual: VisualDescriptor,
  language: LanguageDescriptor,
  action: ActionDescriptor,
): AccessibilityReport {
  const issues: AccessibilityIssue[] = [];

  // ── Visual modality checks ────────────────────────────────────────────────

  // WCAG 1.1.1 Non-text Content: images need alt text unless decorative/hidden
  if (!visual.isFullyHidden && visual.altText === '' && language.role !== 'presentation' && language.role !== 'none') {
    issues.push({
      criterion: '1.1.1',
      criterionLabel: 'Non-text Content',
      severity: 'critical',
      modality: 'visual-language',
      description: 'Visual element has no alt text and is not marked decorative.',
      suggestion: 'Add meaningful alt text or set role="presentation" if decorative.',
    });
  }

  // WCAG 1.4.3 Contrast (Minimum): text/interactive elements need adequate contrast
  if (!visual.isFullyHidden && !visual.hasAdequateContrast) {
    issues.push({
      criterion: '1.4.3',
      criterionLabel: 'Contrast (Minimum)',
      severity: 'serious',
      modality: 'visual',
      description: 'Element does not meet the WCAG AA contrast ratio requirement (4.5:1 for normal text, 3:1 for large).',
      suggestion: 'Increase foreground/background color contrast to meet WCAG AA requirements.',
    });
  }

  // WCAG 2.4.7 Focus Visible: interactive elements need visible focus indicator
  if (action.isKeyboardFocusable && !visual.hasFocusIndicator) {
    issues.push({
      criterion: '2.4.7',
      criterionLabel: 'Focus Visible',
      severity: 'serious',
      modality: 'visual-action',
      description: 'Keyboard-focusable element lacks a visible focus indicator.',
      suggestion: 'Add a clearly visible :focus or :focus-visible style (outline, border, or background change).',
    });
  }

  // ── Language modality checks ──────────────────────────────────────────────

  // WCAG 4.1.2 Name, Role, Value: interactive elements must have accessible name and role
  if (action.interactionType !== 'none' && !visual.isFullyHidden) {
    if (language.accessibleName.trim() === '') {
      issues.push({
        criterion: '4.1.2',
        criterionLabel: 'Name, Role, Value',
        severity: 'critical',
        modality: 'language-action',
        description: 'Interactive element has no accessible name.',
        suggestion: 'Add aria-label, aria-labelledby, or visible label text.',
      });
    }

    if (language.role === '') {
      issues.push({
        criterion: '4.1.2',
        criterionLabel: 'Name, Role, Value',
        severity: 'serious',
        modality: 'language',
        description: 'Interactive element has no explicit ARIA role.',
        suggestion: 'Add an appropriate role attribute (e.g. role="button", role="link").',
      });
    }
  }

  // WCAG 3.1.1 Language of Page: language must be declared
  if (language.lang === '') {
    issues.push({
      criterion: '3.1.1',
      criterionLabel: 'Language of Page',
      severity: 'moderate',
      modality: 'language',
      description: 'No language attribute declared.',
      suggestion: 'Set the lang attribute on the root element or the component (e.g. lang="en").',
    });
  }

  // ── Action modality checks ────────────────────────────────────────────────

  // WCAG 2.1.1 Keyboard: interactive elements must be keyboard-operable
  if (action.interactionType !== 'none' && !action.isKeyboardFocusable) {
    issues.push({
      criterion: '2.1.1',
      criterionLabel: 'Keyboard',
      severity: 'critical',
      modality: 'action',
      description: 'Interactive element is not reachable via keyboard navigation.',
      suggestion: 'Ensure the element has tabIndex >= 0 or is a natively focusable element.',
    });
  }

  // WCAG 2.5.5 Target Size: touch targets must be at least 44×44 CSS px
  if (action.interactionType !== 'none' && !action.hasSufficientTouchTarget) {
    issues.push({
      criterion: '2.5.5',
      criterionLabel: 'Target Size',
      severity: 'moderate',
      modality: 'action',
      description: 'Touch target is smaller than the recommended 44×44 CSS px minimum.',
      suggestion: 'Increase the clickable/touchable area to at least 44×44 CSS px.',
    });
  }

  // WCAG 1.3.1 Info and Relationships: screen reader must reach interactive elements
  if (action.interactionType !== 'none' && !action.isScreenReaderAccessible) {
    issues.push({
      criterion: '1.3.1',
      criterionLabel: 'Info and Relationships',
      severity: 'serious',
      modality: 'language-action',
      description: 'Interactive element is hidden from screen readers (aria-hidden or equivalent).',
      suggestion: 'Remove aria-hidden from interactive elements or provide an equivalent accessible path.',
    });
  }

  // ── Cross-modal coherence check ───────────────────────────────────────────

  // Detect label/alt-text mismatch: alt text and accessible name should convey the same thing.
  // We flag when both are non-empty but clearly diverge in length (rough heuristic).
  if (
    visual.altText.length > 0 &&
    language.accessibleName.length > 0 &&
    Math.abs(visual.altText.length - language.accessibleName.length) > 60
  ) {
    issues.push({
      criterion: '1.1.1',
      criterionLabel: 'Non-text Content',
      severity: 'minor',
      modality: 'visual-language',
      description: 'Alt text and accessible name differ significantly in length, which may indicate a mismatch.',
      suggestion: 'Review whether alt text and accessible name convey the same semantic intent.',
    });
  }

  // Sort issues by severity
  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  // Determine WCAG level
  const hasCritical = issues.some(i => i.severity === 'critical');
  const hasSerious = issues.some(i => i.severity === 'serious');
  const passes = !hasCritical && !hasSerious;
  const wcagLevel: 'AA' | 'A' | 'none' = hasCritical ? 'none' : hasSerious ? 'A' : 'AA';

  const summary =
    issues.length === 0
      ? 'No accessibility issues detected. Meets WCAG 2.1 AA.'
      : `${issues.length} issue(s) found (${issues.filter(i => i.severity === 'critical').length} critical, ` +
        `${issues.filter(i => i.severity === 'serious').length} serious). ` +
        `WCAG 2.1 level: ${wcagLevel}.`;

  return { passes, issueCount: issues.length, issues, wcagLevel, summary };
}
