/**
 * Language Traits — languages declared as DATA, not bespoke adapter classes.
 *
 * Each LanguageTrait is the runtime, code-shaped form of an @language_adapter
 * declaration (see docs/language-adapter-trait.md). The generic
 * TreeSitterTraitAdapter consumes one of these and implements the full
 * LanguageAdapter contract — so adding a language is authoring a config object,
 * NOT writing a new TypeScriptAdapter-style class.
 *
 * This is the proof of sug_1780711395408_m35r step 2: Ruby below has zero
 * bespoke extraction code. The hand-written per-language adapters (TypeScript,
 * Python, Rust, Go) stay until a trait reproduces their extraction at parity —
 * migrate per-language, never big-bang.
 */
import type { ExtendedSymbolType, SupportedLanguage } from '../types';

/** A node type that defines a symbol (class/method/…), mapped to its kind. */
export interface SymbolRule {
  /** tree-sitter node type, e.g. 'method', 'class', 'module'. */
  nodeType: string;
  /** Symbol kind to emit for this node. */
  kind: ExtendedSymbolType;
  /** Field holding the identifier (childForFieldName). Default 'name'. */
  nameField?: string;
  /** If true, this node's name becomes the `owner` of descendant symbols. */
  container?: boolean;
}

/** A call expression whose method name marks an import (e.g. Ruby `require`). */
export interface ImportRule {
  /** Node type of the call expression, e.g. 'call'. */
  callNodeType: string;
  /** Field holding the invoked method's name, e.g. 'method'. */
  methodField: string;
  /** Method names that signify an import. */
  methodNames: string[];
}

/** A call expression to extract as a call edge. */
export interface CallRule {
  /** Node type of the call expression, e.g. 'call'. */
  callNodeType: string;
  /** Field holding the invoked method's name, e.g. 'method'. */
  methodField: string;
  /** Field holding the receiver/object, e.g. 'receiver'. Optional. */
  receiverField?: string;
}

/** A language fully declared as data. */
export interface LanguageTrait {
  language: SupportedLanguage;
  extensions: string[];
  grammarPackage: string;
  symbols: SymbolRule[];
  imports?: ImportRule[];
  calls?: CallRule[];
}

/**
 * The concrete language traits are @generated from `language-adapters/*.holo`
 * (@language_adapter declarations) by `scripts/gen-language-traits.mjs` — the .holo is the
 * single source of truth; this module only re-exports the build artifact. Author a new
 * data-driven language by adding a `.holo`, NOT by editing TypeScript (D.104, founder
 * 2026-07-03: "HoloScript formats make the product like absorb"). The hand-duplicated
 * RUBY_TRAIT const was deleted — Ruby now lives solely in `language-adapters/ruby.holo`.
 */
export { LANGUAGE_TRAITS } from './language-traits.generated';
