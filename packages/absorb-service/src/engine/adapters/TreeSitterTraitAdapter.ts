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
} from '../types';
import { walkTree, nodeToSymbol, getFieldText, extractVisibility } from './BaseAdapter';
import type { LanguageTrait, SymbolRule } from './language-traits';
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
    walkTree(tree.rootNode, (node) => {
      const rule = this.symbolRulesByType.get(node.type);
      if (!rule) return;
      if (rule.specChild) {
        // Declaration node whose SYMBOLS live in its named `specChild` children
        // (Go `type_declaration` → `type_spec`, `const_declaration` → `const_spec`).
        for (const spec of node.namedChildren) {
          if (spec.type === rule.specChild) this.emitSymbol(spec, rule, filePath, out);
        }
        return false; // handled — don't also treat descendants generically
      }
      this.emitSymbol(node, rule, filePath, out);
    });
    return out;
  }

  /** Emit one symbol (plus any owned member symbols) from a symbol-bearing node. */
  private emitSymbol(
    node: SyntaxNode,
    rule: SymbolRule,
    filePath: string,
    out: ExternalSymbolDefinition[]
  ): void {
    const name = getFieldText(node, rule.nameField ?? 'name');
    if (!name) return;

    const owner = rule.ownerFromField
      ? this.ownerFromReceiver(node, rule.ownerFromField)
      : this.findOwner(node);
    // Context-dependent kind: same node type is a member when owned (Python
    // `function_definition` → 'method' inside a class, 'function' at module level).
    const kind =
      owner && rule.kindWhenOwned ? rule.kindWhenOwned : this.resolveKind(node, rule);
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
    const isExported = rule.exportedByCapitalization ? startsUppercase(name) : undefined;

    out.push(
      nodeToSymbol(node, name, kind, this.language, filePath, {
        visibility: extractVisibility(node, this.language),
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
    out = out.replace(
      /\{\?field:([A-Za-z_]+):([^}]*)\}/g,
      (_m, field: string, lit: string) => (node.childForFieldName(field) ? lit : '')
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
    if (callRules.length === 0 && pathRules.length === 0 && moduleRules.length === 0) return out;
    walkTree(tree.rootNode, (node) => {
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
        toModule: moduleNode.text,
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
      const original = rule.aliasNameField
        ? getFieldText(child, rule.aliasNameField)
        : undefined;
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

  extractCalls(tree: ParseTree, filePath: string): CallEdge[] {
    const out: CallEdge[] = [];
    const rules = this.trait.calls ?? [];
    if (rules.length === 0) return out;
    walkTree(tree.rootNode, (node) => {
      for (const rule of rules) {
        if (node.type !== rule.callNodeType) continue;

        let calleeName: string | undefined;
        let calleeOwner: string | undefined;

        if (rule.selector && rule.functionField) {
          // Selector style (Go): callee nested under `functionField`.
          const fn = node.childForFieldName(rule.functionField);
          if (!fn) continue;
          if (fn.type === rule.selector.nodeType) {
            calleeName = getFieldText(fn, rule.selector.nameField);
            calleeOwner = getFieldText(fn, rule.selector.ownerField);
          } else if (fn.type === rule.selector.bareType) {
            calleeName = fn.text;
          } else {
            continue;
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
          callerId: this.enclosingSymbol(node),
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

  /** Nearest ancestor container symbol's name (class/module), for `owner`. */
  private findOwner(node: SyntaxNode): string | undefined {
    let p = node.parent;
    while (p) {
      if (this.containerTypes.has(p.type)) {
        return getFieldText(p, this.symbolRulesByType.get(p.type)?.nameField ?? 'name');
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
        return getFieldText(p, rule.nameField ?? 'name') ?? '<anonymous>';
      }
      p = p.parent;
    }
    return '<module>';
  }
}

function stripQuotes(text: string): string {
  return text.replace(/^['"`]|['"`]$/g, '').trim();
}

/**
 * True when the identifier's first character is an uppercase letter — the Go
 * export convention (mirrors BaseAdapter.extractVisibility's Go branch and the
 * bespoke GoAdapter.isExported check exactly).
 */
function startsUppercase(name: string): boolean {
  return name.length > 0 && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
}
