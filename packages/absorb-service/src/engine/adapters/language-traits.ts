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
   *   {owner}                → the resolved owner name ('' when free-standing);
   *                            only meaningful in `signatureTemplateWhenOwned`
   *   {field:X}              → text of the childForFieldName('X'), '' if absent
   *   {?field:X: LIT}        → literal LIT (which may itself contain {field:X})
   *                            only when field X is present; else ''
   *   {?wrap:X:OPEN:CLOSE}   → OPEN + field-X text + CLOSE when field X is
   *                            present, else ''. OPEN/CLOSE are brace-free
   *                            literals (Python: `{?wrap:superclasses:(:)}` →
   *                            `(Base, Mixin)` only when bases exist). Use this
   *                            instead of {?field:} when the wrapped value must
   *                            itself contain a `}` the LIT form cannot carry.
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
  /**
   * Set `isExported` from the presence of a modifier keyword on the node (Rust
   * `pub` → exported). Like `exportedByCapitalization` but modifier-driven.
   * Deliberately suppressed when the symbol is OWNED (a member) — the bespoke
   * RustAdapter set `isExported` on free-standing items but never on impl
   * methods, so a single `function_item` rule serving both `function` (free)
   * and `method` (owned) must not leak an export flag onto methods. Omit to
   * leave `isExported` untouched. Mutually independent from
   * `exportedByCapitalization` (which is unchanged and never owner-suppressed).
   */
  exportedByModifier?: string;
  /**
   * When THIS node is a container (`container: true`), the field findOwner reads
   * to name the owner it confers on descendants. Defaults to `nameField ?? 'name'`.
   * Rust `impl_item` sets `ownerNameField: 'type'` — the impl owns its methods
   * under the implemented TYPE, while the impl itself has no `name` field and so
   * emits no self-symbol. Omit for containers whose own name IS the owner name
   * (Python `class`, Ruby `module`/`class`) — behavior is then unchanged.
   */
  ownerNameField?: string;
  /**
   * Context-dependent kind: when this node has an enclosing container ancestor
   * (an owner is found), emit THIS kind instead of `kind`. Languages where the
   * same node type is both a top-level definition and a member use this —
   * Python `function_definition` is a `function` at module level but a `method`
   * inside a `class_definition`. Omit for node types whose kind is fixed.
   */
  kindWhenOwned?: ExtendedSymbolType;
  /**
   * Alternate `signatureTemplate` used only when an owner is found (the same
   * condition that triggers `kindWhenOwned`). Lets a member render a different
   * signature from the free-standing form — Python method
   * `{owner}.{name}({field:parameters})` vs top-level function
   * `def {name}({field:parameters})`. Templates support the same placeholders as
   * `signatureTemplate`, plus `{owner}` (the resolved owner name).
   */
  signatureTemplateWhenOwned?: string;
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

/**
 * A statement-based import rule for languages whose imports are their own
 * statement nodes (not calls, not spec-path fields) — Python `import X` and
 * `from X import Y, Z`. One `ModuleImportRule` describes one statement node type
 * and how to read the module path plus (for `from`-style) the named imports and
 * wildcard flag off its children. Both Python styles are two separate rules.
 */
export interface ModuleImportRule {
  /** Node type of the import statement, e.g. 'import_statement' or 'import_from_statement'. */
  declNodeType: string;
  /**
   * Field holding the module path, e.g. 'module_name' (Python `from X import …`).
   * Omit for plain `import X` where each named child IS a module (see `moduleChildTypes`).
   */
  moduleField?: string;
  /**
   * Node types of the per-module children under the statement (plain `import X`
   * emits one edge per module child). e.g. ['dotted_name', 'aliased_import'].
   * When set, one ImportEdge is emitted per matching named child.
   */
  moduleChildTypes?: string[];
  /**
   * For an aliased child (`import os.path as osp`, `from x import y as z`): the
   * field holding the ORIGINAL (pre-alias) name to use as the module / named
   * import. e.g. 'name'. The bespoke Python adapter records the original name,
   * not the alias.
   */
  aliasNameField?: string;
  /** Node type of an alias wrapper child, e.g. 'aliased_import'. */
  aliasChildType?: string;
  /**
   * `from X import …` style: node types of children to collect as `namedImports`
   * (excluding the module child), e.g. ['dotted_name', 'aliased_import'].
   */
  namedImportChildTypes?: string[];
  /** Node type whose presence sets `isWildcard` (Python `wildcard_import`, `*`). */
  wildcardChildType?: string;
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
    /**
     * Additional bare (owner-less) callee node types whose FULL text is the
     * callee name. Rust needs both `identifier` (`helper()`) and
     * `scoped_identifier` (`Point::origin()` → calleeName `Point::origin`, no
     * owner). Checked in addition to `bareType`. Omit for single-bare-type
     * languages (Go/Python) — behavior is then unchanged.
     */
    bareTypes?: string[];
  };
}

/**
 * A `use`-tree import rule (Rust `use a::b::c;` / `use a::{b, c};` /
 * `use a as b;` / `use a::*;`). Unlike Python's statement imports or Go's
 * spec-path imports, Rust's `use` argument is a recursively nested scoped path
 * whose leaf shape (single item, brace list, alias clause, wildcard) selects
 * the module string and named-import set. One rule declares the node types the
 * recursive walk pivots on; the interpreter (`collectUseImports`) reproduces the
 * bespoke RustAdapter `extractUsePath` walk byte-for-byte:
 *   - `scoped_identifier` → `path::name` (recurse the `pathField`)
 *   - `scopedListNodeType` (`scoped_use_list`) → recurse `pathField` for the
 *     module prefix, gather `listNodeType` items as `namedImports`
 *   - `asClauseNodeType` (`use_as_clause`) → the module string is the clause's
 *     WHOLE text (`std::fmt as formatting`), matching the bespoke fall-through
 *   - `wildcardNodeType` (`use_wildcard`) → module `*`, `isWildcard: true`
 *   - `listNodeType` (`use_list`) at the root → gather items, empty module
 * A `modAsImportNodeType` (Rust `mod external;` — a `mod_item` with a name but
 * no `body`) additionally emits a bare `{ toModule: name }` edge.
 */
export interface UseImportRule {
  /** Node type of the use statement, e.g. 'use_declaration'. */
  declNodeType: string;
  /** Node types that are a scoped `path::name` (recurse `pathField`). */
  scopedNodeTypes: string[];
  /** Node type of a scoped path that ends in a brace list, e.g. 'scoped_use_list'. */
  scopedListNodeType: string;
  /** Node type of a brace list of imported names, e.g. 'use_list'. */
  listNodeType: string;
  /** Node type of an `X as Y` alias clause, e.g. 'use_as_clause'. */
  asClauseNodeType: string;
  /** Node type of a glob import, e.g. 'use_wildcard'. */
  wildcardNodeType: string;
  /** Field holding the recursive path prefix on scoped nodes, e.g. 'path'. */
  pathField: string;
  /** Field holding the leaf name on a scoped_identifier, e.g. 'name'. */
  nameField: string;
  /** Field holding the brace list on a scoped_use_list, e.g. 'list'. */
  listField: string;
  /**
   * Node type of a file-reference module declaration that doubles as an import
   * (Rust `mod external;` — a named node with no `bodyField` child). Optional.
   */
  modAsImportNodeType?: string;
  /** Field whose ABSENCE marks a file-reference module (`mod_item` `body`). */
  modBodyField?: string;
  /** Field holding the module name on a file-reference module. Default 'name'. */
  modNameField?: string;
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
  /** Statement-based imports (e.g. Python `import X` / `from X import Y`). */
  moduleImports?: ModuleImportRule[];
  /** `use`-tree imports (Rust `use a::b::c;` and friends). */
  useImports?: UseImportRule[];
  calls?: CallRule[];
  /**
   * Derive symbol `visibility` from a modifier keyword instead of the built-in
   * per-language `extractVisibility` heuristic. Rust visibility is uniform:
   * `pub` present → 'public', absent → 'private' (for every symbol including
   * impl methods). Set `{ modifier: 'pub' }`. Omit to keep `extractVisibility`
   * (Go uppercase / Python underscore / C-family modifiers) unchanged.
   */
  visibilityFromModifier?: { modifier: string };
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
