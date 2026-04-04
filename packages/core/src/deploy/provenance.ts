/**
 * Provenance Generation for HoloScript Deploy
 *
 * Computes content-addressed hashes, extracts import trees,
 * and auto-classifies publish modes (Original/Remix/Curated)
 * for compiler-enforced provenance tracking.
 *
 * @module provenance
 */

import { createHash } from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

export type PublishMode = 'original' | 'remix' | 'curated';

export type LicenseType = 'free' | 'cc_by' | 'cc_by_sa' | 'cc_by_nc' | 'exclusive' | 'commercial';

export interface ProvenanceImport {
  /** Import path (file path or @username/name) */
  path: string;
  /** SHA-256 hash of the imported content (if resolvable) */
  hash?: string;
  /** Author of the imported content (if known) */
  author?: string;
}

export interface ProvenanceBlock {
  /** Author identifier (@username or freeform) */
  author: string;
  /** ISO 8601 timestamp of publication */
  created: string;
  /** SHA-256 hex hash of the composition source */
  hash: string;
  /** License type */
  license: LicenseType;
  /** Provenance version (for future schema evolution) */
  version: number;
  /** Auto-classified publish mode based on import tree */
  publishMode: PublishMode;
  /** Tracked imports with their hashes */
  imports: ProvenanceImport[];
}

export interface ProvenanceOptions {
  /** Author identifier */
  author: string;
  /** License to apply */
  license: LicenseType;
  /** Override creation timestamp (for testing; defaults to now) */
  createdAt?: string;
}

// =============================================================================
// HASH
// =============================================================================

/**
 * Compute SHA-256 hex hash of source content.
 * Normalizes line endings to LF before hashing for cross-platform consistency.
 */
export function computeContentHash(source: string): string {
  const normalized = source.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

// =============================================================================
// PUBLISH MODE CLASSIFICATION
// =============================================================================

/**
 * Auto-classify publish mode from AST structure.
 *
 * - **original**: No external imports. Everything is authored by the publisher.
 * - **remix**: Has imports AND has own authored content (objects, compositions, scenes).
 * - **curated**: Has imports but no own authored content (pure assembly of others' work).
 *
 * The compiler auto-classifies this — creators cannot override.
 */
export function classifyPublishMode(ast: any): PublishMode {
  const imports = ast?.imports ?? ast?.ast?.imports ?? [];
  const hasImports = Array.isArray(imports) && imports.length > 0;

  if (!hasImports) return 'original';

  // Check if the composition has its own authored content
  const body = ast?.body ?? ast?.ast?.body ?? [];
  const hasOwnContent =
    Array.isArray(body) &&
    body.some(
      (node: { type?: string }) =>
        node.type === 'composition' ||
        node.type === 'ObjectDeclaration' ||
        node.type === 'scene' ||
        node.type === 'object' ||
        node.type === 'character' ||
        node.type === 'environment'
    );

  if (hasOwnContent) return 'remix';
  return 'curated';
}

// =============================================================================
// IMPORT EXTRACTION
// =============================================================================

/**
 * Extract import metadata from AST for provenance tracking.
 */
export function extractImports(ast: any): ProvenanceImport[] {
  const imports = ast?.imports ?? ast?.ast?.imports ?? [];
  if (!Array.isArray(imports)) return [];

  return imports
    .map((imp: any) => ({
      path: imp.path ?? imp.source ?? '',
      hash: imp.hash,
      author: imp.author,
    }))
    .filter((imp: ProvenanceImport) => imp.path.length > 0);
}

// =============================================================================
// PROVENANCE GENERATION
// =============================================================================

/**
 * Generate a complete provenance block for a composition.
 *
 * @param source - Raw source code of the composition
 * @param ast - Parsed AST (from HoloScriptPlusParser)
 * @param options - Author, license, and optional timestamp override
 */
export function generateProvenance(
  source: string,
  ast: any,
  options: ProvenanceOptions
): ProvenanceBlock {
  return {
    author: options.author,
    created: options.createdAt ?? new Date().toISOString(),
    hash: computeContentHash(source),
    license: options.license,
    version: 1,
    publishMode: classifyPublishMode(ast),
    imports: extractImports(ast),
  };
}
