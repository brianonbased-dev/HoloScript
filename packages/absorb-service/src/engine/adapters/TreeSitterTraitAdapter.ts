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
      const name = getFieldText(node, rule.nameField ?? 'name');
      if (!name) return;
      const owner = this.findOwner(node);
      out.push(
        nodeToSymbol(node, name, rule.kind, this.language, filePath, {
          visibility: extractVisibility(node, this.language),
          owner,
          signature: owner ? `${owner}.${name}` : name,
        })
      );
    });
    return out;
  }

  extractImports(tree: ParseTree, filePath: string): ImportEdge[] {
    const out: ImportEdge[] = [];
    const rules = this.trait.imports ?? [];
    if (rules.length === 0) return out;
    walkTree(tree.rootNode, (node) => {
      for (const rule of rules) {
        if (node.type !== rule.callNodeType) continue;
        const method = getFieldText(node, rule.methodField);
        if (!method || !rule.methodNames.includes(method)) continue;
        // The module path is the first string literal in the call's arguments.
        const str = node.descendantsOfType('string')[0];
        if (!str) continue;
        const toModule = stripQuotes(str.text);
        if (toModule) out.push({ fromFile: filePath, toModule, line: node.startPosition.row + 1 });
      }
    });
    return out;
  }

  extractCalls(tree: ParseTree, filePath: string): CallEdge[] {
    const out: CallEdge[] = [];
    const rules = this.trait.calls ?? [];
    if (rules.length === 0) return out;
    walkTree(tree.rootNode, (node) => {
      for (const rule of rules) {
        if (node.type !== rule.callNodeType) continue;
        const calleeName = getFieldText(node, rule.methodField);
        if (!calleeName) continue;
        // Import-bearing calls (require/…) are already emitted as import edges.
        if (this.importMethodNames.has(calleeName)) continue;
        const calleeOwner = rule.receiverField
          ? getFieldText(node, rule.receiverField)
          : undefined;
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
