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

/**
 * Conditional kind: pick the symbol kind from the type of a child field.
 * e.g. Go `type X …` → 'struct' | 'interface' | 'type_alias' depending on the
 * `type` field's own node type.
 */
export interface KindByChildType {
  /** Field to inspect on the (spec) node, e.g. 'type'. */
  field: string;
  /** Map of that field-child's node type → symbol kind. */
  map: Record<string, ExtendedSymbolType>;
  /**
   * Kind to use when the child type isn't in `map`.
   * NB: named `fallback`, not `default` — `default` is a reserved word the
   * HoloScript parser drops from @language_adapter config objects.
   */
  fallback: ExtendedSymbolType;
}

/**
 * Struct-field extraction: when a symbol's type-field child is a container
 * (e.g. Go `struct_type`), emit each member as its own symbol owned by the
 * parent. e.g. `struct { X int }` → a 'field' symbol X owned by the struct.
 */
export interface FieldsRule {
  /** Only extract fields when the type-field child is this node type, e.g. 'struct_type'. */
  whenChildType: string;
  /** Node type wrapping the members, e.g. 'field_declaration_list'. */
  listType: string;
  /** Node type of each member, e.g. 'field_declaration'. */
  itemType: string;
  /** Field on each member holding its name, e.g. 'name'. */
  nameField: string;
  /** Symbol kind to emit for each member, e.g. 'field'. */
  kind: ExtendedSymbolType;
}

/**
 * Receiver-owner: derive a symbol's `owner` from a field that holds a
 * parameter-like node (e.g. Go method `receiver` → the receiver TYPE).
 */
export interface OwnerFromField {
  /** Field on the node that holds the receiver container, e.g. 'receiver'. */
  field: string;
  /** Node type of the parameter within it, e.g. 'parameter_declaration'. */
  childType: string;
  /** Field on that parameter holding the type text, e.g. 'type'. */
  typeField: string;
  /** Leading substring to strip from the type text, e.g. '*' for pointer receivers. */
  stripPrefix?: string;
}

/** A node type that defines a symbol (class/method/…), mapped to its kind. */
export interface SymbolRule {
  /** tree-sitter node type, e.g. 'method', 'class', 'module'. */
  nodeType: string;
  /** Symbol kind to emit for this node. Ignored when `kindByChildType` matches. */
  kind: ExtendedSymbolType;
  /** Field holding the identifier (childForFieldName). Default 'name'. */
  nameField?: string;
  /** If true, this node's name becomes the `owner` of descendant symbols. */
  container?: boolean;
  /**
   * Extract symbols from the NAMED CHILDREN of this node whose type equals
   * `specChild`, instead of from the node itself. e.g. Go `type_declaration`
   * → iterate its `type_spec` children. Each matched child is treated as the
   * symbol-bearing node for `nameField` / `kind` / `kindByChildType` / `fields`.
   */
  specChild?: string;
  /** Choose `kind` from a child field's node type (overrides `kind` when a match is found). */
  kindByChildType?: KindByChildType;
  /** Emit owned member symbols (struct fields) when the type-field child matches. */
  fields?: FieldsRule;
  /** Derive `owner` from a receiver-like field (Go methods). */
  ownerFromField?: OwnerFromField;
  /**
   * Template for the emitted `signature`, using placeholders resolved against
   * the symbol-bearing node. Omit to fall back to the default (`owner.name` /
   * `name`). Supported placeholders:
   *   {name}                 → the symbol name
   *   {field:X}              → text of the childForFieldName('X'), '' if absent
   *   {?field:X: LIT}        → literal LIT (which may itself contain {field:X})
   *                            only when field X is present; else ''
   *   {kindWord:X}          → node type of field X with a trailing '_type'
   *                            stripped (Go: struct_type→struct)
   * A single space collapse is NOT applied — templates render literally so
   * output matches the bespoke string interpolation byte-for-byte.
   */
  signatureTemplate?: string;
  /** Emit NO signature for this symbol (overrides the default owner/name signature). */
  noSignature?: boolean;
  /**
   * Set `isExported` from the name's first character being uppercase (Go/others
   * where capitalization = export). Omit to leave `isExported` undefined.
   */
  exportedByCapitalization?: boolean;
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

/**
 * A declaration-based import rule: the module path is read from a FIELD of a
 * spec node (e.g. Go `import_spec.path`) rather than from a call's arguments.
 * Handles both a single spec directly under the decl and specs nested inside a
 * spec-list (grouped `import ( … )`).
 */
export interface PathImportRule {
  /** Node type of the import declaration, e.g. 'import_declaration'. */
  declNodeType: string;
  /** Node type of each import spec, e.g. 'import_spec'. */
  specNodeType: string;
  /** Node type wrapping grouped specs, e.g. 'import_spec_list'. Optional. */
  specListNodeType?: string;
  /** Field on a spec holding the module path, e.g. 'path'. */
  pathField: string;
  /** Strip surrounding quotes from the path text. Default true. */
  stripQuotes?: boolean;
}

/** A call expression to extract as a call edge. */
export interface CallRule {
  /** Node type of the call expression, e.g. 'call'. */
  callNodeType: string;
  /**
   * Field holding the invoked method's name, e.g. 'method' (Ruby). For the
   * selector style (Go), omit this and set `functionField` + `selector`.
   */
  methodField?: string;
  /** Field holding the receiver/object, e.g. 'receiver' (Ruby). Optional. */
  receiverField?: string;
  /**
   * Selector style (Go `call_expression`): the callee is nested under a
   * `functionField` whose child is either a `selector` node (operand=owner,
   * field=callee) or a bare identifier (callee only). Mutually exclusive with
   * `methodField`.
   */
  functionField?: string;
  /** Selector descriptor for `functionField` style. */
  selector?: {
    /** Node type of the selector expression, e.g. 'selector_expression'. */
    nodeType: string;
    /** Field on the selector holding the owner/operand, e.g. 'operand'. */
    ownerField: string;
    /** Field on the selector holding the callee name, e.g. 'field'. */
    nameField: string;
    /** Node type of a bare (owner-less) callee, e.g. 'identifier'. */
    bareType: string;
  };
}

/** A language fully declared as data. */
export interface LanguageTrait {
  language: SupportedLanguage;
  extensions: string[];
  grammarPackage: string;
  symbols: SymbolRule[];
  /** Call-based imports (e.g. Ruby `require`). */
  imports?: ImportRule[];
  /** Declaration-based imports whose path is a field of a spec (e.g. Go `import`). */
  pathImports?: PathImportRule[];
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
