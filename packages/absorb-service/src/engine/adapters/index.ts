/**
 * Language Adapter Registry
 *
 * Central registry for all language adapters. Maps file extensions
 * to the appropriate adapter for symbol extraction.
 */

import type { LanguageAdapter, SupportedLanguage } from '../types';
import { TypeScriptAdapter } from './TypeScriptAdapter';
import { PythonAdapter } from './PythonAdapter';
import { RustAdapter } from './RustAdapter';
import { GoAdapter } from './GoAdapter';
import { HoloAdapter } from './HoloAdapter';

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
registerAdapter(new PythonAdapter());
registerAdapter(new RustAdapter());
registerAdapter(new GoAdapter());
// Native `.holo`/`.hsplus` adapter — bypasses tree-sitter and parses via
// `@holoscript/core` `parseHoloPartial()`. Falls back to regex imports
// if `@holoscript/core` (optional peer dep) is unavailable at runtime.
registerAdapter(new HoloAdapter());

// Re-export adapters for direct use
export { TypeScriptAdapter } from './TypeScriptAdapter';
export { PythonAdapter } from './PythonAdapter';
export { RustAdapter } from './RustAdapter';
export { GoAdapter } from './GoAdapter';
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
