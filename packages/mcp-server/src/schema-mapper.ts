/**
 * Schema-to-Trait Mapper — Universal Domain Bridge
 *
 * Takes arbitrary structured data (JSON schema, CSV headers, database columns,
 * API response shapes) and automatically maps fields to HoloScript traits.
 * Then generates .holo compositions from those mappings.
 *
 * This is the keystone of the "Universal Semantic Platform" thesis:
 * any domain's data maps onto the trait system, any device renders it.
 *
 * The dispensary doesn't write .holo. The restaurant doesn't write .holo.
 * They point this at their data and get a spatial experience.
 *
 * @module schema-mapper
 * @version 1.0.0
 */

import { suggestTraits, suggestUniversalTraits } from './generators';

// =============================================================================
// TYPES
// =============================================================================

/** A field from the input schema */
export interface SchemaField {
  /** Field name (e.g., "product_name", "thc_percent", "price") */
  name: string;
  /** Field type (e.g., "string", "number", "boolean", "array", "object") */
  type: string;
  /** Optional description of the field */
  description?: string;
  /** Optional example value */
  example?: unknown;
  /** Whether the field is required */
  required?: boolean;
  /** For numeric fields: min/max range */
  range?: { min?: number; max?: number };
  /** For enum fields: possible values */
  enum?: string[];
}

/** Input schema — what the business provides */
export interface DataSchema {
  /** Name of the data source (e.g., "dispensary_menu", "restaurant_orders") */
  name: string;
  /** Optional domain hint (e.g., "retail", "healthcare", "hospitality") */
  domain?: string;
  /** Optional description of what this data represents */
  description?: string;
  /** The fields in the schema */
  fields: SchemaField[];
}

/** How a schema field maps to a HoloScript trait */
export interface TraitMapping {
  /** The original field from the schema */
  field: SchemaField;
  /** The HoloScript traits this field maps to */
  traits: string[];
  /** How the field value feeds into trait parameters */
  parameterBindings: ParameterBinding[];
  /** The visual/spatial role of this field in the composition */
  spatialRole: SpatialRole;
  /** Confidence in this mapping (0-1) */
  confidence: number;
  /** Why this mapping was chosen */
  reasoning: string;
}

/** How a schema field value binds to a trait parameter */
export interface ParameterBinding {
  trait: string;
  parameter: string;
  /** How to transform the field value for the trait */
  transform: 'direct' | 'label' | 'scale' | 'color' | 'position' | 'toggle' | 'enum_map';
}

/** What spatial role a field plays in the scene */
export type SpatialRole =
  | 'identity' // Object name/title — displayed as label
  | 'description' // Detailed text — shown on interaction
  | 'visual' // Texture, color, image — applied to mesh
  | 'metric' // Numeric value — shown as bar, gauge, or scale
  | 'category' // Grouping field — determines shelf/section/area
  | 'price' // Currency value — shown as tag, enables @credit
  | 'boolean_state' // On/off — toggles visibility or trait
  | 'relationship' // Foreign key — creates spatial link between objects
  | 'timestamp' // Date/time — affects timeline or lifecycle
  | 'media' // Image/video URL — applied as texture or popup
  | 'geospatial' // Lat/lng — placed on map or spatial anchor
  | 'hidden'; // Internal field — not rendered

/** Full mapping result */
export interface SchemaMappingResult {
  /** The input schema */
  schema: DataSchema;
  /** Per-field trait mappings */
  mappings: TraitMapping[];
  /** Global traits applied to every object (e.g., @pointable, @info_popup) */
  globalTraits: string[];
  /** Generated .holo composition source */
  holoSource: string;
  /** Compilation targets recommended by ModalitySelector */
  recommendedTargets: string[];
  /** Summary statistics */
  stats: {
    fieldsTotal: number;
    fieldsMapped: number;
    fieldsUnmapped: number;
    traitsUsed: number;
    averageConfidence: number;
  };
}

// =============================================================================
// FIELD TYPE → SPATIAL ROLE INFERENCE
// =============================================================================

/** Patterns that identify spatial roles from field names */
const ROLE_PATTERNS: Array<{ pattern: RegExp; role: SpatialRole; traits: string[] }> = [
  // Identity
  {
    pattern: /^(name|title|label|display_name|product_name|item_name|sku)$/i,
    role: 'identity',
    traits: ['@label', '@pointable'],
  },
  // Description
  {
    pattern: /(desc|description|summary|notes|details|about|bio|overview)$/i,
    role: 'description',
    traits: ['@info_popup', '@readable'],
  },
  // Price / Currency
  {
    pattern: /(price|cost|amount|fee|rate|msrp|retail_price|unit_price)$/i,
    role: 'price',
    traits: ['@label', '@credit'],
  },
  // Visual / Media
  {
    pattern: /(image|img|photo|picture|thumbnail|avatar|icon|logo|banner)(_url|_path|_uri)?$/i,
    role: 'media',
    traits: ['@texture', '@billboard'],
  },
  {
    pattern: /(video|media|clip|stream)(_url|_path|_uri)?$/i,
    role: 'media',
    traits: ['@video_player'],
  },
  // Metrics
  {
    pattern:
      /(percent|pct|ratio|score|rating|rank|level|count|quantity|stock|inventory|weight|volume|dose|potency|thc|cbd|strength)$/i,
    role: 'metric',
    traits: ['@gauge', '@label'],
  },
  // Category / Grouping
  {
    pattern:
      /(category|type|kind|class|group|section|department|shelf|aisle|strain_type|indica|sativa|hybrid|genre|tier|status)$/i,
    role: 'category',
    traits: ['@tag', '@filterable'],
  },
  // Boolean states
  {
    pattern:
      /(enabled|active|visible|available|in_stock|featured|premium|organic|lab_tested|verified|approved|published)$/i,
    role: 'boolean_state',
    traits: ['@toggleable'],
  },
  // Timestamps
  {
    pattern:
      /(date|time|created|updated|modified|expires|harvested|tested|manufactured|born|deadline)(_at|_on|_date)?$/i,
    role: 'timestamp',
    traits: ['@lifecycle'],
  },
  // Geospatial
  {
    pattern: /(lat|lng|latitude|longitude|location|coordinates|address|geo|position|place)$/i,
    role: 'geospatial',
    traits: ['@spatial_anchor', '@gps'],
  },
  // Relationships / Foreign keys
  {
    pattern: /(_id|_ref|parent|child|related|associated|linked|belongs_to|has_many)$/i,
    role: 'relationship',
    traits: ['@connectable'],
  },
  // Color
  { pattern: /(color|colour|hue|tint|shade|hex_color|rgb)$/i, role: 'visual', traits: ['@color'] },
];

/** Type-based fallback roles */
const TYPE_ROLE_FALLBACK: Record<string, SpatialRole> = {
  string: 'description',
  number: 'metric',
  boolean: 'boolean_state',
  array: 'hidden',
  object: 'hidden',
};

// =============================================================================
// MAPPING ENGINE
// =============================================================================

function inferSpatialRole(field: SchemaField): {
  role: SpatialRole;
  traits: string[];
  reasoning: string;
} {
  // 0. Check domain plugin keywords first (highest priority when plugin loaded)
  if (pluginKeywords) {
    const fieldLower = field.name.toLowerCase();
    for (const [term, mapping] of pluginKeywords) {
      if (fieldLower.includes(term)) {
        const role =
          (mapping.spatialRole as SpatialRole) || TYPE_ROLE_FALLBACK[field.type] || 'description';
        return {
          role,
          traits: mapping.traits,
          reasoning: `Domain plugin keyword "${term}" matched field "${field.name}"`,
        };
      }
    }
  }

  // 1. Pattern match on field name
  for (const { pattern, role, traits } of ROLE_PATTERNS) {
    if (pattern.test(field.name)) {
      return { role, traits, reasoning: `Field name "${field.name}" matches ${role} pattern` };
    }
  }

  // 2. Check description for hints
  if (field.description) {
    const descTraits = suggestTraits(field.description, field.name);
    if (descTraits.traits.length > 1) {
      // More than just @pointable default
      return {
        role: TYPE_ROLE_FALLBACK[field.type] || 'description',
        traits: descTraits.traits,
        reasoning: `Inferred from description: "${field.description.slice(0, 60)}..."`,
      };
    }
  }

  // 3. Check example value for hints
  if (field.example !== undefined) {
    if (typeof field.example === 'string' && /^https?:\/\//.test(field.example)) {
      return {
        role: 'media',
        traits: ['@texture', '@billboard'],
        reasoning: 'Example value is a URL',
      };
    }
    if (typeof field.example === 'number' && field.range) {
      return {
        role: 'metric',
        traits: ['@gauge', '@label'],
        reasoning: 'Numeric with range → gauge/metric',
      };
    }
  }

  // 4. Fall back to type
  const role = TYPE_ROLE_FALLBACK[field.type] || 'hidden';
  return {
    role,
    traits: role === 'hidden' ? [] : ['@label'],
    reasoning: `Fallback from type "${field.type}"`,
  };
}

function createParameterBindings(
  field: SchemaField,
  traits: string[],
  role: SpatialRole
): ParameterBinding[] {
  const bindings: ParameterBinding[] = [];

  for (const trait of traits) {
    switch (role) {
      case 'identity':
        bindings.push({ trait, parameter: 'text', transform: 'direct' });
        break;
      case 'description':
        bindings.push({ trait, parameter: 'content', transform: 'label' });
        break;
      case 'price':
        bindings.push({ trait, parameter: 'text', transform: 'label' });
        if (trait === '@credit') {
          bindings.push({ trait, parameter: 'price', transform: 'direct' });
        }
        break;
      case 'metric':
        bindings.push({ trait, parameter: 'value', transform: field.range ? 'scale' : 'direct' });
        break;
      case 'media':
        bindings.push({ trait, parameter: 'src', transform: 'direct' });
        break;
      case 'category':
        bindings.push({ trait, parameter: 'tag', transform: 'direct' });
        break;
      case 'boolean_state':
        bindings.push({ trait, parameter: 'enabled', transform: 'toggle' });
        break;
      case 'visual':
        bindings.push({ trait, parameter: 'color', transform: 'color' });
        break;
      case 'geospatial':
        bindings.push({ trait, parameter: 'position', transform: 'position' });
        break;
      default:
        bindings.push({ trait, parameter: 'value', transform: 'direct' });
    }
  }

  return bindings;
}

/** Domain plugin keyword map — loaded at runtime from installed plugins */
let pluginKeywords: Map<string, { traits: string[]; spatialRole?: string }> | null = null;

/** Register domain plugin keywords to enhance schema mapping accuracy */
export function registerDomainKeywords(
  keywords: Map<string, { traits: string[]; spatialRole?: string }>
) {
  pluginKeywords = keywords;
}

/** Clear registered domain keywords */
export function clearDomainKeywords() {
  pluginKeywords = null;
}

/** Map a full schema to traits */
export function mapSchemaToTraits(schema: DataSchema): SchemaMappingResult {
  const mappings: TraitMapping[] = [];
  const allTraits = new Set<string>();

  // Domain-level traits from schema description
  const domainContext = [schema.name, schema.domain, schema.description].filter(Boolean).join(' ');
  const domainSuggestion = suggestUniversalTraits(domainContext, schema.domain);
  const globalTraits = ['@pointable', '@info_popup', ...domainSuggestion.traits.slice(0, 3)];

  for (const field of schema.fields) {
    const { role, traits, reasoning } = inferSpatialRole(field);
    const bindings = createParameterBindings(field, traits, role);

    // Confidence based on how the mapping was determined
    let confidence = 0.5;
    if (reasoning.includes('matches')) confidence = 0.9; // Pattern match
    if (reasoning.includes('description')) confidence = 0.7; // Description inference
    if (reasoning.includes('Fallback')) confidence = 0.3; // Type fallback

    mappings.push({
      field,
      traits,
      parameterBindings: bindings,
      spatialRole: role,
      confidence,
      reasoning,
    });

    for (const t of traits) allTraits.add(t);
  }

  const holoSource = generateHoloComposition(schema, mappings, globalTraits);

  const mapped = mappings.filter((m) => m.spatialRole !== 'hidden');
  const stats = {
    fieldsTotal: schema.fields.length,
    fieldsMapped: mapped.length,
    fieldsUnmapped: schema.fields.length - mapped.length,
    traitsUsed: allTraits.size,
    averageConfidence:
      mapped.length > 0 ? mapped.reduce((sum, m) => sum + m.confidence, 0) / mapped.length : 0,
  };

  return {
    schema,
    mappings,
    globalTraits,
    holoSource,
    recommendedTargets: ['r3f', 'native-2d', 'openxr'],
    stats,
  };
}

// =============================================================================
// .HOLO COMPOSITION GENERATOR
// =============================================================================

/** Infer brand theme — neutral default, customizable via Studio theme panel */
function inferTheme(_schema: DataSchema): Record<string, string> {
  // Neutral default. Domain-specific themes are NOT hardcoded into the platform.
  // The business customizes via Studio's theme panel or by editing the theme {} block.
  // Domain vocabulary lives in the knowledge store, not in compiler code.
  return {
    primary: '#2563eb',
    secondary: '#f8fafc',
    accent: '#f59e0b',
    shelf_material: 'wood_light',
    card_style: 'rounded',
  };
}

function generateHoloComposition(
  schema: DataSchema,
  mappings: TraitMapping[],
  globalTraits: string[]
): string {
  const lines: string[] = [];
  const name = schema.name.replace(/[^a-zA-Z0-9_]/g, '_');
  const theme = inferTheme(schema);

  lines.push(`composition "${name}" {`);

  // Theme block — brand identity tokens
  lines.push(`  theme {`);
  for (const [key, value] of Object.entries(theme)) {
    lines.push(`    ${key}: "${value}"`);
  }
  lines.push(`  }`);
  lines.push('');

  lines.push(`  environment {`);
  lines.push(`    background: "${theme.secondary}"`);
  lines.push(`    ambient_light: 0.6`);
  lines.push(`    fog: false`);
  lines.push(`  }`);
  lines.push('');

  // Template object from the schema
  lines.push(`  // Auto-generated from ${schema.fields.length} schema fields`);
  lines.push(`  // Domain: ${schema.domain || 'auto-detected'}`);
  lines.push(`  template "${name}_item" {`);

  // Global traits
  for (const trait of globalTraits) {
    lines.push(`    ${trait}`);
  }

  // Per-field trait annotations
  const visibleMappings = mappings.filter((m) => m.spatialRole !== 'hidden');
  for (const mapping of visibleMappings) {
    const fieldComment = mapping.field.description
      ? ` // ${mapping.field.description.slice(0, 50)}`
      : '';

    for (const trait of mapping.traits) {
      const binding = mapping.parameterBindings.find((b) => b.trait === trait);
      if (binding) {
        const bindExpr = `__bind:${mapping.field.name}`;
        lines.push(`    ${trait}(${binding.parameter}: "${bindExpr}")${fieldComment}`);
      } else {
        lines.push(`    ${trait}${fieldComment}`);
      }
    }
  }

  // Geometry
  lines.push('    geometry: "box"');
  lines.push('    scale: [0.3, 0.3, 0.3]');
  lines.push(`  }`);
  lines.push('');

  // Layout: categorized grid
  const categoryField = mappings.find((m) => m.spatialRole === 'category');
  if (categoryField) {
    lines.push(`  // Items grouped by ${categoryField.field.name}`);
    lines.push(`  spatial_group "shelves" {`);
    lines.push(`    layout: "grid"`);
    lines.push(`    group_by: "${categoryField.field.name}"`);
    lines.push(`    spacing: [1, 0.5, 1]`);
    lines.push(`  }`);
  } else {
    lines.push(`  spatial_group "display" {`);
    lines.push(`    layout: "grid"`);
    lines.push(`    columns: 4`);
    lines.push(`    spacing: [1, 0.5, 1]`);
    lines.push(`  }`);
  }

  lines.push('}');
  return lines.join('\n');
}

// =============================================================================
// MCP TOOL HANDLER
// =============================================================================

/**
 * Try to load domain plugin keywords from a context JSON file.
 * Checks packages/plugins/domain-plugin-template/contexts/{domain}.json
 */
function tryLoadDomainPlugin(domain: string | undefined): boolean {
  if (!domain) return false;
  try {
    // Dynamic import of plugin context — works at runtime if file exists
    const fs = require('fs');
    const path = require('path');
    const contextPath = path.resolve(
      __dirname,
      '../../plugins/domain-plugin-template/contexts',
      `${domain}.json`
    );
    if (!fs.existsSync(contextPath)) return false;

    const config = JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
    const keywords = new Map<string, { traits: string[]; spatialRole?: string }>();
    for (const mod of config.modules || []) {
      for (const kw of mod.keywords || []) {
        keywords.set(kw.term.toLowerCase(), { traits: kw.traits, spatialRole: kw.spatialRole });
      }
    }
    registerDomainKeywords(keywords);
    return true;
  } catch {
    return false;
  }
}

export async function handleMapSchema(args: Record<string, unknown>): Promise<unknown> {
  const { schema, fields, name, domain, description } = args as {
    schema?: DataSchema;
    fields?: SchemaField[];
    name?: string;
    domain?: string;
    description?: string;
  };

  let dataSchema: DataSchema;
  if (schema) {
    dataSchema = schema;
  } else if (fields && name) {
    dataSchema = { name, domain, description, fields };
  } else {
    return { success: false, error: 'Provide either a "schema" object or "name" + "fields" array' };
  }

  // Load domain plugin if available
  const pluginLoaded = tryLoadDomainPlugin(dataSchema.domain);

  const result = mapSchemaToTraits(dataSchema);

  // Clean up plugin state after mapping
  if (pluginLoaded) clearDomainKeywords();

  return { success: true, pluginUsed: pluginLoaded, ...result };
}

export async function handleMapCsvHeaders(args: Record<string, unknown>): Promise<unknown> {
  const { headers, name, domain, description, sample_row } = args as {
    headers: string[];
    name?: string;
    domain?: string;
    description?: string;
    sample_row?: Record<string, unknown>;
  };

  if (!headers || !Array.isArray(headers)) {
    return { success: false, error: 'Provide a "headers" string array' };
  }

  // Infer field types from sample row
  const fields: SchemaField[] = headers.map((h) => {
    const example = sample_row?.[h];
    let type = 'string';
    if (typeof example === 'number') type = 'number';
    if (typeof example === 'boolean') type = 'boolean';

    return { name: h, type, example };
  });

  const schema: DataSchema = {
    name: name || 'imported_data',
    domain,
    description,
    fields,
  };

  const pluginLoaded = tryLoadDomainPlugin(schema.domain);
  const result = mapSchemaToTraits(schema);
  if (pluginLoaded) clearDomainKeywords();
  return { success: true, pluginUsed: pluginLoaded, ...result };
}
