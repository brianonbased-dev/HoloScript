/**
 * Rust Language Adapter
 *
 * Extracts symbols, imports, and call edges from Rust source files
 * using tree-sitter-rust.
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
  hasModifier,
} from './BaseAdapter';

export class RustAdapter implements LanguageAdapter {
  readonly language = 'rust' as const;
  readonly extensions = ['.rs'];
  readonly grammarPackage = 'tree-sitter-rust';

  extractSymbols(tree: ParseTree, filePath: string): ExternalSymbolDefinition[] {
    const symbols: ExternalSymbolDefinition[] = [];

    walkTree(tree.rootNode, (node) => {
      const isPub = hasModifier(node, 'pub');
      const vis = isPub ? 'public' as const : 'private' as const;

      switch (node.type) {
        case 'struct_item': {
          const name = getFieldText(node, 'name');
          if (name) {
            symbols.push(nodeToSymbol(node, name, 'struct', 'rust', filePath, {
              visibility: vis,
              isExported: isPub,
              signature: `struct ${name}`,
            }));
          }
          return false;
        }

        case 'enum_item': {
          const name = getFieldText(node, 'name');
          if (name) {
            symbols.push(nodeToSymbol(node, name, 'enum', 'rust', filePath, {
              visibility: vis,
              isExported: isPub,
            }));
          }
          return false;
        }

        case 'trait_item': {
          const name = getFieldText(node, 'name');
          if (name) {
            symbols.push(nodeToSymbol(node, name, 'trait', 'rust', filePath, {
              visibility: vis,
              isExported: isPub,
              signature: `trait ${name}`,
            }));
          }
          return false;
        }

        case 'function_item': {
          const name = getFieldText(node, 'name');
          if (name) {
            const params = node.childForFieldName('parameters');
            const ret = node.childForFieldName('return_type');
            let sig = `fn ${name}(${params?.text ?? ''})`;
            if (ret) sig += ` -> ${ret.text}`;
            symbols.push(nodeToSymbol(node, name, 'function', 'rust', filePath, {
              visibility: vis,
              isExported: isPub,
              signature: sig,
            }));
          }
          return false;
        }

        case 'impl_item': {
          // Extract methods from impl blocks
          const typeName = node.childForFieldName('type');
          if (typeName) {
            this.extractImplMethods(node, typeName.text, filePath, symbols);
          }
          return false;
        }

        case 'mod_item': {
          const name = getFieldText(node, 'name');
          if (name) {
            symbols.push(nodeToSymbol(node, name, 'module', 'rust', filePath, {
              visibility: vis,
              isExported: isPub,
            }));
          }
          // Continue into mod body to find nested items
          return true;
        }

        case 'type_item': {
          const name = getFieldText(node, 'name');
          if (name) {
            symbols.push(nodeToSymbol(node, name, 'type_alias', 'rust', filePath, {
              visibility: vis,
              isExported: isPub,
            }));
          }
          return false;
        }

        case 'const_item':
        case 'static_item': {
          const name = getFieldText(node, 'name');
          if (name) {
            symbols.push(nodeToSymbol(node, name, 'constant', 'rust', filePath, {
              visibility: vis,
              isExported: isPub,
            }));
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
      if (node.type === 'use_declaration') {
        const path = this.extractUsePath(node);
        if (path) {
          imports.push({
            fromFile: filePath,
            toModule: path.module,
            line: node.startPosition.row + 1,
            namedImports: path.names,
            isWildcard: path.isGlob,
          });
        }
        return false;
      }

      // mod declarations that reference external files
      if (node.type === 'mod_item') {
        const name = getFieldText(node, 'name');
        const body = node.childForFieldName('body');
        // Only file-reference mods (no inline body)
        if (name && !body) {
          imports.push({
            fromFile: filePath,
            toModule: name,
            line: node.startPosition.row + 1,
          });
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
      if (node.type === 'function_item') {
        const name = getFieldText(node, 'name') || '<anonymous>';
        contextStack.push(name);
      }

      if (node.type === 'call_expression') {
        const fn = node.childForFieldName('function');
        if (!fn) return;

        const callerId = contextStack[contextStack.length - 1] || '<module>';

        if (fn.type === 'field_expression') {
          const obj = fn.childForFieldName('value');
          const field = fn.childForFieldName('field');
          if (obj && field) {
            calls.push({
              callerId,
              calleeName: field.text,
              calleeOwner: obj.text,
              filePath,
              line: node.startPosition.row + 1,
              column: node.startPosition.column,
            });
          }
        } else if (fn.type === 'identifier' || fn.type === 'scoped_identifier') {
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

  private extractImplMethods(
    implNode: any,
    typeName: string,
    filePath: string,
    symbols: ExternalSymbolDefinition[],
  ): void {
    const body = implNode.childForFieldName('body');
    if (!body) return;

    for (const child of body.namedChildren) {
      if (child.type === 'function_item') {
        const name = getFieldText(child, 'name');
        const isPub = hasModifier(child, 'pub');
        if (name) {
          const params = child.childForFieldName('parameters');
          const ret = child.childForFieldName('return_type');
          let sig = `${typeName}::${name}(${params?.text ?? ''})`;
          if (ret) sig += ` -> ${ret.text}`;

          symbols.push(nodeToSymbol(child, name, 'method', 'rust', filePath, {
            visibility: isPub ? 'public' : 'private',
            owner: typeName,
            signature: sig,
          }));
        }
      }
    }
  }

  private extractUsePath(node: any): { module: string; names: string[]; isGlob: boolean } | null {
    // Recursively build the use path
    const names: string[] = [];
    let isGlob = false;
    let modulePath = '';

    const collectPath = (n: any): string => {
      if (n.type === 'scoped_identifier' || n.type === 'scoped_use_list') {
        const path = n.childForFieldName('path');
        const name = n.childForFieldName('name');
        const list = n.childForFieldName('list');
        let prefix = path ? collectPath(path) : '';

        if (name) return prefix ? `${prefix}::${name.text}` : name.text;
        if (list) {
          // use foo::{Bar, Baz}
          for (const item of list.namedChildren) {
            if (item.type === 'identifier') names.push(item.text);
            else if (item.type === 'scoped_identifier') names.push(collectPath(item));
          }
          return prefix;
        }
        return prefix;
      }
      if (n.type === 'identifier') return n.text;
      if (n.type === 'use_wildcard') { isGlob = true; return '*'; }
      if (n.type === 'use_list') {
        for (const item of n.namedChildren) {
          if (item.type === 'identifier') names.push(item.text);
        }
        return '';
      }
      return n.text || '';
    };

    // The argument of use_declaration
    for (const child of node.namedChildren) {
      if (child.type !== 'visibility_modifier') {
        modulePath = collectPath(child);
        break;
      }
    }

    if (!modulePath && names.length === 0) return null;
    return { module: modulePath, names, isGlob };
  }
}
