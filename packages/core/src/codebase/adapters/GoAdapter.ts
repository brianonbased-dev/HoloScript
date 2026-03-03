/**
 * Go Language Adapter
 *
 * Extracts symbols, imports, and call edges from Go source files
 * using tree-sitter-go. Uses Go naming convention: uppercase = exported.
 */

import type {
  LanguageAdapter,
  ParseTree,
  ExternalSymbolDefinition,
  ImportEdge,
  CallEdge,
} from '../types';
import {
  walkTree,
  nodeToSymbol,
  getFieldText,
} from './BaseAdapter';

export class GoAdapter implements LanguageAdapter {
  readonly language = 'go' as const;
  readonly extensions = ['.go'];
  readonly grammarPackage = 'tree-sitter-go';

  extractSymbols(tree: ParseTree, filePath: string): ExternalSymbolDefinition[] {
    const symbols: ExternalSymbolDefinition[] = [];

    walkTree(tree.rootNode, (node) => {
      switch (node.type) {
        case 'function_declaration': {
          const name = getFieldText(node, 'name');
          if (name) {
            const params = node.childForFieldName('parameters');
            const result = node.childForFieldName('result');
            let sig = `func ${name}(${params?.text ?? ''})`;
            if (result) sig += ` ${result.text}`;
            symbols.push(nodeToSymbol(node, name, 'function', 'go', filePath, {
              visibility: this.goVisibility(name),
              isExported: this.isExported(name),
              signature: sig,
            }));
          }
          return false;
        }

        case 'method_declaration': {
          const name = getFieldText(node, 'name');
          const receiver = node.childForFieldName('receiver');
          if (name) {
            const receiverType = this.extractReceiverType(receiver);
            const params = node.childForFieldName('parameters');
            const sig = `func (${receiver?.text ?? ''}) ${name}(${params?.text ?? ''})`;
            symbols.push(nodeToSymbol(node, name, 'method', 'go', filePath, {
              visibility: this.goVisibility(name),
              owner: receiverType,
              signature: sig,
            }));
          }
          return false;
        }

        case 'type_declaration': {
          for (const spec of node.namedChildren) {
            if (spec.type === 'type_spec') {
              const name = getFieldText(spec, 'name');
              const typeNode = spec.childForFieldName('type');
              if (name && typeNode) {
                const symType = typeNode.type === 'struct_type' ? 'struct' as const
                  : typeNode.type === 'interface_type' ? 'interface' as const
                  : 'type_alias' as const;

                symbols.push(nodeToSymbol(spec, name, symType, 'go', filePath, {
                  visibility: this.goVisibility(name),
                  isExported: this.isExported(name),
                  signature: `type ${name} ${typeNode.type.replace('_type', '')}`,
                }));

                // Extract struct fields
                if (typeNode.type === 'struct_type') {
                  this.extractStructFields(typeNode, name, filePath, symbols);
                }
              }
            }
          }
          return false;
        }

        case 'const_declaration':
        case 'var_declaration': {
          for (const spec of node.namedChildren) {
            if (spec.type === 'const_spec' || spec.type === 'var_spec') {
              const name = getFieldText(spec, 'name');
              if (name) {
                symbols.push(nodeToSymbol(spec, name, 'constant', 'go', filePath, {
                  visibility: this.goVisibility(name),
                  isExported: this.isExported(name),
                }));
              }
            }
          }
          return false;
        }
      }
    });

    return symbols;
  }

  extractImports(tree: ParseTree, filePath: string): ImportEdge[] {
    const imports: ImportEdge[] = [];

    walkTree(tree.rootNode, (node) => {
      if (node.type === 'import_declaration') {
        for (const spec of node.namedChildren) {
          if (spec.type === 'import_spec') {
            const path = spec.childForFieldName('path');
            if (path) {
              imports.push({
                fromFile: filePath,
                toModule: path.text.replace(/^"|"$/g, ''),
                line: spec.startPosition.row + 1,
              });
            }
          }
          if (spec.type === 'import_spec_list') {
            for (const inner of spec.namedChildren) {
              if (inner.type === 'import_spec') {
                const path = inner.childForFieldName('path');
                if (path) {
                  imports.push({
                    fromFile: filePath,
                    toModule: path.text.replace(/^"|"$/g, ''),
                    line: inner.startPosition.row + 1,
                  });
                }
              }
            }
          }
        }
        return false;
      }
    });

    return imports;
  }

  extractCalls(tree: ParseTree, filePath: string): CallEdge[] {
    const calls: CallEdge[] = [];
    const contextStack: string[] = [];

    walkTree(tree.rootNode, (node) => {
      if (node.type === 'function_declaration' || node.type === 'method_declaration') {
        const name = getFieldText(node, 'name') || '<anonymous>';
        contextStack.push(name);
      }

      if (node.type === 'call_expression') {
        const fn = node.childForFieldName('function');
        if (!fn) return;

        const callerId = contextStack[contextStack.length - 1] || '<module>';

        if (fn.type === 'selector_expression') {
          const obj = fn.childForFieldName('operand');
          const sel = fn.childForFieldName('field');
          if (obj && sel) {
            calls.push({
              callerId,
              calleeName: sel.text,
              calleeOwner: obj.text,
              filePath,
              line: node.startPosition.row + 1,
              column: node.startPosition.column,
            });
          }
        } else if (fn.type === 'identifier') {
          calls.push({
            callerId,
            calleeName: fn.text,
            filePath,
            line: node.startPosition.row + 1,
            column: node.startPosition.column,
          });
        }
      }
    });

    return calls;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private isExported(name: string): boolean {
    return name.length > 0 && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
  }

  private goVisibility(name: string): 'public' | 'internal' {
    return this.isExported(name) ? 'public' : 'internal';
  }

  private extractReceiverType(receiver: any): string | undefined {
    if (!receiver) return undefined;
    // (r *ReceiverType) or (r ReceiverType)
    for (const child of receiver.namedChildren) {
      if (child.type === 'parameter_declaration') {
        const typeNode = child.childForFieldName('type');
        if (typeNode) {
          return typeNode.text.replace(/^\*/, '');
        }
      }
    }
    return undefined;
  }

  private extractStructFields(
    structNode: any,
    structName: string,
    filePath: string,
    symbols: ExternalSymbolDefinition[],
  ): void {
    for (const child of structNode.namedChildren) {
      if (child.type === 'field_declaration_list') {
        for (const field of child.namedChildren) {
          if (field.type === 'field_declaration') {
            const name = getFieldText(field, 'name');
            if (name) {
              symbols.push(nodeToSymbol(field, name, 'field', 'go', filePath, {
                visibility: this.goVisibility(name),
                owner: structName,
              }));
            }
          }
        }
      }
    }
  }
}
