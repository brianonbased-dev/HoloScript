/**
 * TypeScript / JavaScript Language Adapter
 *
 * Extracts symbols, imports, and call edges from TypeScript and JavaScript
 * source files using tree-sitter-typescript / tree-sitter-javascript.
 */

import type {
  LanguageAdapter,
  ParseTree,
  SyntaxNode,
  ExternalSymbolDefinition,
  ImportEdge,
  CallEdge,
  ExtendedSymbolType,
} from '../types';
import {
  walkTree,
  nodeToSymbol,
  getFieldText,
  extractVisibility,
} from './BaseAdapter';

export class TypeScriptAdapter implements LanguageAdapter {
  readonly language = 'typescript' as const;
  readonly extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];
  readonly grammarPackage = 'tree-sitter-typescript';

  extractSymbols(tree: ParseTree, filePath: string): ExternalSymbolDefinition[] {
    const symbols: ExternalSymbolDefinition[] = [];
    const exportedNames = this.collectExports(tree.rootNode);

    walkTree(tree.rootNode, (node) => {
      switch (node.type) {
        case 'class_declaration':
        case 'abstract_class_declaration': {
          const name = getFieldText(node, 'name');
          if (name) {
            symbols.push(nodeToSymbol(node, name, 'class', 'typescript', filePath, {
              visibility: extractVisibility(node, 'typescript'),
              isExported: exportedNames.has(name) || this.hasExportModifier(node),
              signature: this.classSignature(node),
            }));
            // Extract methods and fields
            this.extractClassMembers(node, name, filePath, symbols);
          }
          return false; // Don't recurse into class body (handled above)
        }

        case 'interface_declaration': {
          const name = getFieldText(node, 'name');
          if (name) {
            symbols.push(nodeToSymbol(node, name, 'interface', 'typescript', filePath, {
              visibility: 'public',
              isExported: exportedNames.has(name) || this.hasExportModifier(node),
              signature: `interface ${name}`,
            }));
          }
          return false;
        }

        case 'type_alias_declaration': {
          const name = getFieldText(node, 'name');
          if (name) {
            symbols.push(nodeToSymbol(node, name, 'type_alias', 'typescript', filePath, {
              visibility: 'public',
              isExported: exportedNames.has(name) || this.hasExportModifier(node),
            }));
          }
          return false;
        }

        case 'enum_declaration': {
          const name = getFieldText(node, 'name');
          if (name) {
            symbols.push(nodeToSymbol(node, name, 'enum', 'typescript', filePath, {
              visibility: 'public',
              isExported: exportedNames.has(name) || this.hasExportModifier(node),
            }));
          }
          return false;
        }

        case 'function_declaration': {
          const name = getFieldText(node, 'name');
          if (name) {
            symbols.push(nodeToSymbol(node, name, 'function', 'typescript', filePath, {
              visibility: 'public',
              isExported: exportedNames.has(name) || this.hasExportModifier(node),
              signature: this.functionSignature(node),
            }));
          }
          return false;
        }

        case 'lexical_declaration':
        case 'variable_declaration': {
          // const Foo = ..., export const Bar = ...
          for (const declarator of node.namedChildren) {
            if (declarator.type === 'variable_declarator') {
              const name = getFieldText(declarator, 'name');
              const value = declarator.childForFieldName('value');
              if (name && value) {
                // Arrow function or function expression -> treat as function
                if (value.type === 'arrow_function' || value.type === 'function_expression' || value.type === 'function') {
                  symbols.push(nodeToSymbol(node, name, 'function', 'typescript', filePath, {
                    visibility: 'public',
                    isExported: exportedNames.has(name) || this.hasExportModifier(node),
                    signature: this.arrowSignature(name, value),
                  }));
                } else {
                  // Regular constant
                  symbols.push(nodeToSymbol(node, name, 'constant', 'typescript', filePath, {
                    visibility: 'public',
                    isExported: exportedNames.has(name) || this.hasExportModifier(node),
                  }));
                }
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
      if (node.type === 'import_statement') {
        const source = node.childForFieldName('source');
        if (!source) return;

        const modulePath = source.text.replace(/^['"]|['"]$/g, '');
        const edge: ImportEdge = {
          fromFile: filePath,
          toModule: modulePath,
          line: node.startPosition.row + 1,
          namedImports: [],
          isWildcard: false,
          isDefault: false,
        };

        // Analyze import clause
        for (const child of node.namedChildren) {
          if (child.type === 'import_clause') {
            for (const spec of child.namedChildren) {
              if (spec.type === 'identifier') {
                edge.isDefault = true;
                edge.namedImports!.push(spec.text);
              } else if (spec.type === 'named_imports') {
                for (const specifier of spec.namedChildren) {
                  if (specifier.type === 'import_specifier') {
                    const name = getFieldText(specifier, 'name') || specifier.text;
                    edge.namedImports!.push(name);
                  }
                }
              } else if (spec.type === 'namespace_import') {
                edge.isWildcard = true;
              }
            }
          }
        }

        imports.push(edge);
        return false;
      }

      // Dynamic imports: import('./foo')
      if (node.type === 'call_expression') {
        const fn = node.childForFieldName('function');
        if (fn?.type === 'import') {
          const args = node.childForFieldName('arguments');
          if (args && args.childCount > 0) {
            const firstArg = args.namedChildren[0];
            if (firstArg?.type === 'string') {
              imports.push({
                fromFile: filePath,
                toModule: firstArg.text.replace(/^['"]|['"]$/g, ''),
                line: node.startPosition.row + 1,
              });
            }
          }
        }
      }

      // require() calls
      if (node.type === 'call_expression') {
        const fn = node.childForFieldName('function');
        if (fn?.text === 'require') {
          const args = node.childForFieldName('arguments');
          if (args && args.namedChildren.length > 0) {
            const firstArg = args.namedChildren[0];
            if (firstArg?.type === 'string') {
              imports.push({
                fromFile: filePath,
                toModule: firstArg.text.replace(/^['"]|['"]$/g, ''),
                line: node.startPosition.row + 1,
              });
            }
          }
        }
      }
    });

    return imports;
  }

  extractCalls(tree: ParseTree, filePath: string): CallEdge[] {
    const calls: CallEdge[] = [];
    const contextStack: string[] = []; // track enclosing function/method

    walkTree(tree.rootNode, (node) => {
      // Track entering function/method scope
      if (
        node.type === 'function_declaration' ||
        node.type === 'method_definition' ||
        node.type === 'arrow_function'
      ) {
        const name = getFieldText(node, 'name') || '<anonymous>';
        contextStack.push(name);
      }

      if (node.type === 'call_expression') {
        const fn = node.childForFieldName('function');
        if (!fn) return;

        const callerId = contextStack[contextStack.length - 1] || '<module>';

        if (fn.type === 'member_expression') {
          // object.method() calls
          const obj = fn.childForFieldName('object');
          const prop = fn.childForFieldName('property');
          if (obj && prop) {
            calls.push({
              callerId,
              calleeName: prop.text,
              calleeOwner: obj.text,
              filePath,
              line: node.startPosition.row + 1,
              column: node.startPosition.column,
            });
          }
        } else if (fn.type === 'identifier') {
          // direct function() calls
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

  // ── Private helpers ──────────────────────────────────────────────────────

  private collectExports(root: SyntaxNode): Set<string> {
    const names = new Set<string>();
    walkTree(root, (node) => {
      if (node.type === 'export_statement') {
        // export { Foo, Bar }
        for (const child of node.namedChildren) {
          if (child.type === 'export_clause') {
            for (const spec of child.namedChildren) {
              if (spec.type === 'export_specifier') {
                const name = getFieldText(spec, 'name') || spec.text;
                names.add(name);
              }
            }
          }
          // export class Foo / export function bar
          const name = getFieldText(child, 'name');
          if (name) names.add(name);
        }
        return false;
      }
    });
    return names;
  }

  private hasExportModifier(node: SyntaxNode): boolean {
    // Check if parent is an export_statement
    if (node.parent?.type === 'export_statement') return true;
    // Check if node starts with 'export' keyword
    if (node.children[0]?.text === 'export') return true;
    return false;
  }

  private extractClassMembers(
    classNode: SyntaxNode,
    className: string,
    filePath: string,
    symbols: ExternalSymbolDefinition[],
  ): void {
    const body = classNode.childForFieldName('body');
    if (!body) return;

    for (const member of body.namedChildren) {
      if (member.type === 'method_definition') {
        const name = getFieldText(member, 'name');
        if (name) {
          symbols.push(nodeToSymbol(member, name, 'method', 'typescript', filePath, {
            visibility: extractVisibility(member, 'typescript'),
            owner: className,
            signature: this.methodSignature(className, member),
          }));
        }
      } else if (
        member.type === 'public_field_definition' ||
        member.type === 'property_definition'
      ) {
        const name = getFieldText(member, 'name');
        if (name) {
          symbols.push(nodeToSymbol(member, name, 'field', 'typescript', filePath, {
            visibility: extractVisibility(member, 'typescript'),
            owner: className,
          }));
        }
      }
    }
  }

  private classSignature(node: SyntaxNode): string {
    const name = getFieldText(node, 'name') || '?';
    const heritage = node.childForFieldName('heritage');
    if (heritage) {
      return `class ${name} ${heritage.text}`;
    }
    return `class ${name}`;
  }

  private functionSignature(node: SyntaxNode): string {
    const name = getFieldText(node, 'name') || '?';
    const params = node.childForFieldName('parameters');
    const returnType = node.childForFieldName('return_type');
    let sig = `function ${name}(${params?.text ?? ''})`;
    if (returnType) sig += `: ${returnType.text}`;
    return sig;
  }

  private methodSignature(className: string, node: SyntaxNode): string {
    const name = getFieldText(node, 'name') || '?';
    const params = node.childForFieldName('parameters');
    return `${className}.${name}(${params?.text ?? ''})`;
  }

  private arrowSignature(name: string, node: SyntaxNode): string {
    const params = node.childForFieldName('parameters');
    if (params) return `const ${name} = (${params.text}) => ...`;
    return `const ${name} = (...) => ...`;
  }
}
