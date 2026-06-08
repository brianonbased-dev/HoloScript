import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import {
  operatorContracts,
  operatorContractExemptions,
  validateOperatorContractCoverage,
} from '../operator-contracts';

interface SymbolReference {
  importedName: string;
  source: string;
}

interface SourceModule {
  declarations: Map<string, ts.Expression>;
  imports: Map<string, SymbolReference>;
  reExports: Map<string, SymbolReference>;
  sourceFile: ts.SourceFile;
}

const testDir = path.dirname(fileURLToPath(import.meta.url));
const mcpSrcDir = path.resolve(testDir, '..');
const repoRoot = path.resolve(mcpSrcDir, '../../..');

describe('operator contracts', () => {
  it('covers every registered MCP tool with a contract or explicit exemption', () => {
    const registeredToolNames = readRegisteredMcpToolNames();
    const coverage = validateOperatorContractCoverage(registeredToolNames);

    expect(coverage.missingContracts).toEqual([]);
    expect(coverage.orphanContracts).toEqual([]);
    expect(coverage.invalidContracts).toEqual([]);
  });

  it('stores natural-language verbs and example dialogues for every contracted tool', () => {
    const registeredToolNames = readRegisteredMcpToolNames();
    const contractNames = new Set(Object.keys(operatorContracts));
    const exemptNames = new Set(Object.keys(operatorContractExemptions));

    for (const toolName of registeredToolNames) {
      if (exemptNames.has(toolName)) continue;
      const contract = operatorContracts[toolName];

      expect(contractNames.has(toolName)).toBe(true);
      expect(contract.toolName).toBe(toolName);
      expect(contract.nlVerbs.length).toBeGreaterThanOrEqual(2);
      expect(contract.exampleDialogues.length).toBeGreaterThanOrEqual(1);

      for (const example of contract.exampleDialogues) {
        expect(example.user.length).toBeGreaterThan(0);
        expect(example.assistant.length).toBeGreaterThan(0);
        expect(example.toolCall.name).toBe(toolName);
        expect(example.toolCall.arguments).toEqual(expect.any(Object));
      }
    }
  });

  it('statically enumerates the MCP registry from tools.ts and imported tool arrays', () => {
    const registeredToolNames = readRegisteredMcpToolNames();

    expect(registeredToolNames.length).toBeGreaterThan(250);
    expect(new Set(registeredToolNames).size).toBe(registeredToolNames.length);
    expect(registeredToolNames).toEqual(
      expect.arrayContaining([
        'parse_hs',
        'holomesh_board_list',
        'holoscript_compile_healthcare',
        'holo_query_receipts',
        'sim_run_paid',
      ])
    );
  });

  it('fails closed when a new MCP tool lacks an operator contract', () => {
    const registeredToolNames = readRegisteredMcpToolNames();
    const fakeToolName = 'missing_operator_contract_probe';

    const coverage = validateOperatorContractCoverage([...registeredToolNames, fakeToolName]);

    expect(coverage.missingContracts).toContain(fakeToolName);
  });
});

function readRegisteredMcpToolNames(): string[] {
  const registry = new StaticToolRegistry();
  return registry.resolveToolArray(path.join(mcpSrcDir, 'tools.ts'), 'tools');
}

class StaticToolRegistry {
  private readonly moduleCache = new Map<string, SourceModule>();

  resolveToolArray(filePath: string, exportName: string): string[] {
    const resolved = this.resolveSymbol(path.resolve(filePath), exportName, new Map(), new Set());
    return [...new Set(resolved)].sort();
  }

  private resolveSymbol(
    filePath: string,
    symbolName: string,
    bindings: Map<string, string>,
    seen: Set<string>
  ): string[] {
    const key = `${filePath}#${symbolName}`;
    if (seen.has(key)) return [];
    seen.add(key);

    const sourceModule = this.readModule(filePath);
    const declaration = sourceModule.declarations.get(symbolName);
    if (declaration) {
      return this.evaluateExpression(declaration, filePath, bindings, seen);
    }

    const imported = sourceModule.imports.get(symbolName) ?? sourceModule.reExports.get(symbolName);
    if (imported) {
      return this.resolveSymbol(
        this.resolveModulePath(filePath, imported.source),
        imported.importedName,
        bindings,
        seen
      );
    }

    return [];
  }

  private readModule(filePath: string): SourceModule {
    const normalizedPath = path.normalize(filePath);
    const cached = this.moduleCache.get(normalizedPath);
    if (cached) return cached;

    const sourceText = fs.readFileSync(normalizedPath, 'utf8');
    const sourceFile = ts.createSourceFile(
      normalizedPath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const sourceModule: SourceModule = {
      declarations: new Map(),
      imports: new Map(),
      reExports: new Map(),
      sourceFile,
    };

    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement)) {
        this.collectImport(statement, sourceModule.imports);
      } else if (ts.isExportDeclaration(statement)) {
        this.collectReExport(statement, sourceModule.reExports);
      } else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.initializer) {
            sourceModule.declarations.set(declaration.name.text, declaration.initializer);
          }
        }
      }
    }

    this.moduleCache.set(normalizedPath, sourceModule);
    return sourceModule;
  }

  private collectImport(
    statement: ts.ImportDeclaration,
    imports: Map<string, SymbolReference>
  ): void {
    const source = this.moduleSpecifierText(statement.moduleSpecifier);
    const namedBindings = statement.importClause?.namedBindings;
    if (!source || !namedBindings || !ts.isNamedImports(namedBindings)) return;

    for (const element of namedBindings.elements) {
      imports.set(element.name.text, {
        importedName: element.propertyName?.text ?? element.name.text,
        source,
      });
    }
  }

  private collectReExport(
    statement: ts.ExportDeclaration,
    reExports: Map<string, SymbolReference>
  ): void {
    const source = this.moduleSpecifierText(statement.moduleSpecifier);
    if (!source || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) return;

    for (const element of statement.exportClause.elements) {
      reExports.set(element.name.text, {
        importedName: element.propertyName?.text ?? element.name.text,
        source,
      });
    }
  }

  private evaluateExpression(
    expression: ts.Expression,
    filePath: string,
    bindings: Map<string, string>,
    seen: Set<string>
  ): string[] {
    const unwrapped = unwrapExpression(expression);
    if (ts.isArrayLiteralExpression(unwrapped)) {
      return unwrapped.elements.flatMap((element) => {
        if (ts.isSpreadElement(element)) {
          return this.evaluateExpression(element.expression, filePath, bindings, seen);
        }
        if (ts.isObjectLiteralExpression(element)) {
          const toolName = this.extractToolName(element, bindings);
          return toolName ? [toolName] : [];
        }
        const literal = this.evaluateString(element, bindings);
        return literal ? [literal] : [];
      });
    }

    if (ts.isObjectLiteralExpression(unwrapped)) {
      const toolName = this.extractToolName(unwrapped, bindings);
      return toolName ? [toolName] : [];
    }

    if (ts.isIdentifier(unwrapped)) {
      const boundValue = bindings.get(unwrapped.text);
      if (boundValue) return [boundValue];
      return this.resolveSymbol(filePath, unwrapped.text, bindings, seen);
    }

    if (ts.isCallExpression(unwrapped) && isMapCall(unwrapped)) {
      return this.evaluateMapCall(unwrapped, filePath, bindings, seen);
    }

    const literal = this.evaluateString(unwrapped, bindings);
    return literal ? [literal] : [];
  }

  private evaluateMapCall(
    callExpression: ts.CallExpression,
    filePath: string,
    bindings: Map<string, string>,
    seen: Set<string>
  ): string[] {
    const mapAccess = callExpression.expression;
    if (!ts.isPropertyAccessExpression(mapAccess)) return [];
    const values = this.evaluateExpression(mapAccess.expression, filePath, bindings, seen);
    const callback = callExpression.arguments[0];
    if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)))
      return [];
    const parameter = callback.parameters[0]?.name;
    if (!parameter || !ts.isIdentifier(parameter)) return [];

    const body = ts.isBlock(callback.body)
      ? callback.body.statements.find(ts.isReturnStatement)?.expression
      : callback.body;
    if (!body) return [];

    return values.flatMap((value) => {
      const nextBindings = new Map(bindings);
      nextBindings.set(parameter.text, value);
      return this.evaluateExpression(body, filePath, nextBindings, seen);
    });
  }

  private extractToolName(
    objectLiteral: ts.ObjectLiteralExpression,
    bindings: Map<string, string>
  ): string | undefined {
    for (const property of objectLiteral.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      if (propertyNameText(property.name) !== 'name') continue;
      return this.evaluateString(property.initializer, bindings);
    }
    return undefined;
  }

  private evaluateString(
    expression: ts.Expression,
    bindings: Map<string, string>
  ): string | undefined {
    const unwrapped = unwrapExpression(expression);
    if (ts.isStringLiteralLike(unwrapped)) return unwrapped.text;
    if (ts.isIdentifier(unwrapped)) return bindings.get(unwrapped.text);
    if (ts.isTemplateExpression(unwrapped)) {
      return unwrapped.templateSpans.reduce((text, span) => {
        const value = this.evaluateString(span.expression, bindings);
        if (value === undefined) return text;
        return `${text}${value}${span.literal.text}`;
      }, unwrapped.head.text);
    }
    return undefined;
  }

  private resolveModulePath(fromFilePath: string, source: string): string {
    if (source.startsWith('.')) {
      return firstExistingPath([
        path.resolve(path.dirname(fromFilePath), source),
        path.resolve(path.dirname(fromFilePath), `${source}.ts`),
        path.resolve(path.dirname(fromFilePath), source, 'index.ts'),
      ]);
    }

    if (source.startsWith('@holoscript/')) {
      const [packageName, ...subpath] = source.slice('@holoscript/'.length).split('/');
      const packageSrcDir = path.join(repoRoot, 'packages', packageName, 'src');
      return firstExistingPath([
        path.join(packageSrcDir, `${subpath.join('/')}.ts`),
        path.join(packageSrcDir, ...subpath, 'index.ts'),
        path.join(packageSrcDir, 'index.ts'),
      ]);
    }

    throw new Error(`Unsupported operator-contract registry import: ${source}`);
  }

  private moduleSpecifierText(moduleSpecifier: ts.Expression | undefined): string | undefined {
    return moduleSpecifier && ts.isStringLiteral(moduleSpecifier)
      ? moduleSpecifier.text
      : undefined;
  }
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function isMapCall(expression: ts.CallExpression): boolean {
  return (
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === 'map'
  );
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return undefined;
}

function firstExistingPath(candidates: string[]): string {
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  if (!existing) {
    throw new Error(
      `Unable to resolve operator-contract registry source. Tried: ${candidates.join(', ')}`
    );
  }
  return existing;
}
