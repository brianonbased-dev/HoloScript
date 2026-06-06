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
 * Ruby — added entirely as data (tree-sitter-ruby node grammar). No RubyAdapter
 * class exists; TreeSitterTraitAdapter(RUBY_TRAIT) provides symbol/import/call
 * extraction. This is the falsifier for "a language can be added without core
 * extraction code."
 */
export const RUBY_TRAIT: LanguageTrait = {
  language: 'ruby',
  extensions: ['.rb', '.rake', '.gemspec'],
  grammarPackage: 'tree-sitter-ruby',
  symbols: [
    { nodeType: 'module', kind: 'module', nameField: 'name', container: true },
    { nodeType: 'class', kind: 'class', nameField: 'name', container: true },
    { nodeType: 'method', kind: 'method', nameField: 'name' },
    { nodeType: 'singleton_method', kind: 'method', nameField: 'name' },
  ],
  imports: [
    {
      callNodeType: 'call',
      methodField: 'method',
      methodNames: ['require', 'require_relative', 'load', 'autoload'],
    },
  ],
  calls: [{ callNodeType: 'call', methodField: 'method', receiverField: 'receiver' }],
};

/** All languages currently provided as traits (vs. bespoke adapter classes). */
export const LANGUAGE_TRAITS: LanguageTrait[] = [RUBY_TRAIT];
