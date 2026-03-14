/**
 * VRAccessibilityAuditTool.ts
 *
 * Automated accessibility checker for VR/AR scenes.
 * Implements checks against WCAG 2.1, XR Accessibility User Requirements
 * (W3C XR-ACCESS), and platform-specific accessibility guidelines.
 *
 * Checks include:
 * - Contrast ratios for 3D text and UI panels
 * - Interaction reach zones (ergonomic reachability)
 * - Motion sensitivity (velocity, acceleration, vection triggers)
 * - Audio descriptions and spatial audio accessibility
 * - Haptic alternatives for visual/audio cues
 * - Color blindness simulation
 * - Photosensitive seizure risk (flashing/strobing)
 * - Text readability (size, distance, resolution)
 * - Interaction timeout adequacy
 * - Alternative input method support
 *
 * @module VRAccessibilityAuditTool
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Color {
  r: number;  // 0..255
  g: number;
  b: number;
  a: number;  // 0..1
}

/**
 * Severity levels for audit findings.
 */
export type Severity = 'critical' | 'major' | 'minor' | 'info';

/**
 * WCAG conformance levels.
 */
export type ConformanceLevel = 'A' | 'AA' | 'AAA';

/**
 * Categories of accessibility checks.
 */
export type AuditCategory =
  | 'visual'
  | 'auditory'
  | 'motor'
  | 'cognitive'
  | 'vestibular'
  | 'photosensitive'
  | 'input'
  | 'text'
  | 'interaction'
  | 'navigation'
  | 'haptic';

/**
 * Color vision deficiency types.
 */
export type ColorVisionDeficiency =
  | 'protanopia'     // No red cones
  | 'deuteranopia'   // No green cones
  | 'tritanopia'     // No blue cones
  | 'protanomaly'    // Weak red cones
  | 'deuteranomaly'  // Weak green cones
  | 'tritanomaly'    // Weak blue cones
  | 'achromatopsia'  // Complete color blindness
  | 'normal';

/**
 * A single audit finding.
 */
export interface AuditFinding {
  id: string;
  category: AuditCategory;
  severity: Severity;
  wcagCriteria: string;          // e.g., "1.4.3" (Contrast)
  wcagLevel: ConformanceLevel;
  title: string;
  description: string;
  objectId?: string;
  objectName?: string;
  position?: Vec3;
  currentValue?: unknown;
  requiredValue?: unknown;
  recommendation: string;
  autoFixAvailable: boolean;
}

/**
 * Audit report summary.
 */
export interface AuditReport {
  projectName: string;
  sceneId: string;
  timestamp: number;
  duration: number;  // ms
  conformanceTarget: ConformanceLevel;
  findings: AuditFinding[];
  summary: AuditSummary;
  score: AccessibilityScore;
  metadata: Record<string, unknown>;
}

/**
 * Summary statistics for the audit.
 */
export interface AuditSummary {
  totalChecks: number;
  totalFindings: number;
  critical: number;
  major: number;
  minor: number;
  info: number;
  categoryCounts: Record<AuditCategory, number>;
  passed: number;
  failed: number;
}

/**
 * Accessibility score (0..100).
 */
export interface AccessibilityScore {
  overall: number;
  visual: number;
  auditory: number;
  motor: number;
  cognitive: number;
  vestibular: number;
}

/**
 * Scene object for audit analysis.
 */
export interface AuditableObject {
  id: string;
  name: string;
  type: 'mesh' | 'text' | 'ui-panel' | 'light' | 'audio-source' | 'interaction-zone' | 'particle' | 'other';
  position: Vec3;
  scale: Vec3;
  visible: boolean;

  // Visual properties
  foregroundColor?: Color;
  backgroundColor?: Color;
  emissiveColor?: Color;
  opacity?: number;

  // Text properties (for text/ui-panel types)
  text?: string;
  fontSize?: number;          // in world units
  fontWeight?: number;        // 100..900
  textContrast?: number;

  // Interaction properties
  isInteractable?: boolean;
  interactionType?: 'grab' | 'poke' | 'gaze' | 'voice' | 'raycast' | 'proximity';
  interactionTimeout?: number;  // ms
  hasAudioFeedback?: boolean;
  hasHapticFeedback?: boolean;
  hasVisualFeedback?: boolean;

  // Audio properties
  hasAudioDescription?: boolean;
  audioDescriptionText?: string;
  isSpatialAudio?: boolean;
  audioVolume?: number;
  audioFalloff?: number;

  // Animation properties
  hasAnimation?: boolean;
  animationSpeed?: number;
  isFlashing?: boolean;
  flashFrequency?: number;  // Hz

  // Accessibility metadata
  altText?: string;
  ariaRole?: string;
  ariaLabel?: string;
  tabIndex?: number;

  // Custom properties
  metadata?: Record<string, unknown>;
}

/**
 * Reach zone analysis for ergonomic interaction placement.
 */
export interface ReachZone {
  /** Zone name */
  name: string;
  /** Center position relative to headset */
  center: Vec3;
  /** Radius in meters */
  radius: number;
  /** Comfort level (0..1, higher = more comfortable) */
  comfort: number;
  /** Whether prolonged interaction is sustainable */
  sustainableForExtendedUse: boolean;
}

/**
 * Motion analysis result for vestibular safety.
 */
export interface MotionAnalysis {
  /** Maximum camera velocity (m/s) */
  maxCameraVelocity: number;
  /** Maximum camera acceleration (m/s^2) */
  maxCameraAcceleration: number;
  /** Maximum rotation velocity (deg/s) */
  maxRotationVelocity: number;
  /** Vection-inducing elements present */
  vectionRisk: boolean;
  /** Artificial locomotion used */
  artificialLocomotion: boolean;
  /** Comfort options available */
  comfortOptionsPresent: boolean;
  /** Teleportation alternative available */
  teleportAvailable: boolean;
  /** Vignette during movement */
  vignettePresent: boolean;
  /** Snap turn available */
  snapTurnAvailable: boolean;
}

/**
 * Audit configuration.
 */
export interface AuditConfig {
  /** Target conformance level */
  conformanceLevel?: ConformanceLevel;
  /** Categories to check (empty = all) */
  categories?: AuditCategory[];
  /** Include info-level findings */
  includeInfoFindings?: boolean;
  /** Player height range for reach analysis [min, max] in meters */
  playerHeightRange?: [number, number];
  /** Seated mode support required */
  requireSeatedMode?: boolean;
  /** Standing mode support required */
  requireStandingMode?: boolean;
  /** Minimum text size in world units */
  minTextSize?: number;
  /** Maximum comfortable interaction distance in meters */
  maxInteractionDistance?: number;
  /** Minimum comfortable interaction distance in meters */
  minInteractionDistance?: number;
  /** Flash frequency threshold (Hz) for photosensitive check */
  flashThresholdHz?: number;
  /** Maximum flash area as fraction of viewport (0..1) */
  maxFlashArea?: number;
}

// =============================================================================
// Event Types
// =============================================================================

export type AuditEventType =
  | 'audit-started'
  | 'audit-progress'
  | 'audit-completed'
  | 'finding-detected'
  | 'auto-fix-applied'
  | 'error';

export interface AuditEvent {
  type: AuditEventType;
  timestamp: number;
  data?: unknown;
}

type EventHandler = (event: AuditEvent) => void;

// =============================================================================
// Scene Adapter
// =============================================================================

/**
 * Platform-provided adapter for reading scene objects.
 */
export interface SceneAuditAdapter {
  /** Get all auditable objects in the scene */
  getAuditableObjects(): AuditableObject[];
  /** Get the player/headset position */
  getPlayerPosition(): Vec3;
  /** Get the player/headset height */
  getPlayerHeight(): number;
  /** Measure the distance between two objects */
  getDistance(objectIdA: string, objectIdB: string): number;
  /** Get the angular size of an object from the player's viewpoint (degrees) */
  getAngularSize(objectId: string): number;
  /** Check if an object is within the player's field of view */
  isInFieldOfView(objectId: string): boolean;
  /** Get the current motion analysis data */
  getMotionAnalysis(): MotionAnalysis;
  /** Apply an auto-fix to an object */
  applyFix(objectId: string, property: string, value: unknown): void;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * WCAG 2.1 minimum contrast ratios.
 */
const CONTRAST_RATIOS = {
  /** AA normal text */
  AA_NORMAL: 4.5,
  /** AA large text (18pt+ or 14pt bold) */
  AA_LARGE: 3.0,
  /** AAA normal text */
  AAA_NORMAL: 7.0,
  /** AAA large text */
  AAA_LARGE: 4.5,
  /** Non-text UI components */
  UI_COMPONENT: 3.0,
};

/**
 * Comfortable VR interaction zones (standing, average height).
 * Based on ergonomic research for extended VR use.
 */
const REACH_ZONES: ReachZone[] = [
  {
    name: 'primary',
    center: { x: 0, y: -0.2, z: -0.5 },
    radius: 0.4,
    comfort: 1.0,
    sustainableForExtendedUse: true,
  },
  {
    name: 'secondary',
    center: { x: 0, y: 0, z: -0.65 },
    radius: 0.5,
    comfort: 0.8,
    sustainableForExtendedUse: true,
  },
  {
    name: 'extended',
    center: { x: 0, y: 0.1, z: -0.8 },
    radius: 0.3,
    comfort: 0.5,
    sustainableForExtendedUse: false,
  },
  {
    name: 'overhead',
    center: { x: 0, y: 0.6, z: -0.3 },
    radius: 0.3,
    comfort: 0.2,
    sustainableForExtendedUse: false,
  },
  {
    name: 'floor-level',
    center: { x: 0, y: -1.0, z: -0.5 },
    radius: 0.3,
    comfort: 0.1,
    sustainableForExtendedUse: false,
  },
];

/**
 * Photosensitive seizure risk thresholds.
 * Based on WCAG 2.3.1 (Three Flashes or Below Threshold).
 */
const FLASH_THRESHOLDS = {
  /** Max flashes per second (WCAG 2.3.1) */
  MAX_FLASHES_PER_SECOND: 3,
  /** Max general flash area as fraction of viewport */
  MAX_GENERAL_FLASH_AREA: 0.25,
  /** Max red flash area */
  MAX_RED_FLASH_AREA: 0.25,
};

/**
 * Motion comfort thresholds.
 */
const MOTION_THRESHOLDS = {
  /** Max comfortable camera velocity (m/s) */
  MAX_CAMERA_VELOCITY: 3.0,
  /** Max comfortable camera acceleration (m/s^2) */
  MAX_CAMERA_ACCELERATION: 5.0,
  /** Max comfortable rotation velocity (deg/s) */
  MAX_ROTATION_VELOCITY: 90,
};

// =============================================================================
// Utility Functions
// =============================================================================

function generateFindingId(): string {
  return `finding_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
}

function vec3Distance(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate relative luminance per WCAG 2.1 definition.
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(color: Color): number {
  const sRGBtoLinear = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  const R = sRGBtoLinear(color.r);
  const G = sRGBtoLinear(color.g);
  const B = sRGBtoLinear(color.b);

  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Calculate contrast ratio between two colors per WCAG 2.1.
 */
function contrastRatio(foreground: Color, background: Color): number {
  const L1 = relativeLuminance(foreground);
  const L2 = relativeLuminance(background);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Simulate color vision deficiency transformation.
 * Uses the Brettel, Vienot & Mollon (1997) algorithm.
 */
function simulateColorVisionDeficiency(color: Color, deficiency: ColorVisionDeficiency): Color {
  if (deficiency === 'normal') return { ...color };

  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;

  let simR = r, simG = g, simB = b;

  // Simplified transformation matrices
  switch (deficiency) {
    case 'protanopia':
      simR = 0.567 * r + 0.433 * g + 0.0 * b;
      simG = 0.558 * r + 0.442 * g + 0.0 * b;
      simB = 0.0 * r + 0.242 * g + 0.758 * b;
      break;
    case 'deuteranopia':
      simR = 0.625 * r + 0.375 * g + 0.0 * b;
      simG = 0.7 * r + 0.3 * g + 0.0 * b;
      simB = 0.0 * r + 0.3 * g + 0.7 * b;
      break;
    case 'tritanopia':
      simR = 0.95 * r + 0.05 * g + 0.0 * b;
      simG = 0.0 * r + 0.433 * g + 0.567 * b;
      simB = 0.0 * r + 0.475 * g + 0.525 * b;
      break;
    case 'protanomaly':
      simR = 0.817 * r + 0.183 * g + 0.0 * b;
      simG = 0.333 * r + 0.667 * g + 0.0 * b;
      simB = 0.0 * r + 0.125 * g + 0.875 * b;
      break;
    case 'deuteranomaly':
      simR = 0.8 * r + 0.2 * g + 0.0 * b;
      simG = 0.258 * r + 0.742 * g + 0.0 * b;
      simB = 0.0 * r + 0.142 * g + 0.858 * b;
      break;
    case 'tritanomaly':
      simR = 0.967 * r + 0.033 * g + 0.0 * b;
      simG = 0.0 * r + 0.733 * g + 0.267 * b;
      simB = 0.0 * r + 0.183 * g + 0.817 * b;
      break;
    case 'achromatopsia': {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      simR = gray;
      simG = gray;
      simB = gray;
      break;
    }
  }

  return {
    r: Math.round(Math.min(1, Math.max(0, simR)) * 255),
    g: Math.round(Math.min(1, Math.max(0, simG)) * 255),
    b: Math.round(Math.min(1, Math.max(0, simB)) * 255),
    a: color.a,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// =============================================================================
// VRAccessibilityAuditTool
// =============================================================================

/**
 * VRAccessibilityAuditTool performs comprehensive accessibility analysis
 * on VR/AR scenes, checking against WCAG 2.1 and XR-specific guidelines.
 */
export class VRAccessibilityAuditTool {
  // Configuration
  private config: Required<AuditConfig>;

  // Scene adapter
  private sceneAdapter: SceneAuditAdapter | null = null;

  // Findings
  private findings: AuditFinding[] = [];

  // Check counters
  private totalChecks: number = 0;
  private passedChecks: number = 0;

  // Events
  private eventHandlers: Map<AuditEventType, Set<EventHandler>> = new Map();

  constructor(config: AuditConfig = {}) {
    this.config = {
      conformanceLevel: config.conformanceLevel ?? 'AA',
      categories: config.categories ?? [],
      includeInfoFindings: config.includeInfoFindings ?? true,
      playerHeightRange: config.playerHeightRange ?? [1.4, 2.0],
      requireSeatedMode: config.requireSeatedMode ?? true,
      requireStandingMode: config.requireStandingMode ?? true,
      minTextSize: config.minTextSize ?? 0.02,
      maxInteractionDistance: config.maxInteractionDistance ?? 2.0,
      minInteractionDistance: config.minInteractionDistance ?? 0.2,
      flashThresholdHz: config.flashThresholdHz ?? 3,
      maxFlashArea: config.maxFlashArea ?? 0.25,
    };
  }

  // ===========================================================================
  // Setup
  // ===========================================================================

  /**
   * Set the scene adapter for reading scene data.
   */
  setSceneAdapter(adapter: SceneAuditAdapter): void {
    this.sceneAdapter = adapter;
  }

  // ===========================================================================
  // Full Audit
  // ===========================================================================

  /**
   * Run a full accessibility audit on the current scene.
   */
  runAudit(sceneId: string = 'default', projectName: string = 'HoloScript Scene'): AuditReport {
    const startTime = performance.now();

    this.findings = [];
    this.totalChecks = 0;
    this.passedChecks = 0;

    this.emitEvent('audit-started', { sceneId, projectName });

    if (!this.sceneAdapter) {
      this.addFinding({
        category: 'visual',
        severity: 'critical',
        wcagCriteria: 'N/A',
        wcagLevel: 'A',
        title: 'No scene adapter configured',
        description: 'Cannot perform audit without a scene adapter. Call setSceneAdapter() first.',
        recommendation: 'Provide a SceneAuditAdapter implementation.',
        autoFixAvailable: false,
      });
      return this.buildReport(sceneId, projectName, startTime);
    }

    const objects = this.sceneAdapter.getAuditableObjects();

    // Run all checks
    const categories = this.config.categories.length > 0
      ? this.config.categories
      : ['visual', 'auditory', 'motor', 'cognitive', 'vestibular', 'photosensitive', 'input', 'text', 'interaction', 'navigation', 'haptic'] as AuditCategory[];

    let progress = 0;
    const totalCategories = categories.length;

    for (const category of categories) {
      switch (category) {
        case 'visual':
          this.checkVisualAccessibility(objects);
          break;
        case 'auditory':
          this.checkAuditoryAccessibility(objects);
          break;
        case 'motor':
          this.checkMotorAccessibility(objects);
          break;
        case 'cognitive':
          this.checkCognitiveAccessibility(objects);
          break;
        case 'vestibular':
          this.checkVestibularSafety();
          break;
        case 'photosensitive':
          this.checkPhotosensitiveSafety(objects);
          break;
        case 'input':
          this.checkInputAccessibility(objects);
          break;
        case 'text':
          this.checkTextAccessibility(objects);
          break;
        case 'interaction':
          this.checkInteractionAccessibility(objects);
          break;
        case 'navigation':
          this.checkNavigationAccessibility(objects);
          break;
        case 'haptic':
          this.checkHapticAccessibility(objects);
          break;
      }

      progress++;
      this.emitEvent('audit-progress', {
        progress: progress / totalCategories,
        category,
        findingsSoFar: this.findings.length,
      });
    }

    const report = this.buildReport(sceneId, projectName, startTime);

    this.emitEvent('audit-completed', {
      totalFindings: report.findings.length,
      score: report.score.overall,
      duration: report.duration,
    });

    return report;
  }

  // ===========================================================================
  // Visual Accessibility Checks
  // ===========================================================================

  private checkVisualAccessibility(objects: AuditableObject[]): void {
    for (const obj of objects) {
      if (!obj.visible) continue;

      // Check contrast ratio for text elements
      if ((obj.type === 'text' || obj.type === 'ui-panel') && obj.foregroundColor && obj.backgroundColor) {
        this.checkContrastRatio(obj);
        this.checkColorBlindContrast(obj);
      }

      // Check alt text / aria labels
      if (obj.isInteractable && !obj.altText && !obj.ariaLabel) {
        this.totalChecks++;
        this.addFinding({
          category: 'visual',
          severity: 'major',
          wcagCriteria: '1.1.1',
          wcagLevel: 'A',
          title: 'Missing alternative text',
          description: `Interactable object "${obj.name}" has no alt text or ARIA label.`,
          objectId: obj.id,
          objectName: obj.name,
          position: obj.position,
          recommendation: 'Add altText or ariaLabel to provide text alternatives for non-text content.',
          autoFixAvailable: false,
        });
      } else if (obj.isInteractable) {
        this.totalChecks++;
        this.passedChecks++;
      }

      // Check opacity for visibility
      if (obj.opacity !== undefined && obj.opacity < 0.4 && obj.isInteractable) {
        this.totalChecks++;
        this.addFinding({
          category: 'visual',
          severity: 'minor',
          wcagCriteria: '1.4.1',
          wcagLevel: 'A',
          title: 'Low opacity interactable',
          description: `Interactable object "${obj.name}" has opacity ${obj.opacity.toFixed(2)}, which may be hard to see.`,
          objectId: obj.id,
          objectName: obj.name,
          currentValue: obj.opacity,
          requiredValue: 0.4,
          recommendation: 'Increase opacity to at least 0.4 for interactable objects.',
          autoFixAvailable: true,
        });
      }
    }
  }

  /**
   * Check WCAG contrast ratio requirements for a text/UI element.
   */
  private checkContrastRatio(obj: AuditableObject): void {
    if (!obj.foregroundColor || !obj.backgroundColor) return;

    this.totalChecks++;
    const ratio = contrastRatio(obj.foregroundColor, obj.backgroundColor);

    const isLargeText = (obj.fontSize ?? 0) > 0.04; // ~18pt equivalent
    const requiredAA = isLargeText ? CONTRAST_RATIOS.AA_LARGE : CONTRAST_RATIOS.AA_NORMAL;
    const requiredAAA = isLargeText ? CONTRAST_RATIOS.AAA_LARGE : CONTRAST_RATIOS.AAA_NORMAL;

    const required = this.config.conformanceLevel === 'AAA' ? requiredAAA : requiredAA;

    if (ratio < required) {
      this.addFinding({
        category: 'visual',
        severity: ratio < CONTRAST_RATIOS.AA_LARGE ? 'critical' : 'major',
        wcagCriteria: '1.4.3',
        wcagLevel: this.config.conformanceLevel === 'AAA' ? 'AAA' : 'AA',
        title: 'Insufficient contrast ratio',
        description: `"${obj.name}" has contrast ratio ${ratio.toFixed(2)}:1 (requires ${required}:1 at ${this.config.conformanceLevel} level).`,
        objectId: obj.id,
        objectName: obj.name,
        position: obj.position,
        currentValue: ratio,
        requiredValue: required,
        recommendation: `Increase contrast ratio to at least ${required}:1. Consider darkening the text or lightening the background.`,
        autoFixAvailable: false,
      });
    } else {
      this.passedChecks++;
    }
  }

  /**
   * Check contrast under color vision deficiency simulations.
   */
  private checkColorBlindContrast(obj: AuditableObject): void {
    if (!obj.foregroundColor || !obj.backgroundColor) return;

    const deficiencies: ColorVisionDeficiency[] = [
      'protanopia', 'deuteranopia', 'tritanopia',
    ];

    for (const deficiency of deficiencies) {
      this.totalChecks++;
      const simFg = simulateColorVisionDeficiency(obj.foregroundColor, deficiency);
      const simBg = simulateColorVisionDeficiency(obj.backgroundColor, deficiency);
      const ratio = contrastRatio(simFg, simBg);

      const isLargeText = (obj.fontSize ?? 0) > 0.04;
      const required = isLargeText ? CONTRAST_RATIOS.AA_LARGE : CONTRAST_RATIOS.AA_NORMAL;

      if (ratio < required) {
        this.addFinding({
          category: 'visual',
          severity: 'major',
          wcagCriteria: '1.4.1',
          wcagLevel: 'A',
          title: `Poor contrast for ${deficiency}`,
          description: `"${obj.name}" has contrast ${ratio.toFixed(2)}:1 when simulated with ${deficiency} (requires ${required}:1).`,
          objectId: obj.id,
          objectName: obj.name,
          currentValue: ratio,
          requiredValue: required,
          recommendation: `Ensure information is not conveyed by color alone. Add texture, pattern, or shape differences.`,
          autoFixAvailable: false,
        });
      } else {
        this.passedChecks++;
      }
    }
  }

  // ===========================================================================
  // Auditory Accessibility Checks
  // ===========================================================================

  private checkAuditoryAccessibility(objects: AuditableObject[]): void {
    const audioSources = objects.filter(
      (o) => o.type === 'audio-source' || o.hasAudioFeedback,
    );

    for (const obj of audioSources) {
      this.totalChecks++;

      // Check for visual/haptic alternatives to audio cues
      if (obj.hasAudioFeedback && !obj.hasVisualFeedback && !obj.hasHapticFeedback) {
        this.addFinding({
          category: 'auditory',
          severity: 'major',
          wcagCriteria: '1.2.1',
          wcagLevel: 'A',
          title: 'Audio-only feedback',
          description: `"${obj.name}" provides audio feedback without visual or haptic alternative.`,
          objectId: obj.id,
          objectName: obj.name,
          recommendation: 'Add visual indicators (color change, animation) and/or haptic feedback as alternatives to audio cues.',
          autoFixAvailable: false,
        });
      } else {
        this.passedChecks++;
      }

      // Check audio descriptions
      if (obj.type === 'audio-source' && !obj.hasAudioDescription) {
        this.totalChecks++;
        this.addFinding({
          category: 'auditory',
          severity: 'minor',
          wcagCriteria: '1.2.5',
          wcagLevel: 'AA',
          title: 'Missing audio description',
          description: `Audio source "${obj.name}" has no audio description metadata.`,
          objectId: obj.id,
          objectName: obj.name,
          recommendation: 'Add audioDescriptionText describing the content of the audio for users with hearing impairments.',
          autoFixAvailable: false,
        });
      }

      // Check spatial audio configuration
      if (obj.isSpatialAudio && obj.audioFalloff !== undefined && obj.audioFalloff < 0.5) {
        this.totalChecks++;
        this.addFinding({
          category: 'auditory',
          severity: 'minor',
          wcagCriteria: '1.4.7',
          wcagLevel: 'AAA',
          title: 'Aggressive audio falloff',
          description: `Spatial audio "${obj.name}" has a steep falloff (${obj.audioFalloff}), which may make it difficult to locate or hear.`,
          objectId: obj.id,
          objectName: obj.name,
          currentValue: obj.audioFalloff,
          recommendation: 'Increase audio falloff distance to ensure users can hear spatial cues at comfortable distances.',
          autoFixAvailable: true,
        });
      }
    }
  }

  // ===========================================================================
  // Motor Accessibility Checks
  // ===========================================================================

  private checkMotorAccessibility(objects: AuditableObject[]): void {
    if (!this.sceneAdapter) return;

    const playerPos = this.sceneAdapter.getPlayerPosition();
    const playerHeight = this.sceneAdapter.getPlayerHeight();
    const interactables = objects.filter((o) => o.isInteractable);

    for (const obj of interactables) {
      this.totalChecks++;

      // Check interaction reach
      const distance = vec3Distance(obj.position, playerPos);
      if (distance > this.config.maxInteractionDistance) {
        this.addFinding({
          category: 'motor',
          severity: 'major',
          wcagCriteria: '2.5.5',
          wcagLevel: 'AAA',
          title: 'Object beyond comfortable reach',
          description: `"${obj.name}" is ${distance.toFixed(2)}m away, beyond the comfortable interaction distance of ${this.config.maxInteractionDistance}m.`,
          objectId: obj.id,
          objectName: obj.name,
          position: obj.position,
          currentValue: distance,
          requiredValue: this.config.maxInteractionDistance,
          recommendation: 'Move the object closer or provide a raycast/pointer-based interaction alternative.',
          autoFixAvailable: false,
        });
      } else {
        this.passedChecks++;
      }

      // Check if object requires reaching too high or too low
      const relativeHeight = obj.position.y - (playerPos.y - playerHeight / 2);
      this.totalChecks++;

      if (relativeHeight > playerHeight + 0.3) {
        this.addFinding({
          category: 'motor',
          severity: 'major',
          wcagCriteria: '2.5.5',
          wcagLevel: 'AAA',
          title: 'Object above comfortable reach',
          description: `"${obj.name}" is ${relativeHeight.toFixed(2)}m above floor level, above comfortable arm reach.`,
          objectId: obj.id,
          objectName: obj.name,
          position: obj.position,
          recommendation: 'Lower the object or provide an alternative interaction method (voice, gaze, UI panel).',
          autoFixAvailable: false,
        });
      } else if (relativeHeight < 0.3) {
        this.addFinding({
          category: 'motor',
          severity: 'major',
          wcagCriteria: '2.5.5',
          wcagLevel: 'AAA',
          title: 'Object below comfortable reach',
          description: `"${obj.name}" is at ${relativeHeight.toFixed(2)}m above floor, requiring bending/crouching.`,
          objectId: obj.id,
          objectName: obj.name,
          position: obj.position,
          recommendation: 'Raise the object or provide a seated-compatible interaction method.',
          autoFixAvailable: false,
        });
      } else {
        this.passedChecks++;
      }

      // Check interaction timeout
      if (obj.interactionTimeout !== undefined && obj.interactionTimeout < 5000) {
        this.totalChecks++;
        this.addFinding({
          category: 'motor',
          severity: 'major',
          wcagCriteria: '2.2.1',
          wcagLevel: 'A',
          title: 'Short interaction timeout',
          description: `"${obj.name}" has a ${obj.interactionTimeout}ms timeout. Users with motor impairments may need more time.`,
          objectId: obj.id,
          objectName: obj.name,
          currentValue: obj.interactionTimeout,
          requiredValue: 5000,
          recommendation: 'Increase timeout to at least 5 seconds, or allow users to extend/disable the timeout.',
          autoFixAvailable: true,
        });
      }
    }
  }

  // ===========================================================================
  // Cognitive Accessibility Checks
  // ===========================================================================

  private checkCognitiveAccessibility(objects: AuditableObject[]): void {
    const interactables = objects.filter((o) => o.isInteractable);

    // Check for consistent interaction patterns
    const interactionTypes = new Set(interactables.map((o) => o.interactionType).filter(Boolean));
    this.totalChecks++;
    if (interactionTypes.size > 4) {
      this.addFinding({
        category: 'cognitive',
        severity: 'minor',
        wcagCriteria: '3.2.3',
        wcagLevel: 'AA',
        title: 'Too many interaction modalities',
        description: `Scene uses ${interactionTypes.size} different interaction types (${Array.from(interactionTypes).join(', ')}). This may cause cognitive overload.`,
        recommendation: 'Standardize on 2-3 primary interaction methods and ensure consistency.',
        autoFixAvailable: false,
      });
    } else {
      this.passedChecks++;
    }

    // Check for ARIA roles on interactables
    for (const obj of interactables) {
      if (!obj.ariaRole) {
        this.totalChecks++;
        if (this.config.includeInfoFindings) {
          this.addFinding({
            category: 'cognitive',
            severity: 'info',
            wcagCriteria: '4.1.2',
            wcagLevel: 'A',
            title: 'Missing ARIA role',
            description: `Interactable "${obj.name}" has no ariaRole defined.`,
            objectId: obj.id,
            objectName: obj.name,
            recommendation: 'Add an ariaRole (e.g., "button", "slider", "dialog") for assistive technology compatibility.',
            autoFixAvailable: false,
          });
        }
      }
    }
  }

  // ===========================================================================
  // Vestibular Safety Checks
  // ===========================================================================

  private checkVestibularSafety(): void {
    if (!this.sceneAdapter) return;

    const motion = this.sceneAdapter.getMotionAnalysis();

    // Camera velocity
    this.totalChecks++;
    if (motion.maxCameraVelocity > MOTION_THRESHOLDS.MAX_CAMERA_VELOCITY) {
      this.addFinding({
        category: 'vestibular',
        severity: 'critical',
        wcagCriteria: '2.3.3',
        wcagLevel: 'AAA',
        title: 'Excessive camera velocity',
        description: `Maximum camera velocity (${motion.maxCameraVelocity.toFixed(1)} m/s) exceeds comfortable threshold (${MOTION_THRESHOLDS.MAX_CAMERA_VELOCITY} m/s).`,
        currentValue: motion.maxCameraVelocity,
        requiredValue: MOTION_THRESHOLDS.MAX_CAMERA_VELOCITY,
        recommendation: 'Reduce camera movement speed or provide a comfort mode with reduced velocity.',
        autoFixAvailable: false,
      });
    } else {
      this.passedChecks++;
    }

    // Camera acceleration
    this.totalChecks++;
    if (motion.maxCameraAcceleration > MOTION_THRESHOLDS.MAX_CAMERA_ACCELERATION) {
      this.addFinding({
        category: 'vestibular',
        severity: 'major',
        wcagCriteria: '2.3.3',
        wcagLevel: 'AAA',
        title: 'Excessive camera acceleration',
        description: `Maximum camera acceleration (${motion.maxCameraAcceleration.toFixed(1)} m/s^2) may cause discomfort.`,
        currentValue: motion.maxCameraAcceleration,
        requiredValue: MOTION_THRESHOLDS.MAX_CAMERA_ACCELERATION,
        recommendation: 'Apply easing curves to camera acceleration and provide comfort options.',
        autoFixAvailable: false,
      });
    } else {
      this.passedChecks++;
    }

    // Rotation velocity
    this.totalChecks++;
    if (motion.maxRotationVelocity > MOTION_THRESHOLDS.MAX_ROTATION_VELOCITY) {
      this.addFinding({
        category: 'vestibular',
        severity: 'major',
        wcagCriteria: '2.3.3',
        wcagLevel: 'AAA',
        title: 'Excessive rotation speed',
        description: `Maximum rotation velocity (${motion.maxRotationVelocity.toFixed(1)} deg/s) exceeds comfort threshold.`,
        currentValue: motion.maxRotationVelocity,
        requiredValue: MOTION_THRESHOLDS.MAX_ROTATION_VELOCITY,
        recommendation: 'Reduce smooth rotation speed or provide snap-turn as an alternative.',
        autoFixAvailable: false,
      });
    } else {
      this.passedChecks++;
    }

    // Check comfort options
    this.totalChecks++;
    if (motion.artificialLocomotion && !motion.comfortOptionsPresent) {
      this.addFinding({
        category: 'vestibular',
        severity: 'critical',
        wcagCriteria: '2.3.3',
        wcagLevel: 'AAA',
        title: 'Missing comfort options for locomotion',
        description: 'Scene uses artificial locomotion but provides no comfort options.',
        recommendation: 'Add comfort settings: vignette during movement, teleport option, snap-turn, and adjustable speed.',
        autoFixAvailable: false,
      });
    } else {
      this.passedChecks++;
    }

    // Vection risk
    this.totalChecks++;
    if (motion.vectionRisk && !motion.vignettePresent) {
      this.addFinding({
        category: 'vestibular',
        severity: 'major',
        wcagCriteria: '2.3.3',
        wcagLevel: 'AAA',
        title: 'Vection risk without mitigation',
        description: 'Scene contains elements that can induce vection (false sense of self-motion) without vignette mitigation.',
        recommendation: 'Add a tunnel vignette effect during movement to reduce peripheral visual flow.',
        autoFixAvailable: false,
      });
    } else {
      this.passedChecks++;
    }

    // Teleportation alternative
    this.totalChecks++;
    if (motion.artificialLocomotion && !motion.teleportAvailable) {
      this.addFinding({
        category: 'vestibular',
        severity: 'major',
        wcagCriteria: '2.5.6',
        wcagLevel: 'AAA',
        title: 'No teleportation alternative',
        description: 'Artificial locomotion is used without a teleportation alternative.',
        recommendation: 'Provide teleportation as an alternative to smooth locomotion.',
        autoFixAvailable: false,
      });
    } else {
      this.passedChecks++;
    }
  }

  // ===========================================================================
  // Photosensitive Safety Checks
  // ===========================================================================

  private checkPhotosensitiveSafety(objects: AuditableObject[]): void {
    for (const obj of objects) {
      if (!obj.visible) continue;

      // Check flashing
      if (obj.isFlashing && obj.flashFrequency !== undefined) {
        this.totalChecks++;

        if (obj.flashFrequency > FLASH_THRESHOLDS.MAX_FLASHES_PER_SECOND) {
          this.addFinding({
            category: 'photosensitive',
            severity: 'critical',
            wcagCriteria: '2.3.1',
            wcagLevel: 'A',
            title: 'Dangerous flash frequency',
            description: `"${obj.name}" flashes at ${obj.flashFrequency} Hz, exceeding the safe limit of ${FLASH_THRESHOLDS.MAX_FLASHES_PER_SECOND} Hz. This can trigger photosensitive seizures.`,
            objectId: obj.id,
            objectName: obj.name,
            position: obj.position,
            currentValue: obj.flashFrequency,
            requiredValue: FLASH_THRESHOLDS.MAX_FLASHES_PER_SECOND,
            recommendation: 'Reduce flash frequency below 3 Hz or remove flashing entirely. Provide a reduced-motion mode.',
            autoFixAvailable: true,
          });
        } else {
          this.passedChecks++;
        }
      }

      // Check for particles that could cause flashing
      if (obj.type === 'particle' && obj.hasAnimation) {
        this.totalChecks++;
        if (this.config.includeInfoFindings) {
          this.addFinding({
            category: 'photosensitive',
            severity: 'info',
            wcagCriteria: '2.3.1',
            wcagLevel: 'A',
            title: 'Particle system with animation',
            description: `Particle system "${obj.name}" has animation. Verify it does not produce a flashing effect exceeding 3 Hz over more than 25% of the viewport.`,
            objectId: obj.id,
            objectName: obj.name,
            recommendation: 'Manually verify that particle effects do not create repetitive flashing patterns.',
            autoFixAvailable: false,
          });
        }
      }
    }
  }

  // ===========================================================================
  // Input Accessibility Checks
  // ===========================================================================

  private checkInputAccessibility(objects: AuditableObject[]): void {
    const interactables = objects.filter((o) => o.isInteractable);

    // Check for multiple input method support
    const interactionTypeSet = new Set(interactables.map((o) => o.interactionType).filter(Boolean));
    this.totalChecks++;

    if (interactionTypeSet.size === 1) {
      const singleType = Array.from(interactionTypeSet)[0];
      this.addFinding({
        category: 'input',
        severity: 'major',
        wcagCriteria: '2.5.6',
        wcagLevel: 'AAA',
        title: 'Single input modality',
        description: `All interactions use "${singleType}" only. Users who cannot use this input method are excluded.`,
        recommendation: 'Support at least 2 input methods (e.g., pointer + voice, or grab + gaze) for each interactive element.',
        autoFixAvailable: false,
      });
    } else {
      this.passedChecks++;
    }

    // Check tab/focus order
    const tabbable = interactables.filter((o) => o.tabIndex !== undefined);
    this.totalChecks++;
    if (tabbable.length === 0 && interactables.length > 0) {
      this.addFinding({
        category: 'input',
        severity: 'major',
        wcagCriteria: '2.4.3',
        wcagLevel: 'A',
        title: 'No focus order defined',
        description: 'No interactable objects have tabIndex set. Focus/navigation order is undefined.',
        recommendation: 'Define tabIndex for interactable objects to enable sequential focus navigation.',
        autoFixAvailable: false,
      });
    } else if (tabbable.length > 0) {
      this.passedChecks++;

      // Check for duplicate tab indices
      const tabIndices = tabbable.map((o) => o.tabIndex!);
      const duplicates = tabIndices.filter((v, i) => tabIndices.indexOf(v) !== i);
      if (duplicates.length > 0) {
        this.totalChecks++;
        this.addFinding({
          category: 'input',
          severity: 'minor',
          wcagCriteria: '2.4.3',
          wcagLevel: 'A',
          title: 'Duplicate tab indices',
          description: `Tab indices ${[...new Set(duplicates)].join(', ')} are used by multiple objects, causing ambiguous focus order.`,
          recommendation: 'Assign unique tabIndex values to each interactable object.',
          autoFixAvailable: false,
        });
      }
    }
  }

  // ===========================================================================
  // Text Accessibility Checks
  // ===========================================================================

  private checkTextAccessibility(objects: AuditableObject[]): void {
    const textObjects = objects.filter(
      (o) => o.type === 'text' || (o.type === 'ui-panel' && o.text),
    );

    for (const obj of textObjects) {
      if (!obj.visible) continue;

      // Check minimum text size
      if (obj.fontSize !== undefined) {
        this.totalChecks++;
        if (obj.fontSize < this.config.minTextSize) {
          this.addFinding({
            category: 'text',
            severity: 'major',
            wcagCriteria: '1.4.4',
            wcagLevel: 'AA',
            title: 'Text too small',
            description: `"${obj.name}" has font size ${obj.fontSize.toFixed(4)} (minimum: ${this.config.minTextSize}).`,
            objectId: obj.id,
            objectName: obj.name,
            currentValue: obj.fontSize,
            requiredValue: this.config.minTextSize,
            recommendation: `Increase font size to at least ${this.config.minTextSize} world units (approximately 24pt at 1m distance).`,
            autoFixAvailable: true,
          });
        } else {
          this.passedChecks++;
        }
      }

      // Check text readability at distance
      if (this.sceneAdapter && obj.fontSize) {
        this.totalChecks++;
        const angularSize = this.sceneAdapter.getAngularSize(obj.id);
        if (angularSize < 0.3) {
          // Below 0.3 degrees, text is generally unreadable
          this.addFinding({
            category: 'text',
            severity: 'major',
            wcagCriteria: '1.4.4',
            wcagLevel: 'AA',
            title: 'Text unreadable at distance',
            description: `"${obj.name}" subtends ${angularSize.toFixed(2)} degrees. Text below 0.3 degrees is unreadable.`,
            objectId: obj.id,
            objectName: obj.name,
            currentValue: angularSize,
            requiredValue: 0.3,
            recommendation: 'Increase font size, move text closer to the user, or use a billboard approach that scales with distance.',
            autoFixAvailable: false,
          });
        } else {
          this.passedChecks++;
        }
      }
    }
  }

  // ===========================================================================
  // Interaction Accessibility Checks
  // ===========================================================================

  private checkInteractionAccessibility(objects: AuditableObject[]): void {
    const interactables = objects.filter((o) => o.isInteractable);

    for (const obj of interactables) {
      // Check for multi-modal feedback
      this.totalChecks++;
      const feedbackModes = [
        obj.hasVisualFeedback,
        obj.hasAudioFeedback,
        obj.hasHapticFeedback,
      ].filter(Boolean).length;

      if (feedbackModes < 2) {
        this.addFinding({
          category: 'interaction',
          severity: 'major',
          wcagCriteria: '1.3.3',
          wcagLevel: 'A',
          title: 'Insufficient feedback modalities',
          description: `"${obj.name}" provides only ${feedbackModes} feedback modality. Interactions should provide at least 2 (visual + audio or visual + haptic).`,
          objectId: obj.id,
          objectName: obj.name,
          currentValue: feedbackModes,
          requiredValue: 2,
          recommendation: 'Add additional feedback (visual highlight, sound effect, haptic pulse) to confirm interactions.',
          autoFixAvailable: false,
        });
      } else {
        this.passedChecks++;
      }

      // Check interaction target size
      if (obj.scale) {
        this.totalChecks++;
        const minDimension = Math.min(obj.scale.x, obj.scale.y, obj.scale.z);
        const minTargetSize = 0.04; // ~4cm, based on Fitts's Law for VR
        if (minDimension < minTargetSize) {
          this.addFinding({
            category: 'interaction',
            severity: 'major',
            wcagCriteria: '2.5.5',
            wcagLevel: 'AAA',
            title: 'Interaction target too small',
            description: `"${obj.name}" has a minimum dimension of ${(minDimension * 100).toFixed(1)}cm. Minimum recommended: ${(minTargetSize * 100).toFixed(0)}cm.`,
            objectId: obj.id,
            objectName: obj.name,
            currentValue: minDimension,
            requiredValue: minTargetSize,
            recommendation: 'Increase the object size or add a larger invisible collision boundary for easier targeting.',
            autoFixAvailable: true,
          });
        } else {
          this.passedChecks++;
        }
      }
    }
  }

  // ===========================================================================
  // Navigation Accessibility Checks
  // ===========================================================================

  private checkNavigationAccessibility(objects: AuditableObject[]): void {
    // Check for waypoint/landmark presence
    const landmarks = objects.filter(
      (o) => o.ariaRole === 'landmark' || o.ariaRole === 'navigation',
    );
    this.totalChecks++;
    if (landmarks.length === 0 && objects.length > 10) {
      this.addFinding({
        category: 'navigation',
        severity: 'minor',
        wcagCriteria: '2.4.1',
        wcagLevel: 'A',
        title: 'No navigation landmarks',
        description: 'Scene has no navigation landmarks. Users may have difficulty orienting themselves in complex scenes.',
        recommendation: 'Add landmark objects (ariaRole: "landmark") at key locations for spatial orientation.',
        autoFixAvailable: false,
      });
    } else {
      this.passedChecks++;
    }

    // Check for skip-navigation equivalent
    const interactables = objects.filter((o) => o.isInteractable);
    this.totalChecks++;
    if (interactables.length > 20) {
      const hasSkipMechanism = interactables.some(
        (o) => o.ariaRole === 'skip-navigation' || o.name.toLowerCase().includes('skip'),
      );
      if (!hasSkipMechanism) {
        this.addFinding({
          category: 'navigation',
          severity: 'minor',
          wcagCriteria: '2.4.1',
          wcagLevel: 'A',
          title: 'No skip-navigation mechanism',
          description: `Scene has ${interactables.length} interactable objects but no skip-navigation mechanism.`,
          recommendation: 'Provide a way to skip past groups of interactive elements to reach main content areas.',
          autoFixAvailable: false,
        });
      } else {
        this.passedChecks++;
      }
    } else {
      this.passedChecks++;
    }
  }

  // ===========================================================================
  // Haptic Accessibility Checks
  // ===========================================================================

  private checkHapticAccessibility(objects: AuditableObject[]): void {
    const hapticObjects = objects.filter((o) => o.hasHapticFeedback);

    this.totalChecks++;
    if (hapticObjects.length > 0) {
      // Check that haptic-dependent interactions have non-haptic alternatives
      for (const obj of hapticObjects) {
        if (!obj.hasVisualFeedback && !obj.hasAudioFeedback) {
          this.addFinding({
            category: 'haptic',
            severity: 'major',
            wcagCriteria: '1.3.3',
            wcagLevel: 'A',
            title: 'Haptic-only feedback',
            description: `"${obj.name}" relies solely on haptic feedback. Users without haptic-capable controllers are excluded.`,
            objectId: obj.id,
            objectName: obj.name,
            recommendation: 'Add visual and/or audio feedback as alternatives to haptic cues.',
            autoFixAvailable: false,
          });
        }
      }
      this.passedChecks++;
    } else {
      this.passedChecks++;
    }
  }

  // ===========================================================================
  // Auto-Fix
  // ===========================================================================

  /**
   * Apply auto-fixes for findings that support it.
   */
  applyAutoFixes(): number {
    if (!this.sceneAdapter) return 0;

    let fixCount = 0;

    for (const finding of this.findings) {
      if (!finding.autoFixAvailable || !finding.objectId) continue;

      switch (finding.wcagCriteria) {
        case '2.3.1': {
          // Flash frequency: reduce to safe level
          if (finding.requiredValue !== undefined) {
            this.sceneAdapter.applyFix(finding.objectId, 'flashFrequency', finding.requiredValue);
            fixCount++;
            this.emitEvent('auto-fix-applied', { findingId: finding.id, property: 'flashFrequency' });
          }
          break;
        }
        case '1.4.4': {
          // Text size: increase to minimum
          if (finding.requiredValue !== undefined) {
            this.sceneAdapter.applyFix(finding.objectId, 'fontSize', finding.requiredValue);
            fixCount++;
            this.emitEvent('auto-fix-applied', { findingId: finding.id, property: 'fontSize' });
          }
          break;
        }
        case '1.4.1': {
          // Opacity: increase to minimum visible level
          if (finding.requiredValue !== undefined) {
            this.sceneAdapter.applyFix(finding.objectId, 'opacity', finding.requiredValue);
            fixCount++;
            this.emitEvent('auto-fix-applied', { findingId: finding.id, property: 'opacity' });
          }
          break;
        }
        case '2.2.1': {
          // Timeout: increase to minimum accessible level
          if (finding.requiredValue !== undefined) {
            this.sceneAdapter.applyFix(finding.objectId, 'interactionTimeout', finding.requiredValue);
            fixCount++;
            this.emitEvent('auto-fix-applied', { findingId: finding.id, property: 'interactionTimeout' });
          }
          break;
        }
        case '2.5.5': {
          // Target size: increase scale
          if (finding.requiredValue !== undefined) {
            const scale = finding.requiredValue as number;
            this.sceneAdapter.applyFix(finding.objectId, 'scale', { x: scale, y: scale, z: scale });
            fixCount++;
            this.emitEvent('auto-fix-applied', { findingId: finding.id, property: 'scale' });
          }
          break;
        }
      }
    }

    return fixCount;
  }

  // ===========================================================================
  // Color Vision Simulation
  // ===========================================================================

  /**
   * Simulate how a color appears under a specific color vision deficiency.
   */
  simulateColor(color: Color, deficiency: ColorVisionDeficiency): Color {
    return simulateColorVisionDeficiency(color, deficiency);
  }

  /**
   * Get all supported color vision deficiency types.
   */
  getColorVisionDeficiencies(): ColorVisionDeficiency[] {
    return [
      'protanopia',
      'deuteranopia',
      'tritanopia',
      'protanomaly',
      'deuteranomaly',
      'tritanomaly',
      'achromatopsia',
    ];
  }

  /**
   * Calculate the contrast ratio between two colors.
   */
  calculateContrastRatio(foreground: Color, background: Color): number {
    return contrastRatio(foreground, background);
  }

  // ===========================================================================
  // Report Building
  // ===========================================================================

  /**
   * Add a finding to the list.
   */
  private addFinding(
    params: Omit<AuditFinding, 'id'>,
  ): void {
    const finding: AuditFinding = {
      id: generateFindingId(),
      ...params,
    };
    this.findings.push(finding);
    this.emitEvent('finding-detected', finding);
  }

  /**
   * Build the final audit report.
   */
  private buildReport(sceneId: string, projectName: string, startTime: number): AuditReport {
    const endTime = performance.now();

    const categoryCounts: Record<AuditCategory, number> = {
      visual: 0,
      auditory: 0,
      motor: 0,
      cognitive: 0,
      vestibular: 0,
      photosensitive: 0,
      input: 0,
      text: 0,
      interaction: 0,
      navigation: 0,
      haptic: 0,
    };

    let critical = 0;
    let major = 0;
    let minor = 0;
    let info = 0;

    for (const finding of this.findings) {
      categoryCounts[finding.category]++;
      switch (finding.severity) {
        case 'critical': critical++; break;
        case 'major': major++; break;
        case 'minor': minor++; break;
        case 'info': info++; break;
      }
    }

    const summary: AuditSummary = {
      totalChecks: this.totalChecks,
      totalFindings: this.findings.length,
      critical,
      major,
      minor,
      info,
      categoryCounts,
      passed: this.passedChecks,
      failed: this.totalChecks - this.passedChecks,
    };

    // Calculate scores
    const score = this.calculateScores(categoryCounts);

    return {
      projectName,
      sceneId,
      timestamp: Date.now(),
      duration: endTime - startTime,
      conformanceTarget: this.config.conformanceLevel,
      findings: [...this.findings],
      summary,
      score,
      metadata: {
        playerHeightRange: this.config.playerHeightRange,
        requireSeatedMode: this.config.requireSeatedMode,
        requireStandingMode: this.config.requireStandingMode,
      },
    };
  }

  /**
   * Calculate accessibility scores per category.
   */
  private calculateScores(categoryCounts: Record<AuditCategory, number>): AccessibilityScore {
    const calcScore = (categories: AuditCategory[]): number => {
      const findings = categories.reduce((sum, cat) => sum + categoryCounts[cat], 0);
      // Each finding deducts from 100, weighted by severity
      let deductions = 0;
      for (const finding of this.findings) {
        if (categories.includes(finding.category)) {
          switch (finding.severity) {
            case 'critical': deductions += 20; break;
            case 'major': deductions += 10; break;
            case 'minor': deductions += 3; break;
            case 'info': deductions += 0; break;
          }
        }
      }
      return Math.max(0, Math.min(100, 100 - deductions));
    };

    const visual = calcScore(['visual', 'text', 'photosensitive']);
    const auditory = calcScore(['auditory']);
    const motor = calcScore(['motor', 'interaction', 'input', 'haptic']);
    const cognitive = calcScore(['cognitive', 'navigation']);
    const vestibular = calcScore(['vestibular']);

    const overall = Math.round(
      (visual * 0.25 + auditory * 0.15 + motor * 0.25 + cognitive * 0.15 + vestibular * 0.2),
    );

    return {
      overall,
      visual: Math.round(visual),
      auditory: Math.round(auditory),
      motor: Math.round(motor),
      cognitive: Math.round(cognitive),
      vestibular: Math.round(vestibular),
    };
  }

  // ===========================================================================
  // Reach Zone Analysis
  // ===========================================================================

  /**
   * Get the reach zones with current player height adjustments.
   */
  getReachZones(playerHeight?: number): ReachZone[] {
    const height = playerHeight ?? 1.7;
    const heightFactor = height / 1.7; // Normalize to average height

    return REACH_ZONES.map((zone) => ({
      ...zone,
      center: {
        x: zone.center.x,
        y: zone.center.y * heightFactor,
        z: zone.center.z * heightFactor,
      },
      radius: zone.radius * heightFactor,
    }));
  }

  /**
   * Determine which reach zone an object falls into.
   */
  classifyReachZone(objectPosition: Vec3, playerPosition: Vec3, playerHeight: number = 1.7): ReachZone | null {
    const zones = this.getReachZones(playerHeight);
    const relativePos = {
      x: objectPosition.x - playerPosition.x,
      y: objectPosition.y - (playerPosition.y + playerHeight * 0.5),
      z: objectPosition.z - playerPosition.z,
    };

    for (const zone of zones) {
      const dist = vec3Distance(relativePos, zone.center);
      if (dist <= zone.radius) {
        return zone;
      }
    }
    return null;
  }

  // ===========================================================================
  // State & Queries
  // ===========================================================================

  /**
   * Get the most recent audit findings.
   */
  getFindings(): AuditFinding[] {
    return [...this.findings];
  }

  /**
   * Get findings filtered by category.
   */
  getFindingsByCategory(category: AuditCategory): AuditFinding[] {
    return this.findings.filter((f) => f.category === category);
  }

  /**
   * Get findings filtered by severity.
   */
  getFindingsBySeverity(severity: Severity): AuditFinding[] {
    return this.findings.filter((f) => f.severity === severity);
  }

  /**
   * Get findings for a specific object.
   */
  getFindingsForObject(objectId: string): AuditFinding[] {
    return this.findings.filter((f) => f.objectId === objectId);
  }

  /**
   * Export the audit report as a JSON string.
   */
  exportReport(report: AuditReport): string {
    return JSON.stringify(report, null, 2);
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  /**
   * Register an event handler.
   */
  on(event: AuditEventType, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  /**
   * Remove an event handler.
   */
  off(event: AuditEventType, handler: EventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emit an event.
   */
  private emitEvent(type: AuditEventType, data?: unknown): void {
    const event: AuditEvent = { type, timestamp: performance.now(), data };
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[VRAccessibilityAudit] Error in event handler for "${type}":`, err);
        }
      }
    }
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.findings = [];
    this.eventHandlers.clear();
    this.sceneAdapter = null;
  }
}
