/**
 * Adapter Manager
 *
 * Manages tree-sitter parser instances for multiple languages.
 * Lazy-loads grammars on demand with native → WASM → graceful degradation
 * fallback (mirrors TreeSitterManager pattern from packages/lsp/).
 */

import type { ParseTree, SupportedLanguage } from './types';
import { getAdapterForLanguage } from './adapters';

/** Minimal tree-sitter Parser interface */
interface TSParser {
  setLanguage(lang: unknown): void;
  parse(input: string): ParseTree;
}

interface LanguageState {
  parser: TSParser | null;
  language: unknown;
  backend: 'native' | 'wasm' | 'none';
  error?: string;
}

export class AdapterManager {
  private languages = new Map<SupportedLanguage, LanguageState>();
  private wasmInitialized = false;
  private TreeSitterWasm: any = null;

  /**
   * Parse a source file using the appropriate tree-sitter grammar.
   * Lazy-loads the grammar on first use.
   */
  async parse(source: string, language: SupportedLanguage): Promise<ParseTree | null> {
    const state = await this.ensureLanguage(language);
    if (!state.parser) return null;
    return state.parser.parse(source);
  }

  /**
   * Check if a language grammar is available.
   */
  async isAvailable(language: SupportedLanguage): Promise<boolean> {
    const state = await this.ensureLanguage(language);
    return state.parser !== null;
  }

  /**
   * Get the backend type for a language ('native', 'wasm', or 'none').
   */
  getBackend(language: SupportedLanguage): 'native' | 'wasm' | 'none' {
    return this.languages.get(language)?.backend ?? 'none';
  }

  /**
   * Pre-load grammars for a set of languages.
   * Useful for warming up before scanning.
   */
  async preload(languages: SupportedLanguage[]): Promise<Map<SupportedLanguage, boolean>> {
    const results = new Map<SupportedLanguage, boolean>();
    await Promise.all(
      languages.map(async (lang) => {
        const available = await this.isAvailable(lang);
        results.set(lang, available);
      }),
    );
    return results;
  }

  // ── Private: Grammar loading ────────────────────────────────────────────

  private async ensureLanguage(language: SupportedLanguage): Promise<LanguageState> {
    const existing = this.languages.get(language);
    if (existing) return existing;

    // HoloScript handled by the existing TreeSitterManager in packages/lsp
    if (language === 'holoscript') {
      const state: LanguageState = { parser: null, language: null, backend: 'none', error: 'Use TreeSitterManager for HoloScript' };
      this.languages.set(language, state);
      return state;
    }

    // Try native, then WASM
    const state = await this.loadNative(language) || await this.loadWasm(language);
    const result = state ?? { parser: null, language: null, backend: 'none' as const, error: `No grammar available for ${language}` };
    this.languages.set(language, result);
    return result;
  }

  private async loadNative(language: SupportedLanguage): Promise<LanguageState | null> {
    try {
      const adapter = getAdapterForLanguage(language);
      if (!adapter) return null;

      // Dynamic require for native tree-sitter
      const TreeSitter = require('tree-sitter');
      const grammar = this.requireNativeGrammar(adapter.grammarPackage, language);
      if (!grammar) return null;

      const parser = new TreeSitter() as TSParser;
      parser.setLanguage(grammar);

      return { parser, language: grammar, backend: 'native' };
    } catch {
      return null;
    }
  }

  private requireNativeGrammar(packageName: string, language: SupportedLanguage): unknown {
    try {
      // tree-sitter-typescript exports { typescript, tsx }
      if (language === 'typescript') {
        const pkg = require(packageName);
        return pkg.typescript || pkg;
      }
      if (language === 'javascript') {
        try {
          return require('tree-sitter-javascript');
        } catch {
          const pkg = require(packageName);
          return pkg.javascript || pkg;
        }
      }
      return require(packageName);
    } catch {
      return null;
    }
  }

  private async loadWasm(language: SupportedLanguage): Promise<LanguageState | null> {
    try {
      if (!this.wasmInitialized) {
        const WebTreeSitter = require('web-tree-sitter');
        await WebTreeSitter.init();
        this.TreeSitterWasm = WebTreeSitter;
        this.wasmInitialized = true;
      }

      const adapter = getAdapterForLanguage(language);
      if (!adapter) return null;

      // Try to find the WASM file
      const wasmPath = this.resolveWasmPath(adapter.grammarPackage, language);
      if (!wasmPath) return null;

      const lang = await this.TreeSitterWasm.Language.load(wasmPath);
      const parser = new this.TreeSitterWasm() as TSParser;
      parser.setLanguage(lang);

      return { parser, language: lang, backend: 'wasm' };
    } catch {
      return null;
    }
  }

  private resolveWasmPath(packageName: string, language: SupportedLanguage): string | null {
    try {
      const path = require('path');
      const packagePath = require.resolve(`${packageName}/package.json`);
      const packageDir = path.dirname(packagePath);

      // Common WASM file locations
      const candidates = [
        path.join(packageDir, `tree-sitter-${language}.wasm`),
        path.join(packageDir, 'tree-sitter.wasm'),
        path.join(packageDir, `${language}.wasm`),
      ];

      const fs = require('fs');
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
      }
      return null;
    } catch {
      return null;
    }
  }
}
