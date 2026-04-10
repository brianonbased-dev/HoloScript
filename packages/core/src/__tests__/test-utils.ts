/**
 * HoloScript+ Test Utilities
 *
 * Helpers for testing .hsplus files and parser output
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import { VR_TRAITS } from '../constants';
import type { VRTraitName } from '../types/HoloScriptPlus';

// ============================================================================
// File Loading Utilities
// ============================================================================

/**
 * Load a .hsplus file from the fixtures directory
 */
export function loadFixture(name: string): string {
  const fixturesDir = resolve(__dirname, 'fixtures');
  const filePath = name.endsWith('.hsplus')
    ? join(fixturesDir, name)
    : join(fixturesDir, `${name}.hsplus`);

  if (!existsSync(filePath)) {
    throw new Error(`Fixture not found: ${filePath}`);
  }

  return readFileSync(filePath, 'utf-8');
}

/**
 * Load a .hsplus file from the examples directory
 */
export function loadExample(name: string): string {
  const examplesDir = resolve(__dirname, '../../../../examples');
  const filePath = name.endsWith('.hsplus')
    ? join(examplesDir, name)
    : join(examplesDir, `${name}.hsplus`);

  if (!existsSync(filePath)) {
    throw new Error(`Example not found: ${filePath}`);
  }

  return readFileSync(filePath, 'utf-8');
}

/**
 * Get all fixture files
 */
export function getAllFixtures(): string[] {
  const fixturesDir = resolve(__dirname, 'fixtures');
  if (!existsSync(fixturesDir)) return [];
  return readdirSync(fixturesDir).filter((f) => f.endsWith('.hsplus'));
}

/**
 * Get all example files
 */
export function getAllExamples(): string[] {
  const examplesDir = resolve(__dirname, '../../../../examples');
  if (!existsSync(examplesDir)) return [];
  return readdirSync(examplesDir).filter((f) => f.endsWith('.hsplus'));
}

// ============================================================================
// Parser Helpers
// ============================================================================

/**
 * Create a parser instance with default options
 */
export function createTestParser(): HoloScriptPlusParser {
  return new HoloScriptPlusParser();
}

/**
 * Parse source and return result with error context
 */
export function parseWithContext(source: string) {
  const parser = createTestParser();
  const result = parser.parse(source);

  return {
    ...result,
    source,
    parser,
    // Helper to get a specific node by id
    getNode: (id: string) => {
      if (!result.ast?.root?.children) return null;
      return result.ast.root.children.find((n: any) => n.id === id);
    },
    // Helper to get all nodes with a specific trait
    getNodesWithTrait: (trait: VRTraitName) => {
      if (!result.ast?.root?.children) return [];
      return result.ast.root.children.filter((n: any) => n.traits?.has?.(trait));
    },
  };
}

/**
 * Parse and expect success
 */
export function parseExpectSuccess(source: string) {
  const result = parseWithContext(source);
  if (!result.success) {
    const errors = result.errors?.map((e: any) => e.message).join('\n') || 'Unknown error';
    throw new Error(`Parse failed:\n${errors}\n\nSource:\n${source}`);
  }
  return result;
}

/**
 * Parse and expect failure
 */
export function parseExpectFailure(source: string) {
  const result = parseWithContext(source);
  if (result.success) {
    throw new Error(`Expected parse to fail but it succeeded.\n\nSource:\n${source}`);
  }
  return result;
}

// ============================================================================
// AST Assertion Helpers
// ============================================================================

/**
 * Assert that a node has a specific trait
 */
export function assertHasTrait(
  node: any,
  traitName: VRTraitName,
  config?: Record<string, unknown>
) {
  if (!node.traits?.has?.(traitName)) {
    throw new Error(`Expected node to have trait @${traitName}`);
  }

  if (config) {
    const traitConfig = node.traits.get(traitName);
    for (const [key, value] of Object.entries(config)) {
      if (traitConfig[key] !== value) {
        throw new Error(
          `Expected trait @${traitName} to have ${key}=${JSON.stringify(value)}, ` +
            `got ${JSON.stringify(traitConfig[key])}`
        );
      }
    }
  }
}

/**
 * Assert that a node has a specific property value
 */
export function assertProperty(node: any, key: string, value: unknown) {
  if (node.properties?.[key] !== value) {
    throw new Error(
      `Expected property ${key}=${JSON.stringify(value)}, ` +
        `got ${JSON.stringify(node.properties?.[key])}`
    );
  }
}

/**
 * Assert node type
 */
export function assertNodeType(node: any, type: string) {
  if (node.type !== type) {
    throw new Error(`Expected node type "${type}", got "${node.type}"`);
  }
}

// ============================================================================
// Snapshot Helpers
// ============================================================================

/**
 * Serialize AST for snapshot testing (removes non-deterministic data)
 */
export function serializeAST(ast: any): string {
  return JSON.stringify(
    ast,
    (key, value) => {
      // Convert Maps to objects for serialization
      if (value instanceof Map) {
        return Object.fromEntries(value);
      }
      // Remove position info for cleaner snapshots
      if (key === 'position' || key === 'loc') {
        return undefined;
      }
      return value;
    },
    2
  );
}

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generate a simple orb definition
 */
export function generateOrb(
  id: string,
  traits: string[] = [],
  props: Record<string, unknown> = {}
): string {
  const traitStr = traits.map((t) => `@${t}`).join(' ');
  const propsStr = Object.entries(props)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
    .join('\n');

  return `orb#${id} ${traitStr} {\n${propsStr}\n}`;
}

/**
 * Generate a scene with multiple objects
 */
export function generateScene(
  objects: Array<{ type: string; id: string; traits?: string[]; props?: Record<string, unknown> }>
): string {
  return objects
    .map((obj) => {
      const traitStr = obj.traits?.map((t) => `@${t}`).join(' ') || '';
      const propsStr = Object.entries(obj.props || {})
        .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
        .join('\n');
      return `${obj.type}#${obj.id} ${traitStr} {\n${propsStr}\n}`;
    })
    .join('\n\n');
}

// ============================================================================
// Trait Testing Helpers
// ============================================================================

/**
 * All VR traits for exhaustive testing (1,525+ traits from 61 category modules)
 */
export const ALL_VR_TRAITS: VRTraitName[] = [...VR_TRAITS] as VRTraitName[];

/**
 * Test that all traits can be parsed
 */
export function testAllTraitsparse(parser: HoloScriptPlusParser) {
  const results: Array<{ trait: string; success: boolean; error?: string }> = [];

  for (const trait of ALL_VR_TRAITS) {
    const source = `orb#test @${trait} { position: [0, 0, 0] }`;
    try {
      const result = parser.parse(source);
      results.push({ trait, success: result.success ?? false });
    } catch (e) {
      results.push({ trait, success: false, error: (e as Error).message });
    }
  }

  return results;
}
