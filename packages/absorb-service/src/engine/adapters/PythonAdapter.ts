/**
 * Python Language Adapter
 *
 * Extracts symbols, imports, and call edges from Python source files
 * using tree-sitter-python.
 */

import type {
  LanguageAdapter,
  ParseTree,
  SyntaxNode,
  ExternalSymbolDefinition,
  ImportEdge,
  CallEdge,
} from '../types';
import { walkTree, nodeToSymbol, getFieldText, extractVisibility } from './BaseAdapter';

export class PythonAdapter implements LanguageAdapter {
  readonly language = 'python' as const;
  readonly extensions = ['.py', '.pyi'];
  readonly grammarPackage = 'tree-sitter-python';

  extractSymbols(tree: ParseTree, filePath: string): ExternalSymbolDefinition[] {
    const symbols: ExternalSymbolDefinition[] = [];

    walkTree(tree.rootNode, (node) => {
      switch (node.type) {
        case 'class_definition': {
          const name = getFieldText(node, 'name');
          if (name) {
            const superclass = node.childForFieldName('superclasses');
            symbols.push(
              nodeToSymbol(node, name, 'class', 'python', filePath, {
                visibility: extractVisibility(node, 'python'),
                signature: superclass ? `class ${name}(${superclass.text})` : `class ${name}`,
              })
            );
            this.extractMethods(node, name, filePath, symbols);
          }
          return false;
        }

        case 'function_definition': {
          const name = getFieldText(node, 'name');
          if (name) {
            // Check if this is a method (inside a class)
            const isMethod =
              node.parent?.type === 'block' && node.parent.parent?.type === 'class_definition';
            if (!isMethod) {
              const params = node.childForFieldName('parameters');
              symbols.push(
                nodeToSymbol(node, name, 'function', 'python', filePath, {
                  visibility: extractVisibility(node, 'python'),
                  signature: `def ${name}(${params?.text ?? ''})`,
                })
              );
            }
          }
          return false;
        }

        case 'decorated_definition': {
          // Let the inner class/function handle extraction
          return true;
        }
      }
    });

    return symbols;
  }

  extractImports(tree: ParseTree, filePath: string): ImportEdge[] {
    const imports: ImportEdge[] = [];

    walkTree(tree.rootNode, (node) => {
      if (node.type === 'import_statement') {
        // import foo, import foo.bar
        for (const child of node.namedChildren) {
          if (child.type === 'dotted_name' || child.type === 'aliased_import') {
            const name =
              child.type === 'aliased_import'
                ? getFieldText(child, 'name') || child.text
                : child.text;
            imports.push({
              fromFile: filePath,
              toModule: name,
              line: node.startPosition.row + 1,
            });
          }
        }
        return false;
      }

      if (node.type === 'import_from_statement') {
        // from foo import bar, baz
        const module = node.childForFieldName('module_name');
        if (module) {
          const edge: ImportEdge = {
            fromFile: filePath,
            toModule: module.text,
            line: node.startPosition.row + 1,
            namedImports: [],
          };

          for (const child of node.namedChildren) {
            if (child.type === 'dotted_name' && child !== module) {
              edge.namedImports!.push(child.text);
            }
            if (child.type === 'aliased_import') {
              const name = getFieldText(child, 'name') || child.text;
              edge.namedImports!.push(name);
            }
            if (child.type === 'wildcard_import') {
              edge.isWildcard = true;
            }
          }

          imports.push(edge);
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
      if (node.type === 'function_definition') {
        const name = getFieldText(node, 'name') || '<anonymous>';
        contextStack.push(name);
      }

      if (node.type === 'call') {
        const fn = node.childForFieldName('function');
        if (!fn) return;

        const callerId = contextStack[contextStack.length - 1] || '<module>';

        if (fn.type === 'attribute') {
          const obj = fn.childForFieldName('object');
          const attr = fn.childForFieldName('attribute');
          if (obj && attr) {
            calls.push({
              callerId,
              calleeName: attr.text,
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

  private extractMethods(
    classNode: SyntaxNode,
    className: string,
    filePath: string,
    symbols: ExternalSymbolDefinition[]
  ): void {
    const body = classNode.childForFieldName('body');
    if (!body) return;

    for (const child of body.namedChildren) {
      const defNode =
        child.type === 'decorated_definition'
          ? child.namedChildren.find((c: SyntaxNode) => c.type === 'function_definition')
          : child.type === 'function_definition'
            ? child
            : null;

      if (defNode) {
        const name = getFieldText(defNode, 'name');
        if (name) {
          const params = defNode.childForFieldName('parameters');
          symbols.push(
            nodeToSymbol(defNode, name, 'method', 'python', filePath, {
              visibility: extractVisibility(defNode, 'python'),
              owner: className,
              signature: `${className}.${name}(${params?.text ?? ''})`,
            })
          );
        }
      }
    }
  }
}
