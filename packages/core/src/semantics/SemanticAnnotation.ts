/**
 * @holoscript/core Semantic Annotation System
 *
 * Base @semantic trait providing property-level metadata for intelligent
 * code understanding, AI assistance, and runtime optimization.
 */

// ============================================================================
// Semantic Categories
// ============================================================================

export type SemanticCategory =
  | 'identity' // Who/what something is
  | 'spatial' // Position, rotation, scale
  | 'temporal' // Time-related properties
  | 'behavioral' // Actions, states, transitions
  | 'visual' // Appearance, rendering
  | 'audio' // Sound-related
  | 'physical' // Physics properties
  | 'interactive' // User interaction
  | 'narrative' // Story, dialog, lore
  | 'ai' // AI-controlled properties
  | 'network' // Multiplayer sync
  | 'performance' // Optimization hints
  | 'accessibility' // A11y properties
  | 'custom'; // User-defined

export type SemanticIntent =
  | 'state' // Current value/condition
  | 'config' // Configuration setting
  | 'computed' // Derived from other values
  | 'input' // User/system input
  | 'output' // Produced value
  | 'reference' // Points to another entity
  | 'trigger' // Causes an action
  | 'constraint' // Limits/rules
  | 'metric' // Measurement/statistic
  | 'debug'; // Development only

// ============================================================================
// Semantic Flags
// ============================================================================

export interface SemanticFlags {
  /** Property can be modified at runtime */
  mutable: boolean;

  /** Property should be synced across network */
  networked: boolean;

  /** Property should be persisted */
  persistent: boolean;

  /** Property is visible in editor/inspector */
  inspectable: boolean;

  /** Property can be animated */
  animatable: boolean;

  /** Property affects rendering */
  affectsRender: boolean;

  /** Property affects physics */
  affectsPhysics: boolean;

  /** Property is required for entity to function */
  required: boolean;

  /** Property is deprecated */
  deprecated: boolean;

  /** Property contains sensitive data */
  sensitive: boolean;
}

// ============================================================================
// Semantic Constraints
// ============================================================================

export interface SemanticConstraints {
  /** Minimum value (for numbers) */
  min?: number;

  /** Maximum value (for numbers) */
  max?: number;

  /** Step/increment value */
  step?: number;

  /** Allowed values (enum) */
  allowedValues?: unknown[];

  /** Pattern for string validation */
  pattern?: string;

  /** Minimum length (strings/arrays) */
  minLength?: number;

  /** Maximum length (strings/arrays) */
  maxLength?: number;

  /** Custom validation function name */
  validator?: string;

  /** Dependencies (other properties that must be set) */
  requires?: string[];

  /** Mutually exclusive properties */
  excludes?: string[];

  /** Default value */
  defaultValue?: unknown;
}

// ============================================================================
// Semantic Relation
// ============================================================================

export type RelationType =
  | 'owns' // Has ownership
  | 'references' // Points to
  | 'depends_on' // Requires
  | 'triggers' // Causes
  | 'observes' // Watches
  | 'parent_of' // Hierarchy
  | 'child_of' // Hierarchy
  | 'sibling_of' // Same level
  | 'instance_of' // Type relationship
  | 'extends'; // Inheritance

export interface SemanticRelation {
  /** Relation type */
  type: RelationType;

  /** Target property or entity path */
  target: string;

  /** Is this relation required? */
  required: boolean;

  /** Cardinality: 'one', 'many', 'optional' */
  cardinality: 'one' | 'many' | 'optional';

  /** Description of the relationship */
  description?: string;
}

// ============================================================================
// Semantic Annotation
// ============================================================================

export interface SemanticAnnotation {
  /** Unique annotation ID */
  id: string;

  /** Property path this annotation applies to */
  propertyPath: string;

  /** Human-readable label */
  label: string;

  /** Detailed description */
  description?: string;

  /** Semantic category */
  category: SemanticCategory;

  /** Semantic intent */
  intent: SemanticIntent;

  /** Semantic flags */
  flags: SemanticFlags;

  /** Value constraints */
  constraints: SemanticConstraints;

  /** Relations to other properties/entities */
  relations: SemanticRelation[];

  /** Tags for filtering/grouping */
  tags: string[];

  /** Unit of measurement (if applicable) */
  unit?: string;

  /** Display format hint */
  displayFormat?: string;

  /** Editor widget type hint */
  editorWidget?: string;

  /** AI hint for property understanding */
  aiHint?: string;

  /** Documentation URL */
  docsUrl?: string;

  /** Version when property was introduced */
  since?: string;

  /** Version when property was deprecated */
  deprecatedSince?: string;

  /** Replacement property if deprecated */
  replacedBy?: string;

  /** Custom metadata */
  metadata: Record<string, unknown>;
}

// ============================================================================
// Semantic Schema
// ============================================================================

export interface SemanticSchema {
  /** Schema ID */
  id: string;

  /** Schema name */
  name: string;

  /** Schema version */
  version: string;

  /** Description */
  description?: string;

  /** Entity type this schema describes */
  entityType: string;

  /** All property annotations */
  annotations: Map<string, SemanticAnnotation>;

  /** Inherited schemas */
  extends?: string[];

  /** Schema-level tags */
  tags: string[];

  /** Schema-level metadata */
  metadata: Record<string, unknown>;
}

// ============================================================================
// Semantic Registry
// ============================================================================

export class SemanticRegistry {
  private static instance: SemanticRegistry | null = null;
  private schemas: Map<string, SemanticSchema> = new Map();
  private annotationIndex: Map<string, SemanticAnnotation> = new Map();

  private constructor() {}

  static getInstance(): SemanticRegistry {
    if (!SemanticRegistry.instance) {
      SemanticRegistry.instance = new SemanticRegistry();
    }
    return SemanticRegistry.instance;
  }

  static resetInstance(): void {
    SemanticRegistry.instance = null;
  }

  // ─── Schema Management ────────────────────────────────────────────────────

  /**
   * Register a semantic schema
   */
  registerSchema(schema: SemanticSchema): void {
    this.schemas.set(schema.id, schema);

    // Index all annotations
    for (const [path, annotation] of schema.annotations) {
      const globalPath = `${schema.entityType}.${path}`;
      this.annotationIndex.set(globalPath, annotation);
    }
  }

  /**
   * Get schema by ID
   */
  getSchema(schemaId: string): SemanticSchema | undefined {
    return this.schemas.get(schemaId);
  }

  /**
   * Get schema by entity type
   */
  getSchemaForEntity(entityType: string): SemanticSchema | undefined {
    for (const schema of this.schemas.values()) {
      if (schema.entityType === entityType) {
        return schema;
      }
    }
    return undefined;
  }

  /**
   * Get all schemas
   */
  getAllSchemas(): SemanticSchema[] {
    return Array.from(this.schemas.values());
  }

  // ─── Annotation Queries ───────────────────────────────────────────────────

  /**
   * Get annotation for a property path
   */
  getAnnotation(entityType: string, propertyPath: string): SemanticAnnotation | undefined {
    const globalPath = `${entityType}.${propertyPath}`;
    return this.annotationIndex.get(globalPath);
  }

  /**
   * Find annotations by category
   */
  findByCategory(category: SemanticCategory): SemanticAnnotation[] {
    return Array.from(this.annotationIndex.values()).filter((a) => a.category === category);
  }

  /**
   * Find annotations by intent
   */
  findByIntent(intent: SemanticIntent): SemanticAnnotation[] {
    return Array.from(this.annotationIndex.values()).filter((a) => a.intent === intent);
  }

  /**
   * Find annotations by tag
   */
  findByTag(tag: string): SemanticAnnotation[] {
    return Array.from(this.annotationIndex.values()).filter((a) => a.tags.includes(tag));
  }

  /**
   * Find mutable properties
   */
  findMutable(): SemanticAnnotation[] {
    return Array.from(this.annotationIndex.values()).filter((a) => a.flags.mutable);
  }

  /**
   * Find networked properties
   */
  findNetworked(): SemanticAnnotation[] {
    return Array.from(this.annotationIndex.values()).filter((a) => a.flags.networked);
  }

  /**
   * Find animatable properties
   */
  findAnimatable(): SemanticAnnotation[] {
    return Array.from(this.annotationIndex.values()).filter((a) => a.flags.animatable);
  }

  /**
   * Find deprecated properties
   */
  findDeprecated(): SemanticAnnotation[] {
    return Array.from(this.annotationIndex.values()).filter((a) => a.flags.deprecated);
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  /**
   * Validate a value against annotation constraints
   */
  validateValue(
    annotation: SemanticAnnotation,
    value: unknown
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const { constraints } = annotation;

    if (value === undefined || value === null) {
      if (annotation.flags.required) {
        errors.push(`${annotation.label} is required`);
      }
      return { valid: errors.length === 0, errors };
    }

    // Number constraints
    if (typeof value === 'number') {
      if (constraints.min !== undefined && value < constraints.min) {
        errors.push(`${annotation.label} must be >= ${constraints.min}`);
      }
      if (constraints.max !== undefined && value > constraints.max) {
        errors.push(`${annotation.label} must be <= ${constraints.max}`);
      }
    }

    // String constraints
    if (typeof value === 'string') {
      if (constraints.minLength !== undefined && value.length < constraints.minLength) {
        errors.push(`${annotation.label} must be at least ${constraints.minLength} characters`);
      }
      if (constraints.maxLength !== undefined && value.length > constraints.maxLength) {
        errors.push(`${annotation.label} must be at most ${constraints.maxLength} characters`);
      }
      if (constraints.pattern) {
        const regex = new RegExp(constraints.pattern);
        if (!regex.test(value)) {
          errors.push(`${annotation.label} does not match required pattern`);
        }
      }
    }

    // Array constraints
    if (Array.isArray(value)) {
      if (constraints.minLength !== undefined && value.length < constraints.minLength) {
        errors.push(`${annotation.label} must have at least ${constraints.minLength} items`);
      }
      if (constraints.maxLength !== undefined && value.length > constraints.maxLength) {
        errors.push(`${annotation.label} must have at most ${constraints.maxLength} items`);
      }
    }

    // Enum constraints
    if (constraints.allowedValues && constraints.allowedValues.length > 0) {
      if (!constraints.allowedValues.includes(value)) {
        errors.push(`${annotation.label} must be one of: ${constraints.allowedValues.join(', ')}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ─── AI Assistance ────────────────────────────────────────────────────────

  /**
   * Generate AI context for an entity type
   */
  generateAIContext(entityType: string): string {
    const schema = this.getSchemaForEntity(entityType);
    if (!schema) return '';

    const lines: string[] = [`Entity: ${schema.name}`, schema.description ?? '', '', 'Properties:'];

    for (const annotation of schema.annotations.values()) {
      const parts = [`- ${annotation.label} (${annotation.category}/${annotation.intent})`];

      if (annotation.description) {
        parts.push(`  ${annotation.description}`);
      }

      if (annotation.aiHint) {
        parts.push(`  AI: ${annotation.aiHint}`);
      }

      if (annotation.constraints.allowedValues) {
        parts.push(`  Values: ${annotation.constraints.allowedValues.join(', ')}`);
      }

      if (annotation.unit) {
        parts.push(`  Unit: ${annotation.unit}`);
      }

      lines.push(...parts);
    }

    return lines.join('\n');
  }

  /**
   * Get property suggestions for AI code completion
   */
  getPropertySuggestions(entityType: string, partialPath: string): SemanticAnnotation[] {
    const schema = this.getSchemaForEntity(entityType);
    if (!schema) return [];

    const lower = partialPath.toLowerCase();
    return Array.from(schema.annotations.values()).filter(
      (a) =>
        a.propertyPath.toLowerCase().includes(lower) ||
        a.label.toLowerCase().includes(lower) ||
        a.tags.some((t) => t.toLowerCase().includes(lower))
    );
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create default semantic flags
 */
export function createDefaultFlags(): SemanticFlags {
  return {
    mutable: true,
    networked: false,
    persistent: false,
    inspectable: true,
    animatable: false,
    affectsRender: false,
    affectsPhysics: false,
    required: false,
    deprecated: false,
    sensitive: false,
  };
}

/**
 * Create empty constraints
 */
export function createEmptyConstraints(): SemanticConstraints {
  return {};
}

/**
 * Create a semantic annotation
 */
export function createAnnotation(
  propertyPath: string,
  label: string,
  category: SemanticCategory,
  options: Partial<Omit<SemanticAnnotation, 'id' | 'propertyPath' | 'label' | 'category'>> = {}
): SemanticAnnotation {
  return {
    id: `ann_${propertyPath.replace(/\./g, '_')}_${Date.now()}`,
    propertyPath,
    label,
    category,
    intent: options.intent ?? 'state',
    flags: { ...createDefaultFlags(), ...options.flags },
    constraints: { ...createEmptyConstraints(), ...options.constraints },
    relations: options.relations ?? [],
    tags: options.tags ?? [],
    unit: options.unit,
    displayFormat: options.displayFormat,
    editorWidget: options.editorWidget,
    aiHint: options.aiHint,
    docsUrl: options.docsUrl,
    since: options.since,
    deprecatedSince: options.deprecatedSince,
    replacedBy: options.replacedBy,
    description: options.description,
    metadata: options.metadata ?? {},
  };
}

/**
 * Create a semantic schema
 */
export function createSchema(
  name: string,
  entityType: string,
  version: string,
  options: Partial<
    Omit<SemanticSchema, 'id' | 'name' | 'entityType' | 'version' | 'annotations'>
  > = {}
): SemanticSchema {
  return {
    id: `schema_${entityType}_${version}`,
    name,
    entityType,
    version,
    description: options.description,
    annotations: new Map(),
    extends: options.extends,
    tags: options.tags ?? [],
    metadata: options.metadata ?? {},
  };
}

/**
 * Get global semantic registry
 */
export function getSemanticRegistry(): SemanticRegistry {
  return SemanticRegistry.getInstance();
}
