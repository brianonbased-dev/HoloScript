/**
 * @language_adapter Trait
 *
 * Declares a tree-sitter language adapter as HoloScript data. Absorb consumes
 * these declarations to generate its language ingestion registry while the
 * generic TreeSitterTraitAdapter handles runtime extraction.
 */

import type { HSPlusNode, TraitContext, TraitHandler } from './TraitTypes';

export const LANGUAGE_ADAPTER_TRAIT_NAME = 'language_adapter' as const;

export interface LanguageAdapterSymbolRule {
  nodeType: string;
  kind: string;
  nameField?: string;
  container?: boolean;
}

export interface LanguageAdapterImportRule {
  callNodeType: string;
  methodField: string;
  methodNames: string[];
}

export interface LanguageAdapterCallRule {
  callNodeType: string;
  methodField: string;
  receiverField?: string;
}

export interface LanguageAdapterTraitConfig {
  id?: string;
  language: string;
  grammar?: string;
  grammarPackage?: string | null;
  extensions: string[];
  symbols?: LanguageAdapterSymbolRule[];
  imports?: LanguageAdapterImportRule[];
  calls?: LanguageAdapterCallRule[];
}

export interface LanguageAdapterTraitState {
  config: LanguageAdapterTraitConfig;
  registeredAt: number;
}

export const languageAdapterHandler: TraitHandler<LanguageAdapterTraitConfig> = {
  name: LANGUAGE_ADAPTER_TRAIT_NAME,
  category: 'data',
  defaultConfig: {
    language: 'plaintext',
    grammarPackage: null,
    extensions: [],
    symbols: [],
    imports: [],
    calls: [],
  },
  properties: [
    { name: 'language', type: 'string', required: true },
    { name: 'grammarPackage', type: 'string', required: false },
    { name: 'extensions', type: 'array', required: true },
    { name: 'symbols', type: 'array', required: false },
    { name: 'imports', type: 'array', required: false },
    { name: 'calls', type: 'array', required: false },
  ],

  onAttach(node: HSPlusNode, config: LanguageAdapterTraitConfig, context: TraitContext): void {
    (node as Record<string, unknown>).__languageAdapterTrait = {
      config,
      registeredAt: Date.now(),
    } satisfies LanguageAdapterTraitState;

    context.emit?.('language_adapter:ready', {
      language: config.language,
      extensions: config.extensions,
      grammarPackage: config.grammarPackage ?? config.grammar ?? null,
    });
  },

  onDetach(node: HSPlusNode): void {
    delete (node as Record<string, unknown>).__languageAdapterTrait;
  },
};

export default languageAdapterHandler;
