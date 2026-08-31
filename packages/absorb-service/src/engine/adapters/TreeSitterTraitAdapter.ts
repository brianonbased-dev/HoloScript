/**
 * TreeSitterTraitAdapter — a single generic LanguageAdapter driven by a
 * LanguageTrait config instead of bespoke per-language code.
 *
 * It reuses the same BaseAdapter machinery (walkTree, nodeToSymbol,
 * getFieldText, extractVisibility) the hand-written adapters use — the ONLY
 * difference is that which node types map to which symbol kinds (and which
 * calls are imports) comes from DATA, not a class. Register a new language with
 * `registerAdapter(new TreeSitterTraitAdapter(SOME_TRAIT))`.
 *
 * See language-traits.ts + docs/language-adapter-trait.md (sug_1780711395408_m35r).
 */
import type {
  LanguageAdapter,
  ParseTree,
  SyntaxNode,
  SupportedLanguage,
  ExternalSymbolDefinition,
  ImportEdge,
  CallEdge,
  EmitSite,
  ListenSite,
} from '../types';
import {
  walkTree,
  nodeToSymbol,
  getFieldText,
  extractVisibility,
  hasModifier,
} from './BaseAdapter';
import type {
  LanguageTrait,
  SymbolRule,
  ClauseImportRule,
  EventSiteRule,
  CallerScopeRule,
} from './language-traits';
import type { ExtendedSymbolType } from '../types';

export class TreeSitterTraitAdapter implements LanguageAdapter {
  readonly language: SupportedLanguage;
  readonly extensions: string[];
  readonly grammarPackage: string;

  private readonly symbolRulesByType: Map<string, SymbolRule>;
  private readonly containerTypes: Set<string>;
  private readonly importMethodNames: Set<string>;

  constructor(private readonly trait: LanguageTrait) {
    this.language = trait.language;
    this.extensions = trait.extensions;
    this.grammarPackage = trait.grammarPackage;
    this.symbolRulesByType = new Map(trait.symbols.map((r) => [r.nodeType, r]));
    this.containerTypes = new Set(trait.symbols.filter((r) => r.container).map((r) => r.nodeType));
    this.importMethodNames = new Set((trait.imports ?? []).flatMap((r) => r.methodNames));
  }

  extractSymbols(tree: ParseTree, filePath: string): ExternalSymbolDefinition[] {
    const out: ExternalSymbolDefinition[] = [];
    // Collect ES-module export names once when any rule uses TS-style export
    // detection (mirrors the bespoke `collectExports` pre-pass).
    const exportedNames = this.trait.symbols.some((r) => r.exportedByExportStatement)
      ? this.collectExportNames(tree.rootNode)
      : null;
    walkTree(tree.rootNode, (node) => {
      const rule = this.symbolRulesByType.get(node.type);
      if (!rule) return;
      if (rule.declarators) {
        // Declarator-list node (TS `lexical_declaration`): each declarator is a
        // `function` (arrow/fn value) or `constant`, positioned by THIS node.
        this.emitDeclarators(node, rule, filePath, out, exportedNames);
        return false; // handled — don't descend generically
      }
      if (rule.specChild) {
        // Declaration node whose SYMBOLS live in its named `specChild` children
        // (Go `type_declaration` → `type_spec`, `const_declaration` → `const_spec`).
        for (const spec of node.namedChildren) {
          if (spec.type === rule.specChild)
            this.emitSymbol(spec, rule, filePath, out, exportedNames);
        }
        return false; // handled — don't also treat descendants generically
      }
      this.emitSymbol(node, rule, filePath, out, exportedNames);
    });
    return out;
  }

  /** Emit one symbol (plus any owned member symbols) from a symbol-bearing node. */
  private emitSymbol(
    node: SyntaxNode,
    rule: SymbolRule,
    filePath: string,
    out: ExternalSymbolDefinition[],
    exportedNames: Set<string> | null = null
  ): void {
    const name = getFieldText(node, rule.nameField ?? 'name') ?? nameFromChildType(node, rule);
    if (!name) return;

    const owner = rule.ownerFromField
      ? this.ownerFromReceiver(node, rule.ownerFromField)
      : this.findOwner(node);
    // Context-dependent kind: same node type is a member when owned (Python
    // `function_definition` → 'method' inside a class, 'function' at module level).
    const kind = owner && rule.kindWhenOwned ? rule.kindWhenOwned : this.resolveKind(node, rule);
    // When owned, a rule may prefer a member-shaped signature template.
    const activeTemplate =
      owner && rule.signatureTemplateWhenOwned
        ? rule.signatureTemplateWhenOwned
        : rule.signatureTemplate;
    const signature = rule.noSignature
      ? undefined
      : activeTemplate
        ? this.renderSignature(node, activeTemplate, name, owner)
        : owner
          ? `${owner}.${name}`
          : name;
    // isExported: capitalization (Go) OR modifier presence (Rust `pub`) OR ES
    // export syntax (TS `export …` / `export { … }`). The modifier form is
    // suppressed when the symbol is owned (a member), because the bespoke
    // RustAdapter set isExported on free items but never on impl methods — one
    // function_item rule serves both, so the flag must not leak. TS members
    // (field/method) use their own rules WITHOUT exportedByExportStatement, so
    // they naturally stay undefined here, matching the bespoke.
    const isExported = rule.exportedByCapitalization
      ? startsUppercase(name)
      : rule.exportedByModifier && !owner
        ? hasModifier(node, rule.exportedByModifier)
        : rule.exportedByExportStatement
          ? this.isExportedByStatement(node, name, exportedNames)
          : undefined;
    // Visibility: a modifier-driven uniform rule (Rust `pub`→public else
    // private, for every symbol including methods) overrides the per-language
    // extractVisibility heuristic when the trait declares it.
    const visibility = this.trait.visibilityFromModifier
      ? hasModifier(node, this.trait.visibilityFromModifier.modifier)
        ? 'public'
        : 'private'
      : extractVisibility(node, this.language);

    out.push(
      nodeToSymbol(node, name, kind, this.language, filePath, {
        visibility,
        owner,
        signature,
        isExported,
      })
    );

    // Owned member symbols (e.g. Go struct fields).
    if (rule.fields) {
      const typeChild = node.childForFieldName(this.fieldsTypeField(rule));
      if (typeChild && typeChild.type === rule.fields.whenChildType) {
        for (const list of typeChild.namedChildren) {
          if (list.type !== rule.fields.listType) continue;
          for (const member of list.namedChildren) {
            if (member.type !== rule.fields.itemType) continue;
            const memberName = getFieldText(member, rule.fields.nameField);
            if (!memberName) continue;
            out.push(
              nodeToSymbol(member, memberName, rule.fields.kind, this.language, filePath, {
                visibility: extractVisibility(member, this.language),
                owner: name,
              })
            );
          }
        }
      }
    }
  }

  /**
   * Emit a symbol for each declarator in a declarator-list node (TS
   * `lexical_declaration`/`variable_declaration`). A declarator whose value is
   * an arrow/function expression becomes a `function` (signature rendered
   * against the VALUE node); any other value becomes the rule's `kind`
   * (constant, no signature). Positions / visibility / isExported come from the
   * OUTER declaration `node`, matching the bespoke `nodeToSymbol(declNode, …)`.
   */
  private emitDeclarators(
    node: SyntaxNode,
    rule: SymbolRule,
    filePath: string,
    out: ExternalSymbolDefinition[],
    exportedNames: Set<string> | null
  ): void {
    const d = rule.declarators!;
    for (const declarator of node.namedChildren) {
      if (declarator.type !== d.declaratorType) continue;
      const name = getFieldText(declarator, d.nameField);
      const value = declarator.childForFieldName(d.valueField);
      if (!name || !value) continue;
      const isFn = d.functionValueTypes.includes(value.type);
      const kind = isFn ? d.functionKind : rule.kind;
      const signature =
        isFn && d.functionSignatureTemplate
          ? this.renderSignature(value, d.functionSignatureTemplate, name)
          : undefined;
      const isExported = rule.exportedByExportStatement
        ? this.isExportedByStatement(node, name, exportedNames)
        : undefined;
      out.push(
        nodeToSymbol(node, name, kind, this.language, filePath, {
          visibility: extractVisibility(node, this.language),
          signature,
          isExported,
        })
      );
    }
  }

  /**
   * Collect names appearing in file-level ES `export { … }` clauses and on
   * `export class/function/…` declarations — the bespoke `collectExports`
   * pre-pass. Reused to set `isExported` on symbols whose declaration is not
   * itself under an `export_statement` (re-export clauses).
   */
  private collectExportNames(root: SyntaxNode): Set<string> {
    const names = new Set<string>();
    walkTree(root, (node) => {
      if (node.type !== 'export_statement') return;
      for (const child of node.namedChildren) {
        if (child.type === 'export_clause') {
          for (const spec of child.namedChildren) {
            if (spec.type === 'export_specifier') {
              names.add(getFieldText(spec, 'name') ?? spec.text);
            }
          }
        }
        const declName = getFieldText(child, 'name');
        if (declName) names.add(declName);
      }
      return false;
    });
    return names;
  }

  /**
   * True when a declaration is ES-exported: its name is in a file-level
   * `export { … }` clause, its parent is an `export_statement`, or it carries a
   * leading `export` keyword — the bespoke `exportedNames.has(name) ||
   * hasExportModifier(node)`.
   */
  private isExportedByStatement(
    node: SyntaxNode,
    name: string,
    exportedNames: Set<string> | null
  ): boolean {
    if (exportedNames?.has(name)) return true;
    if (node.parent?.type === 'export_statement') return true;
    return node.children[0]?.text === 'export';
  }

  /** The type-field to inspect for `fields`/`kindByChildType` (both use 'type' in Go). */
  private fieldsTypeField(rule: SymbolRule): string {
    return rule.kindByChildType?.field ?? 'type';
  }

  private resolveKind(node: SyntaxNode, rule: SymbolRule): ExtendedSymbolType {
    const k = rule.kindByChildType;
    if (!k) return rule.kind;
    const child = node.childForFieldName(k.field);
    if (!child) return k.fallback;
    return k.map[child.type] ?? k.fallback;
  }

  private ownerFromReceiver(
    node: SyntaxNode,
    spec: NonNullable<SymbolRule['ownerFromField']>
  ): string | undefined {
    const receiver = node.childForFieldName(spec.field);
    if (!receiver) return undefined;
    for (const child of receiver.namedChildren) {
      if (child.type !== spec.childType) continue;
      const typeNode = child.childForFieldName(spec.typeField);
      if (!typeNode) continue;
      const text = typeNode.text;
      return spec.stripPrefix && text.startsWith(spec.stripPrefix)
        ? text.slice(spec.stripPrefix.length)
        : text;
    }
    return undefined;
  }

  /** Render a signatureTemplate against a node. See SymbolRule.signatureTemplate. */
  private renderSignature(
    node: SyntaxNode,
    template: string,
    name: string,
    owner?: string
  ): string {
    // {?wrap:X:OPEN:CLOSE} — OPEN + field-X text + CLOSE, but only when field X
    // is present; else ''. OPEN/CLOSE are brace-free literal delimiters (e.g.
    // '(' and ')'), so — unlike {?field:X:LIT} — the wrapped value may itself
    // contain characters the brace-terminated LIT form cannot carry. Used for
    // Python `class Name(Bases)` where the base list must be wrapped in parens
    // only when a superclass list exists.
    let out = template.replace(
      /\{\?wrap:([A-Za-z_]+):([^:{}]*):([^:{}]*)\}/g,
      (_m, field: string, open: string, close: string) => {
        const child = node.childForFieldName(field);
        return child ? `${open}${child.text}${close}` : '';
      }
    );
    // {?field:X:LIT} — literal LIT only when field X is present (LIT may include
    // leading spaces and a nested {field:X}, expanded by the pass below).
    out = out.replace(/\{\?field:([A-Za-z_]+):([^}]*)\}/g, (_m, field: string, lit: string) =>
      node.childForFieldName(field) ? lit : ''
    );
    // {kindWord:X} — node type of field X with trailing '_type' stripped.
    out = out.replace(/\{kindWord:([A-Za-z_]+)\}/g, (_m, field: string) => {
      const c = node.childForFieldName(field);
      return c ? c.type.replace(/_type$/, '') : '';
    });
    // {field:X} — text of field X, '' if absent.
    out = out.replace(
      /\{field:([A-Za-z_]+)\}/g,
      (_m, field: string) => node.childForFieldName(field)?.text ?? ''
    );
    // {owner} — the resolved owner name ('' when free-standing).
    out = out.replace(/\{owner\}/g, owner ?? '');
    // {name}
    out = out.replace(/\{name\}/g, name);
    return out;
  }

  extractImports(tree: ParseTree, filePath: string): ImportEdge[] {
    const out: ImportEdge[] = [];
    const callRules = this.trait.imports ?? [];
    const pathRules = this.trait.pathImports ?? [];
    const moduleRules = this.trait.moduleImports ?? [];
    const useRules = this.trait.useImports ?? [];
    const clauseRule = this.trait.clauseImports;
    if (
      callRules.length === 0 &&
      pathRules.length === 0 &&
      moduleRules.length === 0 &&
      useRules.length === 0 &&
      !clauseRule
    )
      return out;
    walkTree(tree.rootNode, (node) => {
      // ES-module clause imports (TS `import { a } from 'x'` and friends) plus
      // dynamic-import / require calls. The statement form is fully handled
      // here (return false); the call forms are found by the continuing walk
      // (they nest inside declarator values), so they do NOT stop descent.
      if (clauseRule) {
        if (node.type === clauseRule.declNodeType) {
          this.collectClauseImport(node, clauseRule, filePath, out);
          return false; // statement fully handled
        }
        if (clauseRule.callImports && node.type === clauseRule.callImports.callNodeType) {
          this.collectCallImport(node, clauseRule.callImports, filePath, out);
          // do not return false — allow generic descent (no other rule claims it)
        }
      }
      // `use`-tree imports (Rust `use a::b::c;` / `use a::{b,c};` / …) and the
      // file-reference `mod external;` that doubles as an import.
      for (const rule of useRules) {
        if (node.type === rule.declNodeType) {
          this.collectUseImports(node, rule, filePath, out);
          return false; // decl fully handled; don't descend into it generically
        }
        if (
          rule.modAsImportNodeType &&
          node.type === rule.modAsImportNodeType &&
          !node.childForFieldName(rule.modBodyField ?? 'body')
        ) {
          const name = getFieldText(node, rule.modNameField ?? 'name');
          if (name)
            out.push({ fromFile: filePath, toModule: name, line: node.startPosition.row + 1 });
          return false;
        }
      }
      // Call-based imports (Ruby `require 'x'`).
      for (const rule of callRules) {
        if (node.type !== rule.callNodeType) continue;
        const method = getFieldText(node, rule.methodField);
        if (!method || !rule.methodNames.includes(method)) continue;
        // The module path is the first string literal in the call's arguments.
        const str = node.descendantsOfType('string')[0];
        if (!str) continue;
        const toModule = stripQuotes(str.text);
        if (toModule) out.push({ fromFile: filePath, toModule, line: node.startPosition.row + 1 });
      }
      // Declaration-based imports (Go `import "x"` / `import ( … )`).
      for (const rule of pathRules) {
        if (node.type !== rule.declNodeType) continue;
        this.collectPathImports(node, rule, filePath, out);
        return false; // decl fully handled; don't descend into it generically
      }
      // Statement-based imports (Python `import X` / `from X import Y`).
      for (const rule of moduleRules) {
        if (node.type !== rule.declNodeType) continue;
        this.collectModuleImports(node, rule, filePath, out);
        return false; // statement fully handled; don't descend into it generically
      }
    });
    return out;
  }

  /**
   * Emit ImportEdge(s) for a statement-based import (Python).
   *  - `import X, Y.Z as w` (no `moduleField`, `moduleChildTypes` set): one edge
   *    per module child, `toModule` = the aliased original name or the child text.
   *  - `from X import a, b as c` / `from . import s` / `from x import *`
   *    (`moduleField` set): one edge, `toModule` = module field text, with
   *    `namedImports` gathered from the named-import children and `isWildcard`
   *    when a wildcard child is present.
   */
  private collectModuleImports(
    stmt: SyntaxNode,
    rule: NonNullable<LanguageTrait['moduleImports']>[number],
    filePath: string,
    out: ImportEdge[]
  ): void {
    const line = stmt.startPosition.row + 1;

    // `import X` style: each module child becomes its own edge.
    if (!rule.moduleField && rule.moduleChildTypes) {
      for (const child of stmt.namedChildren) {
        if (!rule.moduleChildTypes.includes(child.type)) continue;
        const toModule = this.moduleNameOf(child, rule);
        if (toModule) out.push({ fromFile: filePath, toModule, line });
      }
      return;
    }

    // `from X import …` style: one edge with named imports + wildcard flag.
    if (rule.moduleField) {
      const moduleNode = stmt.childForFieldName(rule.moduleField);
      if (!moduleNode) return;
      // Exclude the module child by POSITION, not object identity. The bespoke
      // PythonAdapter used `child !== module` (reference identity), but the
      // tree-sitter Node.js binding hands out fresh wrapper objects as its
      // internal cache evicts, so identity is unstable in larger trees — the
      // module could leak into namedImports depending on how many nodes were
      // walked first. Comparing startIndex is what that check meant and is
      // deterministic. (Documented in PythonAdapterParity.test.ts.)
      const moduleStart = moduleNode.startIndex;
      const edge: ImportEdge = {
        fromFile: filePath,
        // Python's module field is a bare `dotted_name`, but C's is the literal
        // include token — `"widget.h"` / `<vector>`. Leaving the delimiters in
        // makes the module id unjoinable with the file paths it should resolve
        // to, so normalize here (no-op for unquoted fields).
        toModule: stripDelimiters(moduleNode.text),
        line,
        namedImports: [],
      };
      for (const child of stmt.namedChildren) {
        if (child.startIndex === moduleStart) continue;
        if (rule.wildcardChildType && child.type === rule.wildcardChildType) {
          edge.isWildcard = true;
          continue;
        }
        if (rule.namedImportChildTypes?.includes(child.type)) {
          const name = this.moduleNameOf(child, rule);
          if (name) edge.namedImports!.push(name);
        }
      }
      out.push(edge);
    }
  }

  /**
   * Resolve the module / named-import name for a child, honoring alias children
   * (Python `os.path as osp` → the original `os.path`, matching the bespoke
   * adapter which records the pre-alias name).
   */
  private moduleNameOf(
    child: SyntaxNode,
    rule: NonNullable<LanguageTrait['moduleImports']>[number]
  ): string {
    if (rule.aliasChildType && child.type === rule.aliasChildType) {
      const original = rule.aliasNameField ? getFieldText(child, rule.aliasNameField) : undefined;
      return original ?? child.text;
    }
    return child.text;
  }

  /** Emit an ImportEdge for each import spec directly under the decl or inside a spec-list. */
  private collectPathImports(
    declNode: SyntaxNode,
    rule: NonNullable<LanguageTrait['pathImports']>[number],
    filePath: string,
    out: ImportEdge[]
  ): void {
    const emit = (spec: SyntaxNode): void => {
      const path = spec.childForFieldName(rule.pathField);
      if (!path) return;
      const toModule = rule.stripQuotes === false ? path.text : stripQuotes(path.text);
      out.push({ fromFile: filePath, toModule, line: spec.startPosition.row + 1 });
    };
    for (const child of declNode.namedChildren) {
      if (child.type === rule.specNodeType) {
        emit(child);
      } else if (rule.specListNodeType && child.type === rule.specListNodeType) {
        for (const inner of child.namedChildren) {
          if (inner.type === rule.specNodeType) emit(inner);
        }
      }
    }
  }

  /**
   * Emit one ImportEdge for a Rust `use` declaration by walking its recursively
   * nested scoped-path argument. A faithful port of the bespoke RustAdapter
   * `extractUsePath`: `namedImports` and the wildcard flag accumulate as the
   * recursion descends, and the module string is the collected path prefix.
   */
  private collectUseImports(
    node: SyntaxNode,
    rule: NonNullable<LanguageTrait['useImports']>[number],
    filePath: string,
    out: ImportEdge[]
  ): void {
    const names: string[] = [];
    let isGlob = false;

    const collectPath = (n: SyntaxNode): string => {
      if (rule.scopedNodeTypes.includes(n.type) || n.type === rule.scopedListNodeType) {
        const path = n.childForFieldName(rule.pathField);
        const name = n.childForFieldName(rule.nameField);
        const list = n.childForFieldName(rule.listField);
        const prefix = path ? collectPath(path) : '';
        if (name) return prefix ? `${prefix}::${name.text}` : name.text;
        if (list) {
          // `use foo::{Bar, Baz}` — gather the brace-list members as names.
          for (const item of list.namedChildren) {
            if (item.type === 'identifier') names.push(item.text);
            else if (rule.scopedNodeTypes.includes(item.type)) names.push(collectPath(item));
          }
          return prefix;
        }
        return prefix;
      }
      if (n.type === 'identifier') return n.text;
      if (n.type === rule.wildcardNodeType) {
        isGlob = true;
        return '*';
      }
      if (n.type === rule.listNodeType) {
        for (const item of n.namedChildren) {
          if (item.type === 'identifier') names.push(item.text);
        }
        return '';
      }
      // `use x as y` alias clause (and any other leaf): the whole text is the
      // module string — matching the bespoke fall-through exactly.
      return n.text || '';
    };

    let modulePath = '';
    for (const child of node.namedChildren) {
      if (child.type !== 'visibility_modifier') {
        modulePath = collectPath(child);
        break;
      }
    }

    if (!modulePath && names.length === 0) return;
    out.push({
      fromFile: filePath,
      toModule: modulePath,
      line: node.startPosition.row + 1,
      namedImports: names,
      isWildcard: isGlob,
    });
  }

  /**
   * Emit one ImportEdge for an ES-module `import_statement`, walking its
   * `import_clause` for a default binding, a namespace import (`* as ns`), and
   * a `named_imports` list — reproducing the bespoke TypeScriptAdapter
   * `extractImports` clause walk (including the `isDefault`/`isWildcard` flags
   * and the pre-alias specifier name). A side-effect import (`import 'x'`) has
   * no clause and emits an edge with empty `namedImports`.
   */
  private collectClauseImport(
    node: SyntaxNode,
    rule: ClauseImportRule,
    filePath: string,
    out: ImportEdge[]
  ): void {
    const source = node.childForFieldName(rule.sourceField);
    if (!source) return;
    const edge: ImportEdge = {
      fromFile: filePath,
      toModule: stripImportQuotes(source.text),
      line: node.startPosition.row + 1,
      namedImports: [],
      isWildcard: false,
      isDefault: false,
    };
    for (const child of node.namedChildren) {
      if (child.type !== rule.clauseType) continue;
      for (const spec of child.namedChildren) {
        if (spec.type === rule.defaultType) {
          edge.isDefault = true;
          edge.namedImports!.push(spec.text);
        } else if (spec.type === rule.namedImportsType) {
          for (const specifier of spec.namedChildren) {
            if (specifier.type === rule.specifierType) {
              edge.namedImports!.push(
                getFieldText(specifier, rule.specifierNameField) ?? specifier.text
              );
            }
          }
        } else if (spec.type === rule.namespaceType) {
          edge.isWildcard = true;
        }
      }
    }
    out.push(edge);
  }

  /**
   * Emit a bare `{ toModule }` ImportEdge for a dynamic-import or require call
   * (`import('x')` / `require('x')`) — matching the bespoke, which recorded no
   * named-import flags for these. Identified by the call's function-child TYPE
   * (dynamic `import`) or TEXT (`require`).
   */
  private collectCallImport(
    node: SyntaxNode,
    spec: NonNullable<ClauseImportRule['callImports']>,
    filePath: string,
    out: ImportEdge[]
  ): void {
    const fn = node.childForFieldName(spec.functionField);
    if (!fn) return;
    const matches =
      (spec.functionNodeTypes?.includes(fn.type) ?? false) ||
      (spec.functionNames?.includes(fn.text) ?? false);
    if (!matches) return;
    const args = node.childForFieldName(spec.argumentsField);
    if (!args) return;
    const firstArg = args.namedChildren[0];
    if (!firstArg || firstArg.type !== spec.stringType) return;
    out.push({
      fromFile: filePath,
      toModule: stripImportQuotes(firstArg.text),
      line: node.startPosition.row + 1,
    });
  }

  extractCalls(tree: ParseTree, filePath: string): CallEdge[] {
    const out: CallEdge[] = [];
    const rules = this.trait.calls ?? [];
    if (rules.length === 0) return out;
    // TS/JS attribute a call's `callerId` with a push-only scope stack (see
    // CallerScopeRule): the top is the most-recently-ENTERED scope node in DFS
    // pre-order, never popped — so calls inside an anonymous arrow read
    // `<anonymous>`. Other languages keep the ancestor-walk `enclosingSymbol`.
    const scope = this.trait.callerScope;
    const stack: string[] = [];
    walkTree(tree.rootNode, (node) => {
      if (scope && scope.scopeTypes.includes(node.type)) {
        stack.push(getFieldText(node, scope.nameField) ?? scope.anonymousName);
      }
      for (const rule of rules) {
        if (node.type !== rule.callNodeType) continue;

        let calleeName: string | undefined;
        let calleeOwner: string | undefined;

        if (rule.selector && rule.functionField) {
          // Selector style (Go): callee nested under `functionField`.
          const fn = node.childForFieldName(rule.functionField);
          if (!fn) continue;
          const bareTypes = rule.selector.bareTypes ?? [rule.selector.bareType];
          if (fn.type === rule.selector.nodeType) {
            calleeName = getFieldText(fn, rule.selector.nameField);
            calleeOwner = getFieldText(fn, rule.selector.ownerField);
          } else if (bareTypes.includes(fn.type)) {
            // Bare (owner-less) callee — its full text is the callee name
            // (Rust `Point::origin` stays a single scoped name, no owner split).
            calleeName = fn.text;
          } else {
            continue;
          }
        } else if (rule.bareChildType || rule.childSelector) {
          // Child-type style (Swift/Kotlin): the call node carries no fields, so
          // the callee is located positionally. `bareChildType` covers
          // `helper()`; `childSelector` covers `obj.method()`, whose navigation
          // child holds the owner first and the dotted suffix second.
          const sel = rule.childSelector;
          const child = node.namedChildren.find(
            (c) => c.type === rule.bareChildType || c.type === sel?.nodeType
          );
          if (!child) continue;
          if (sel && child.type === sel.nodeType) {
            const suffix = child.namedChildren.find((c) => c.type === sel.nameChildType);
            // The suffix's own text keeps the leading dot ('.method'), so read
            // the identifier leaf inside it.
            calleeName = suffix?.namedChildren.find((c) => c.type === sel.nameLeafType)?.text;
            calleeOwner = child.namedChildren.find((c) => c.type !== sel.nameChildType)?.text;
          } else {
            calleeName = child.text;
          }
        } else {
          // Method-field style (Ruby): callee name is a field of the call node.
          calleeName = getFieldText(node, rule.methodField ?? 'method');
          calleeOwner = rule.receiverField ? getFieldText(node, rule.receiverField) : undefined;
        }

        if (!calleeName) continue;
        // Import-bearing calls (require/…) are already emitted as import edges.
        if (this.importMethodNames.has(calleeName)) continue;

        out.push({
          callerId: scope
            ? (stack[stack.length - 1] ?? scope.moduleName)
            : this.enclosingSymbol(node),
          calleeName,
          calleeOwner,
          filePath,
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
        });
      }
    });
    return out;
  }

  /**
   * Extract emit()-site event links (HoloGraph Phase 1). Present only when the
   * trait declares `eventSites` — the scanner calls this via optional chaining,
   * so languages without an event bus expose nothing. Reproduces the bespoke
   * TypeScriptAdapter `extractEmitSites`.
   */
  extractEmitSites(tree: ParseTree, filePath: string): EmitSite[] {
    const rule = this.trait.eventSites;
    if (!rule) return [];
    return this.collectEventSites(tree, filePath, rule, new Set(rule.emitMethods));
  }

  /**
   * Extract on()/subscribe()-site event links (HoloGraph Phase 1). Symmetric to
   * `extractEmitSites`; present only when the trait declares `eventSites`.
   */
  extractListenSites(tree: ParseTree, filePath: string): ListenSite[] {
    const rule = this.trait.eventSites;
    if (!rule) return [];
    return this.collectEventSites(tree, filePath, rule, new Set(rule.listenMethods));
  }

  /**
   * Shared emit/listen walk: a `callNodeType` whose `functionField` is a
   * member/selector with a property in `methods`, whose first argument is a
   * string literal, is an event site named by that literal. `callerId` uses the
   * same push-only scope stack as `extractCalls` (CallerScopeRule) so an
   * anonymous-arrow site reads `<anonymous>`.
   */
  private collectEventSites(
    tree: ParseTree,
    filePath: string,
    rule: EventSiteRule,
    methods: Set<string>
  ): EmitSite[] {
    const sites: EmitSite[] = [];
    const scope = this.trait.callerScope;
    const stack: string[] = [];
    walkTree(tree.rootNode, (node) => {
      if (scope && scope.scopeTypes.includes(node.type)) {
        stack.push(getFieldText(node, scope.nameField) ?? scope.anonymousName);
      }
      if (node.type !== rule.callNodeType) return;
      const fn = node.childForFieldName(rule.functionField);
      if (!fn || fn.type !== rule.selectorType) return;
      const prop = fn.childForFieldName(rule.propertyField);
      if (!prop || !methods.has(prop.text)) return;
      const args = node.childForFieldName(rule.argumentsField);
      const eventName = this.stringLiteralValue(args?.namedChildren[0], rule);
      if (!eventName) return;
      sites.push({
        callerId: scope
          ? (stack[stack.length - 1] ?? scope.moduleName)
          : this.enclosingSymbol(node),
        eventName,
        filePath,
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
      });
    });
    return sites;
  }

  /**
   * String value of a tree-sitter string / non-interpolated template-string
   * node, else null (variables, computed, interpolated). Mirrors the bespoke
   * `_stringLiteralValue`.
   */
  private stringLiteralValue(node: SyntaxNode | undefined, rule: EventSiteRule): string | null {
    if (!node) return null;
    if (node.type === rule.stringType) {
      const fragment = node.namedChildren.find((c) => c.type === rule.stringFragmentType);
      if (fragment) return fragment.text;
      const raw = node.text;
      if (
        (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'"))
      ) {
        return raw.slice(1, -1);
      }
    }
    if (node.type === rule.templateStringType) {
      const parts = node.namedChildren.filter((c) => rule.templateFragmentTypes.includes(c.type));
      if (parts.length === 1 && parts[0]) return parts[0].text;
    }
    return null;
  }

  /** Nearest ancestor container symbol's name (class/module), for `owner`. */
  private findOwner(node: SyntaxNode): string | undefined {
    let p = node.parent;
    while (p) {
      if (this.containerTypes.has(p.type)) {
        // A container may name the owner it confers via a field other than its
        // own `nameField` — Rust `impl_item` owns methods under its `type`
        // field while having no `name` field of its own.
        const r = this.symbolRulesByType.get(p.type);
        return (
          getFieldText(p, r?.ownerNameField ?? r?.nameField ?? 'name') ??
          (r ? nameFromChildType(p, r) : undefined)
        );
      }
      p = p.parent;
    }
    return undefined;
  }

  /** Nearest enclosing method/function name, for a call's callerId. */
  private enclosingSymbol(node: SyntaxNode): string {
    let p = node.parent;
    while (p) {
      const rule = this.symbolRulesByType.get(p.type);
      if (rule && (rule.kind === 'method' || rule.kind === 'function')) {
        return (
          getFieldText(p, rule.nameField ?? 'name') ?? nameFromChildType(p, rule) ?? '<anonymous>'
        );
      }
      p = p.parent;
    }
    return '<module>';
  }
}

function nameFromChildType(node: SyntaxNode, rule: SymbolRule): string | undefined {
  if (!rule.nameChildType) return undefined;
  const child = node.namedChildren.find((c) => c.type === rule.nameChildType);
  return child?.text;
}

function stripQuotes(text: string): string {
  return text.replace(/^['"`]|['"`]$/g, '').trim();
}

/**
 * Strip the delimiters a grammar keeps around a module token: quotes, and the
 * angle brackets C-family `#include <vector>` carries. `stripQuotes` alone
 * leaves `<vector>` intact, which is not a module id anything can resolve.
 */
function stripDelimiters(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) return trimmed.slice(1, -1).trim();
  return stripQuotes(trimmed);
}

/**
 * Strip a single leading/trailing `'` or `"` — the exact module-path
 * normalization the bespoke TypeScriptAdapter used (`/^['"]|['"]$/g`). Unlike
 * `stripQuotes` it does NOT trim or handle backticks, so ESM import paths stay
 * byte-identical to the bespoke output.
 */
function stripImportQuotes(text: string): string {
  return text.replace(/^['"]|['"]$/g, '');
}

/**
 * True when the identifier's first character is an uppercase letter — the Go
 * export convention (mirrors BaseAdapter.extractVisibility's Go branch and the
 * bespoke GoAdapter.isExported check exactly).
 */
function startsUppercase(name: string): boolean {
  return name.length > 0 && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
}
