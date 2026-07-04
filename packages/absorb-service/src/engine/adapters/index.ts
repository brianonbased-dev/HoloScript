/**
 * Language Adapter Registry
 *
 * Central registry for all language adapters. Maps file extensions
 * to the appropriate adapter for symbol extraction.
 *
 * DATA SSOT: ./language-registry.json is generated from SupportedLanguage,
 * registered adapters, adapter metadata, and language-adapters/*.holo
 * @language_adapter declarations. The drift gate
 * `scripts/check-language-registry.mjs` enforces the generated artifact: every
 * adapter registered below MUST appear there as implemented/native, and every
 * implemented grammar MUST be an installed dep.
 */

import type { LanguageAdapter, SupportedLanguage } from '../types';
import { TypeScriptAdapter } from './TypeScriptAdapter';
import { HoloAdapter } from './HoloAdapter';
import { TreeSitterTraitAdapter } from './TreeSitterTraitAdapter';
import { LANGUAGE_TRAITS } from './language-traits';

const adaptersByLanguage = new Map<SupportedLanguage, LanguageAdapter>();
const extensionMap = new Map<string, SupportedLanguage>();

/**
 * Register a language adapter.
 */
export function registerAdapter(adapter: LanguageAdapter): void {
  adaptersByLanguage.set(adapter.language, adapter);
  for (const ext of adapter.extensions) {
    extensionMap.set(ext, adapter.language);
  }
}

/**
 * Get the adapter for a file based on its extension.
 */
export function getAdapterForFile(filePath: string): LanguageAdapter | null {
  const ext = getExtension(filePath);
  const lang = extensionMap.get(ext);
  if (!lang) return null;
  return adaptersByLanguage.get(lang) ?? null;
}

/**
 * Get the adapter for a specific language.
 */
export function getAdapterForLanguage(language: SupportedLanguage): LanguageAdapter | null {
  return adaptersByLanguage.get(language) ?? null;
}

/**
 * Get all registered language identifiers.
 */
export function getSupportedLanguages(): SupportedLanguage[] {
  return Array.from(adaptersByLanguage.keys());
}

/**
 * Get all supported file extensions.
 */
export function getSupportedExtensions(): string[] {
  return Array.from(extensionMap.keys());
}

/**
 * Detect the language of a file from its extension.
 */
export function detectLanguage(filePath: string): SupportedLanguage | null {
  const ext = getExtension(filePath);
  return extensionMap.get(ext) ?? null;
}

function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filePath.slice(lastDot).toLowerCase();
}

// ── Register built-in adapters ──────────────────────────────────────────────

registerAdapter(new TypeScriptAdapter());
// Rust, Go, Python, and Ruby are now AUTHORED as `language-adapters/{rust,go,python,ruby}.holo`
// (@language_adapter) — they register via the LANGUAGE_TRAITS loop below through the generic
// TreeSitterTraitAdapter, at parity with the deleted bespoke GoAdapter / PythonAdapter /
// RustAdapter (see the *AdapterParity tests).
// Data-driven languages are AUTHORED as `language-adapters/*.holo` (@language_adapter) and
// @generated into LANGUAGE_TRAITS — no per-language adapter class, and no edit here to add one.
// The generic TreeSitterTraitAdapter provides the full symbol/import/call extraction.
for (const trait of LANGUAGE_TRAITS) {
  registerAdapter(new TreeSitterTraitAdapter(trait));
}
// Native `.holo`/`.hsplus` adapter — bypasses tree-sitter and parses via
// `@holoscript/core` `parseHoloPartial()`. Falls back to regex imports
// if `@holoscript/core` (optional peer dep) is unavailable at runtime.
registerAdapter(new HoloAdapter());

// Re-export adapters for direct use
export { TypeScriptAdapter } from './TypeScriptAdapter';
export { HoloAdapter, isNativeAdapter, type HoloParseTree } from './HoloAdapter';
// Re-export base utilities
export {
  walkTree,
  extractDocComment,
  nodeToSymbol,
  getFieldText,
  hasModifier,
  extractVisibility,
} from './BaseAdapter';
