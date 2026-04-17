/**
 * multimodalAccessibility.ts — Multi-Modal Accessibility Checker
 *
 * Vision-Language-Action (VLA) transformer-inspired WCAG 2.1 compliance checker
 * that detects cross-modal alignment issues invisible to single-modality tools.
 *
 * Modalities checked:
 *   VISION  — alt text, color contrast, visible focus, image descriptions
 *   LANGUAGE — aria-label, heading hierarchy, text readability, role semantics
 *   ACTION  — keyboard nav, focus management, click target size, ARIA interactions
 *
 * @module multimodalAccessibility
 */

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export type ModalityType = 'vision' | 'language' | 'action';

export type WCAGLevel = 'A' | 'AA' | 'AAA';

export type AlignmentSeverity = 'pass' | 'warning' | 'error';

export interface ComponentDescriptor {
  /** Unique identifier for the component being audited */
  id: string;
  /** Human-readable component name */
  name: string;
  /** Vision modality attributes */
  vision: VisionAttributes;
  /** Language modality attributes */
  language: LanguageAttributes;
  /** Action modality attributes */
  action: ActionAttributes;
}

export interface VisionAttributes {
  /** Alt text provided for images */
  altText?: string;
  /** Hex foreground color (e.g. '#000000') */
  foregroundColor?: string;
  /** Hex background color */
  backgroundColor?: string;
  /** Whether the component has a visible focus indicator */
  hasFocusIndicator?: boolean;
  /** Icon-only element (no visible label) */
  isIconOnly?: boolean;
  /** Minimum bounding box in CSS pixels */
  boundingBoxPx?: { width: number; height: number };
}

export interface LanguageAttributes {
  /** aria-label value */
  ariaLabel?: string;
  /** aria-describedby target text (pre-resolved) */
  ariaDescription?: string;
  /** Semantic role (button, link, checkbox, etc.) */
  role?: string;
  /** Visible text content */
  textContent?: string;
  /** Heading level (1-6), if element is a heading */
  headingLevel?: number;
  /** Reading complexity score (0-100, Flesch-Kincaid inspired) */
  readabilityScore?: number;
}

export interface ActionAttributes {
  /** Whether element is keyboard-focusable */
  isFocusable?: boolean;
  /** Whether element responds to Enter/Space keyboard events */
  hasKeyboardHandler?: boolean;
  /** Tab index value */
  tabIndex?: number;
  /** Whether element has pointer/click handler */
  hasClickHandler?: boolean;
  /** Whether ARIA live region is configured */
  hasLiveRegion?: boolean;
  /** Whether disabled state is communicated via ARIA */
  ariaDisabled?: boolean;
}

export interface AlignmentIssue {
  /** Modalities involved in the misalignment */
  modalities: ModalityType[];
  /** WCAG success criterion reference (e.g. '1.1.1') */
  wcagCriterion: string;
  /** WCAG conformance level */
  wcagLevel: WCAGLevel;
  /** Issue severity */
  severity: AlignmentSeverity;
  /** Human-readable description */
  description: string;
  /** Recommended fix */
  recommendation: string;
}

export interface ComponentAuditResult {
  componentId: string;
  componentName: string;
  issues: AlignmentIssue[];
  modalityScores: Record<ModalityType, number>;
  /** 0-100 overall cross-modal alignment score */
  alignmentScore: number;
  /** Highest WCAG level fully passed */
  wcagConformance: WCAGLevel | 'none';
}

export interface MultiModalAuditReport {
  auditedAt: string;
  totalComponents: number;
  results: ComponentAuditResult[];
  summary: AuditSummary;
}

export interface AuditSummary {
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  byModality: Record<ModalityType, number>;
  byCriterion: Record<string, number>;
  crossModalIssueCount: number;
  componentsFullyPassing: number;
}

// ═══════════════════════════════════════════════════════════════════
// Color contrast helpers (WCAG 1.4.3)
// ═══════════════════════════════════════════════════════════════════

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function relativeLuminance(r: number, g: number, b: number): number {
  const linearize = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function computeContrastRatio(fg: string, bg: string): number {
  const c1 = hexToRgb(fg);
  const c2 = hexToRgb(bg);
  const l1 = relativeLuminance(c1.r, c1.g, c1.b);
  const l2 = relativeLuminance(c2.r, c2.g, c2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ═══════════════════════════════════════════════════════════════════
// Vision checks
// ═══════════════════════════════════════════════════════════════════

function checkVision(comp: ComponentDescriptor): AlignmentIssue[] {
  const issues: AlignmentIssue[] = [];
  const { vision, language } = comp;

  // 1.1.1 Non-text content
  if (vision.isIconOnly && !language.ariaLabel && !vision.altText) {
    issues.push({
      modalities: ['vision', 'language'],
      wcagCriterion: '1.1.1',
      wcagLevel: 'A',
      severity: 'error',
      description: `Icon-only element has no alt text or aria-label. Screen readers have no description.`,
      recommendation: `Add aria-label="${comp.name}" or provide visually-hidden text.`,
    });
  }

  // 1.4.3 Contrast (minimum) — AA: 4.5:1 normal text
  if (vision.foregroundColor && vision.backgroundColor) {
    const ratio = computeContrastRatio(vision.foregroundColor, vision.backgroundColor);
    if (ratio < 3.0) {
      issues.push({
        modalities: ['vision'],
        wcagCriterion: '1.4.3',
        wcagLevel: 'AA',
        severity: 'error',
        description: `Contrast ratio ${ratio.toFixed(2)}:1 is below 3:1 minimum for large text / UI components.`,
        recommendation: `Increase contrast to at least 4.5:1 for normal text (3:1 for large text/UI).`,
      });
    } else if (ratio < 4.5) {
      issues.push({
        modalities: ['vision'],
        wcagCriterion: '1.4.3',
        wcagLevel: 'AA',
        severity: 'warning',
        description: `Contrast ratio ${ratio.toFixed(2)}:1 meets large-text threshold but not normal-text.`,
        recommendation: `Confirm this element uses large text (18pt+ or 14pt+ bold). If not, increase to 4.5:1.`,
      });
    }
  }

  // 2.4.7 Focus visible
  if (vision.hasFocusIndicator === false) {
    issues.push({
      modalities: ['vision', 'action'],
      wcagCriterion: '2.4.7',
      wcagLevel: 'AA',
      severity: 'error',
      description: `No visible focus indicator. Keyboard users cannot track focus position.`,
      recommendation: `Add :focus-visible CSS outline or equivalent visible indicator.`,
    });
  }

  // 2.5.5 Target size
  if (vision.boundingBoxPx) {
    const { width, height } = vision.boundingBoxPx;
    if (width < 24 || height < 24) {
      issues.push({
        modalities: ['vision', 'action'],
        wcagCriterion: '2.5.5',
        wcagLevel: 'AA',
        severity: 'error',
        description: `Touch target ${width}×${height}px is below 24×24px minimum.`,
        recommendation: `Increase touch target to at least 24×24px.`,
      });
    } else if (width < 44 || height < 44) {
      issues.push({
        modalities: ['vision', 'action'],
        wcagCriterion: '2.5.5',
        wcagLevel: 'AAA',
        severity: 'warning',
        description: `Touch target ${width}×${height}px is below 44×44px WCAG 2.5.5 recommendation.`,
        recommendation: `Increase touch target to at least 44×44px (AA target: 24×24px minimum).`,
      });
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════
// Language checks
// ═══════════════════════════════════════════════════════════════════

function checkLanguage(comp: ComponentDescriptor): AlignmentIssue[] {
  const issues: AlignmentIssue[] = [];
  const { language, action } = comp;

  // 4.1.2 Name, role, value — interactive elements must have accessible name
  const isInteractive = action.isFocusable || action.hasClickHandler;
  const hasAccessibleName = language.ariaLabel || language.textContent || language.ariaDescription;
  if (isInteractive && !hasAccessibleName) {
    issues.push({
      modalities: ['language', 'action'],
      wcagCriterion: '4.1.2',
      wcagLevel: 'A',
      severity: 'error',
      description: `Interactive element has no accessible name (no aria-label, text content, or aria-describedby).`,
      recommendation: `Add aria-label or visible text content. Action without language descriptor is invisible to AT.`,
    });
  }

  // 4.1.2 Role semantics — if no explicit role on interactive element
  if (isInteractive && !language.role) {
    issues.push({
      modalities: ['language', 'action'],
      wcagCriterion: '4.1.2',
      wcagLevel: 'A',
      severity: 'warning',
      description: `Interactive element has no explicit ARIA role. Implicit semantics may be ambiguous.`,
      recommendation: `Add role="button" or use native <button>/<a> elements.`,
    });
  }

  // 1.3.1 Info and relationships — heading validity
  if (language.headingLevel !== undefined) {
    if (language.headingLevel < 1 || language.headingLevel > 6) {
      issues.push({
        modalities: ['language'],
        wcagCriterion: '1.3.1',
        wcagLevel: 'A',
        severity: 'error',
        description: `Invalid heading level ${language.headingLevel}. Must be 1-6.`,
        recommendation: `Use heading levels 1-6 to convey document structure.`,
      });
    }
  }

  // 3.1.5 Reading level (AAA)
  if (language.readabilityScore !== undefined && language.readabilityScore < 30) {
    issues.push({
      modalities: ['language'],
      wcagCriterion: '3.1.5',
      wcagLevel: 'AAA',
      severity: 'warning',
      description: `Readability score ${language.readabilityScore}/100 suggests complex language (college+ level).`,
      recommendation: `Simplify language to 8th-grade reading level or provide a simplified summary.`,
    });
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════
// Action checks
// ═══════════════════════════════════════════════════════════════════

function checkAction(comp: ComponentDescriptor): AlignmentIssue[] {
  const issues: AlignmentIssue[] = [];
  const { action, language } = comp;

  // 2.1.1 Keyboard — click handler without keyboard handler
  if (action.hasClickHandler && !action.hasKeyboardHandler && !action.isFocusable) {
    issues.push({
      modalities: ['action'],
      wcagCriterion: '2.1.1',
      wcagLevel: 'A',
      severity: 'error',
      description: `Element has click handler but is not keyboard-accessible (no keyboard handler, not focusable).`,
      recommendation: `Add keyboard event handler (Enter/Space) and ensure element is focusable (tabIndex="0" or native button).`,
    });
  }

  // 2.1.1 Keyboard + 4.1.2 — focusable element without keyboard handler
  if (action.isFocusable && action.tabIndex !== undefined && action.tabIndex >= 0
      && !action.hasKeyboardHandler && language.role && language.role !== 'link') {
    issues.push({
      modalities: ['action', 'language'],
      wcagCriterion: '2.1.1',
      wcagLevel: 'A',
      severity: 'warning',
      description: `Element is focusable (tabIndex=${action.tabIndex}) with role="${language.role}" but has no keyboard handler.`,
      recommendation: `Add onKeyDown handler for Enter/Space to match pointer interaction.`,
    });
  }

  // Live region for dynamic content
  if (action.hasLiveRegion === false && language.role === 'status') {
    issues.push({
      modalities: ['language', 'action'],
      wcagCriterion: '4.1.3',
      wcagLevel: 'AA',
      severity: 'warning',
      description: `Element has role="status" but no aria-live region is configured.`,
      recommendation: `Add aria-live="polite" to ensure status updates are announced.`,
    });
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════
// Cross-modal alignment check
// ═══════════════════════════════════════════════════════════════════

function checkCrossModalAlignment(comp: ComponentDescriptor): AlignmentIssue[] {
  const issues: AlignmentIssue[] = [];
  const { vision, language, action } = comp;

  // Vision label ≠ language label mismatch (tooltip vs aria-label)
  const visibleLabel = vision.isIconOnly ? undefined : language.textContent;
  if (visibleLabel && language.ariaLabel && language.ariaLabel !== visibleLabel) {
    issues.push({
      modalities: ['vision', 'language'],
      wcagCriterion: '2.5.3',
      wcagLevel: 'A',
      severity: 'error',
      description: `Label in Name mismatch: visible text "${visibleLabel}" does not match aria-label "${language.ariaLabel}".`,
      recommendation: `aria-label must start with visible text content per WCAG 2.5.3.`,
    });
  }

  // Invisible button (no vision indicator but has action)
  if (action.hasClickHandler && !language.textContent && !vision.altText && !language.ariaLabel) {
    issues.push({
      modalities: ['vision', 'language', 'action'],
      wcagCriterion: '1.1.1',
      wcagLevel: 'A',
      severity: 'error',
      description: `Element has action but no visual or textual identity across all three modalities.`,
      recommendation: `Provide visible label, alt text, or aria-label to anchor the element in all modalities.`,
    });
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════
// Scoring
// ═══════════════════════════════════════════════════════════════════

function computeModalityScore(issues: AlignmentIssue[], modality: ModalityType): number {
  const relevant = issues.filter((i) => i.modalities.includes(modality));
  const errorPenalty = relevant.filter((i) => i.severity === 'error').length * 20;
  const warnPenalty = relevant.filter((i) => i.severity === 'warning').length * 5;
  return Math.max(0, 100 - errorPenalty - warnPenalty);
}

function determineWcagConformance(issues: AlignmentIssue[]): WCAGLevel | 'none' {
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length === 0) {
    const aaErrors = issues.filter((i) => i.severity === 'error' && i.wcagLevel === 'AA');
    if (aaErrors.length === 0) return 'AA';
    return 'A';
  }
  const levelAErrors = errors.filter((i) => i.wcagLevel === 'A');
  if (levelAErrors.length > 0) return 'none';
  return 'A';
}

// ═══════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════

/**
 * Check a single component for cross-modal alignment issues.
 *
 * @example
 * ```ts
 * const result = checkAlignment({
 *   id: 'btn-save',
 *   name: 'Save button',
 *   vision: { isIconOnly: true, hasFocusIndicator: true, boundingBoxPx: { width: 40, height: 40 } },
 *   language: { ariaLabel: 'Save changes', role: 'button' },
 *   action: { isFocusable: true, hasKeyboardHandler: true, hasClickHandler: true, tabIndex: 0 },
 * });
 * ```
 */
export function checkAlignment(comp: ComponentDescriptor): ComponentAuditResult {
  const visionIssues = checkVision(comp);
  const languageIssues = checkLanguage(comp);
  const actionIssues = checkAction(comp);
  const crossModalIssues = checkCrossModalAlignment(comp);

  const allIssues = [...visionIssues, ...languageIssues, ...actionIssues, ...crossModalIssues];

  const modalityScores: Record<ModalityType, number> = {
    vision: computeModalityScore(allIssues, 'vision'),
    language: computeModalityScore(allIssues, 'language'),
    action: computeModalityScore(allIssues, 'action'),
  };

  const alignmentScore = Math.round(
    (modalityScores.vision + modalityScores.language + modalityScores.action) / 3,
  );

  return {
    componentId: comp.id,
    componentName: comp.name,
    issues: allIssues,
    modalityScores,
    alignmentScore,
    wcagConformance: determineWcagConformance(allIssues),
  };
}

/**
 * Audit multiple components and produce a full report.
 */
export function auditComponents(components: ComponentDescriptor[]): MultiModalAuditReport {
  const results = components.map(checkAlignment);

  const allIssues = results.flatMap((r) => r.issues);

  const byModality: Record<ModalityType, number> = { vision: 0, language: 0, action: 0 };
  const byCriterion: Record<string, number> = {};

  for (const issue of allIssues) {
    for (const m of issue.modalities) byModality[m]++;
    byCriterion[issue.wcagCriterion] = (byCriterion[issue.wcagCriterion] ?? 0) + 1;
  }

  const crossModalIssueCount = allIssues.filter((i) => i.modalities.length > 1).length;

  const summary: AuditSummary = {
    totalIssues: allIssues.length,
    errorCount: allIssues.filter((i) => i.severity === 'error').length,
    warningCount: allIssues.filter((i) => i.severity === 'warning').length,
    byModality,
    byCriterion,
    crossModalIssueCount,
    componentsFullyPassing: results.filter((r) => r.issues.length === 0).length,
  };

  return {
    auditedAt: new Date().toISOString(),
    totalComponents: components.length,
    results,
    summary,
  };
}
