/**
 * Domain Module Types — Composable vertical building blocks
 *
 * Each module defines domain-specific vocabulary that enhances the
 * schema mapper's accuracy. Modules are data, not code. Same module
 * structure, different context = different vertical.
 *
 * Cannabis and winery both use the agriculture module — with different
 * keywords, thresholds, and lifecycle stages loaded from context.
 */

/** A keyword mapping: domain term → HoloScript traits + spatial role */
export interface DomainKeyword {
  /** The domain-specific term (e.g., "terpene", "brix", "appellation") */
  term: string;
  /** HoloScript traits this term maps to */
  traits: string[];
  /** Spatial role override for the schema mapper */
  spatialRole?: string;
  /** Description for AI context */
  description?: string;
}

/** A threshold preset for sensor monitoring */
export interface ThresholdPreset {
  /** Sensor type (generic — "temperature", "humidity", "ph", etc.) */
  sensor: string;
  /** Display name for this threshold */
  name: string;
  /** Target value */
  target: number;
  /** Acceptable range [min, max] */
  range: [number, number];
  /** Unit of measurement */
  unit: string;
  /** Alert severity when breached */
  severity: 'info' | 'warning' | 'critical';
}

/** A lifecycle stage definition */
export interface LifecycleStage {
  /** Stage identifier */
  id: string;
  /** Display name */
  name: string;
  /** Typical duration in days (0 = indefinite) */
  durationDays: number;
  /** Threshold presets active during this stage */
  thresholds: ThresholdPreset[];
  /** Description for AI context */
  description?: string;
}

/** A compliance rule */
export interface ComplianceRule {
  /** Rule identifier */
  id: string;
  /** Display name */
  name: string;
  /** What data must be tracked */
  requires: string[];
  /** Regulatory body (e.g., "METRC", "TTB", "FDA") */
  authority?: string;
  /** Whether this rule is mandatory */
  mandatory: boolean;
  /** Description for AI context */
  description?: string;
}

/** A product property definition (for retail/catalog modules) */
export interface ProductProperty {
  /** Property name as it appears in the domain's data */
  fieldName: string;
  /** Display label */
  label: string;
  /** Data type */
  type: 'string' | 'number' | 'boolean' | 'enum';
  /** For enums: possible values */
  enumValues?: string[];
  /** For numbers: typical range */
  range?: [number, number];
  /** Unit */
  unit?: string;
  /** How to display this property */
  displayAs: 'label' | 'gauge' | 'tag' | 'badge' | 'color' | 'image' | 'toggle';
}

/** A composition rule for genetics/breeding */
export interface CompositionRule {
  /** Property name */
  property: string;
  /** How to merge from two parents */
  mergeStrategy: 'average' | 'union' | 'max' | 'min' | 'dominant' | 'blend';
  /** Whether this property can conflict */
  canConflict: boolean;
}

/**
 * A domain module — one composable vertical building block.
 * Multiple modules compose into a complete domain plugin.
 */
export interface DomainModule {
  /** Module identifier */
  id: string;
  /** Module type — determines which part of the pipeline it enhances */
  type: 'agriculture' | 'retail' | 'manufacturing' | 'compliance' | 'science' | 'genetics';
  /** Domain keywords that enhance the schema mapper */
  keywords: DomainKeyword[];
  /** Lifecycle stages (agriculture, manufacturing) */
  stages?: LifecycleStage[];
  /** Compliance rules */
  rules?: ComplianceRule[];
  /** Product properties (retail) */
  properties?: ProductProperty[];
  /** Composition/inheritance rules (genetics) */
  compositionRules?: CompositionRule[];
  /** Default theme overrides */
  theme?: Record<string, string>;
  /** BT template IDs to recommend when this module is active */
  recommendedBehaviorTrees?: string[];
}

/**
 * A complete domain plugin — a composition of modules + context.
 */
export interface DomainPluginConfig {
  /** Plugin identifier (kebab-case) */
  id: string;
  /** Display name */
  name: string;
  /** Industry/vertical */
  industry: string;
  /** Description */
  description: string;
  /** Which modules this plugin composes */
  modules: DomainModule[];
  /** Default theme for this vertical */
  theme: Record<string, string>;
  /** Tags for marketplace discovery */
  tags: string[];
}
