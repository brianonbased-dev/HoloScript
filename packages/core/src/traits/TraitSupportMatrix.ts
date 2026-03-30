/**
 * TraitSupportMatrix -- Machine-readable trait support matrix generator.
 *
 * Scans all trait handlers in @holoscript/core and generates a JSON/YAML
 * matrix showing which platforms/features each trait supports.
 *
 * TARGET: packages/core/src/traits/TraitSupportMatrix.ts
 *
 * Output format:
 * {
 *   "traits": {
 *     "grabbable": {
 *       "category": "interaction",
 *       "platforms": { "r3f": true, "gltf": false, "unity": true, "unreal": true },
 *       "features": ["haptic_feedback", "two_handed", "snap_to_hand"],
 *       "properties": [
 *         { "name": "snap_to_hand", "type": "boolean", "default": true },
 *         ...
 *       ],
 *       "requires": [],
 *       "conflicts": [],
 *       "coverage": { "hasExample": true, "hasTest": false, "hasDoc": true }
 *     }
 *   }
 * }
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export interface TraitPlatformSupport {
  r3f: boolean;
  gltf: boolean;
  unity: boolean;
  unreal: boolean;
  babylon: boolean;
  webxr: boolean;
  arcore: boolean;
  arkit: boolean;
}

export interface TraitPropertyInfo {
  name: string;
  type: string;
  required: boolean;
  default?: unknown;
  min?: number;
  max?: number;
  enumValues?: string[];
  description?: string;
}

export interface TraitCoverage {
  hasExample: boolean;
  hasTest: boolean;
  hasDoc: boolean;
  exampleFiles?: string[];
  testFiles?: string[];
}

export interface TraitMatrixEntry {
  name: string;
  category: string;
  platforms: TraitPlatformSupport;
  features: string[];
  properties: TraitPropertyInfo[];
  requires: string[];
  conflicts: string[];
  coverage: TraitCoverage;
}

export interface TraitSupportMatrixData {
  version: string;
  generatedAt: string;
  totalTraits: number;
  coveragePercent: number;
  traits: Record<string, TraitMatrixEntry>;
  categories: Record<string, string[]>;
  platformCounts: Record<string, number>;
}

// =============================================================================
// PLATFORM DETECTION HEURISTICS
// =============================================================================

/**
 * Detect platform support by analyzing trait source code patterns.
 * This is a heuristic approach that looks for platform-specific imports,
 * API calls, and compilation target references.
 */
function detectPlatformSupport(traitSource: string, traitName: string): TraitPlatformSupport {
  const lower = traitSource.toLowerCase();

  return {
    // R3F support is assumed for all traits that have basic property definitions
    r3f: true,

    // GLTF support detected by GLTF extension references or export mentions
    gltf:
      lower.includes('gltf') ||
      lower.includes('glb') ||
      lower.includes('accessor') ||
      lower.includes('buffer'),

    // Unity support detected by Unity-specific APIs or C# codegen
    unity:
      lower.includes('unity') ||
      lower.includes('monobehaviour') ||
      lower.includes('serializefield') ||
      lower.includes('gameobject'),

    // Unreal support detected by Unreal-specific APIs
    unreal:
      lower.includes('unreal') ||
      lower.includes('uobject') ||
      lower.includes('uproperty') ||
      lower.includes('blueprintcallable'),

    // Babylon support
    babylon: lower.includes('babylon') || lower.includes('abstractmesh'),

    // WebXR support
    webxr:
      lower.includes('webxr') ||
      lower.includes('xrsession') ||
      lower.includes('xrframe') ||
      traitName.includes('xr') ||
      traitName.includes('ar') ||
      traitName.includes('vr'),

    // ARCore support
    arcore: lower.includes('arcore') || (lower.includes('anchor') && lower.includes('android')),

    // ARKit support
    arkit:
      lower.includes('arkit') ||
      traitName.includes('lidar') ||
      (lower.includes('anchor') && lower.includes('ios')),
  };
}

/**
 * Extract properties from a trait source file.
 * Looks for defaultConfig objects, interface definitions, and parameter patterns.
 */
function extractProperties(traitSource: string): TraitPropertyInfo[] {
  const properties: TraitPropertyInfo[] = [];
  const seen = new Set<string>();

  // Pattern 1: defaultConfig = { key: value }
  const configMatch = traitSource.match(/defaultConfig\s*[:=]\s*\{([^}]+)\}/s);
  if (configMatch) {
    const configBlock = configMatch[1];
    const propRegex = /(\w+)\s*:\s*([^,\n}]+)/g;
    let m;
    while ((m = propRegex.exec(configBlock)) !== null) {
      const name = m[1];
      const valueStr = m[2].trim();
      if (seen.has(name)) continue;
      seen.add(name);

      let type = 'any';
      let defaultValue: unknown = undefined;

      if (valueStr === 'true' || valueStr === 'false') {
        type = 'boolean';
        defaultValue = valueStr === 'true';
      } else if (!isNaN(Number(valueStr))) {
        type = 'number';
        defaultValue = Number(valueStr);
      } else if (valueStr.startsWith("'") || valueStr.startsWith('"')) {
        type = 'string';
        defaultValue = valueStr.replace(/['"]/g, '');
      } else if (valueStr.startsWith('[')) {
        type = 'array';
      } else if (valueStr.startsWith('{')) {
        type = 'object';
      }

      properties.push({
        name,
        type,
        required: false,
        default: defaultValue,
      });
    }
  }

  // Pattern 2: Interface definitions with JSDoc
  const interfaceMatch = traitSource.match(/interface\s+\w+Config\s*\{([^}]+)\}/s);
  if (interfaceMatch) {
    const interfaceBlock = interfaceMatch[1];
    const propRegex = /(?:\/\*\*[^*]*\*\/\s*)?(\w+)(\?)?:\s*(\w+)/g;
    let m;
    while ((m = propRegex.exec(interfaceBlock)) !== null) {
      const name = m[1];
      if (seen.has(name)) continue;
      seen.add(name);

      properties.push({
        name,
        type: m[3],
        required: !m[2],
      });
    }
  }

  return properties;
}

/**
 * Detect trait category from file path and content.
 */
function detectCategory(filePath: string, traitSource: string): string {
  const lower = filePath.toLowerCase();

  if (lower.includes('visual') || lower.includes('render')) return 'visual';
  if (lower.includes('physics')) return 'physics';
  if (lower.includes('interaction') || lower.includes('grab') || lower.includes('click'))
    return 'interaction';
  if (lower.includes('audio') || lower.includes('sound')) return 'audio';
  if (lower.includes('network') || lower.includes('sync') || lower.includes('multiplayer'))
    return 'networking';
  if (lower.includes('ai') || lower.includes('npc') || lower.includes('behavior'))
    return 'intelligence';
  if (lower.includes('xr') || lower.includes('ar') || lower.includes('vr')) return 'xr';
  if (lower.includes('accessibility') || lower.includes('a11y')) return 'accessibility';

  // Content-based detection
  const content = traitSource.toLowerCase();
  if (content.includes('rigidbody') || content.includes('collision')) return 'physics';
  if (content.includes('animation') || content.includes('keyframe')) return 'animation';
  if (content.includes('material') || content.includes('shader')) return 'visual';

  return 'other';
}

// =============================================================================
// MATRIX GENERATOR
// =============================================================================

export interface TraitFileInfo {
  name: string;
  filePath: string;
  source: string;
}

/**
 * Generate a complete trait support matrix from trait file information.
 *
 * @param traitFiles - Array of trait file info (name, path, source content)
 * @param exampleFiles - Set of trait names that have example coverage
 * @param testFiles - Set of trait names that have test coverage
 * @param docFiles - Set of trait names that have documentation
 */
export function generateTraitSupportMatrix(
  traitFiles: TraitFileInfo[],
  exampleFiles: Set<string> = new Set(),
  testFiles: Set<string> = new Set(),
  docFiles: Set<string> = new Set()
): TraitSupportMatrixData {
  const traits: Record<string, TraitMatrixEntry> = {};
  const categories: Record<string, string[]> = {};
  const platformCounts: Record<string, number> = {
    r3f: 0,
    gltf: 0,
    unity: 0,
    unreal: 0,
    babylon: 0,
    webxr: 0,
    arcore: 0,
    arkit: 0,
  };

  for (const file of traitFiles) {
    const traitName = file.name
      .replace(/Trait$/, '')
      .replace(/([A-Z])/g, (m, c, i) => (i > 0 ? '_' : '') + c.toLowerCase());

    const category = detectCategory(file.filePath, file.source);
    const platforms = detectPlatformSupport(file.source, traitName);
    const properties = extractProperties(file.source);

    // Extract requires/conflicts from source
    const requires: string[] = [];
    const conflicts: string[] = [];
    const requiresMatch = file.source.match(/requires\s*[:=]\s*\[([^\]]+)\]/);
    if (requiresMatch) {
      requires.push(
        ...(requiresMatch[1].match(/['"](\w+)['"]/g)?.map((s) => s.replace(/['"]/g, '')) || [])
      );
    }
    const conflictsMatch = file.source.match(/conflictsWith\s*[:=]\s*\[([^\]]+)\]/);
    if (conflictsMatch) {
      conflicts.push(
        ...(conflictsMatch[1].match(/['"](\w+)['"]/g)?.map((s) => s.replace(/['"]/g, '')) || [])
      );
    }

    // Extract features
    const features: string[] = properties.map((p) => p.name);

    const coverage: TraitCoverage = {
      hasExample: exampleFiles.has(traitName),
      hasTest: testFiles.has(traitName),
      hasDoc: docFiles.has(traitName),
    };

    traits[traitName] = {
      name: traitName,
      category,
      platforms,
      features,
      properties,
      requires,
      conflicts,
      coverage,
    };

    // Update category index
    if (!categories[category]) categories[category] = [];
    categories[category].push(traitName);

    // Update platform counts
    for (const [platform, supported] of Object.entries(platforms)) {
      if (supported) platformCounts[platform]++;
    }
  }

  const totalTraits = Object.keys(traits).length;
  const coveredTraits = Object.values(traits).filter(
    (t) => t.coverage.hasExample || t.coverage.hasTest
  ).length;

  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    totalTraits,
    coveragePercent: totalTraits > 0 ? Math.round((coveredTraits / totalTraits) * 100) : 0,
    traits,
    categories,
    platformCounts,
  };
}

/**
 * Serialize the matrix to JSON.
 */
export function matrixToJSON(matrix: TraitSupportMatrixData): string {
  return JSON.stringify(matrix, null, 2);
}

/**
 * Serialize the matrix to YAML.
 */
export function matrixToYAML(matrix: TraitSupportMatrixData): string {
  const lines: string[] = [];
  lines.push(`version: "${matrix.version}"`);
  lines.push(`generatedAt: "${matrix.generatedAt}"`);
  lines.push(`totalTraits: ${matrix.totalTraits}`);
  lines.push(`coveragePercent: ${matrix.coveragePercent}`);
  lines.push('');
  lines.push('traits:');

  for (const [name, entry] of Object.entries(matrix.traits)) {
    lines.push(`  ${name}:`);
    lines.push(`    category: ${entry.category}`);
    lines.push(`    platforms:`);
    for (const [platform, supported] of Object.entries(entry.platforms)) {
      lines.push(`      ${platform}: ${supported}`);
    }
    if (entry.requires.length > 0) {
      lines.push(`    requires: [${entry.requires.join(', ')}]`);
    }
    if (entry.conflicts.length > 0) {
      lines.push(`    conflicts: [${entry.conflicts.join(', ')}]`);
    }
    lines.push(`    properties:`);
    for (const prop of entry.properties) {
      lines.push(`      - name: ${prop.name}`);
      lines.push(`        type: ${prop.type}`);
      if (prop.default !== undefined) {
        lines.push(`        default: ${JSON.stringify(prop.default)}`);
      }
    }
    lines.push(`    coverage:`);
    lines.push(`      hasExample: ${entry.coverage.hasExample}`);
    lines.push(`      hasTest: ${entry.coverage.hasTest}`);
    lines.push(`      hasDoc: ${entry.coverage.hasDoc}`);
  }

  return lines.join('\n');
}
