/**
 * MCP Refactor & CodeGen Tools for HoloScript
 *
 * Phase 10: Autonomous Refactoring & CodeGen Integration
 *
 * Bridges the gap between diagnosis (holo_self_diagnose) and
 * code mutation (holo_write_file/holo_edit_file) by providing:
 *
 * - holo_generate_refactor_plan: Graph-context-informed refactoring plans
 * - holo_scaffold_code: Convention-aware code generation
 *
 * Pipeline position:
 *   ABSORB → DIAGNOSE → **PLAN/SCAFFOLD** → WRITE/EDIT → VALIDATE → COMMIT
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const refactorCodegenTools: Tool[] = [
  {
    name: 'holo_generate_refactor_plan',
    description: 'Generate a concrete, graph-informed refactoring plan for a target symbol, file, or community. ' +
      'Uses the absorbed codebase graph to understand callers/callees, community boundaries, and impact radius. ' +
      'Returns a step-by-step plan with affected files, risk score, and detected codebase patterns. ' +
      'Requires a prior holo_absorb_repo call.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Symbol name, file path, or community ID to refactor. ' +
            'Examples: "UserService", "src/auth/handler.ts", "community:3"',
        },
        goal: {
          type: 'string',
          enum: [
            'extract_interface',
            'reduce_coupling',
            'add_tests',
            'improve_docs',
            'split_module',
            'inline_module',
            'extract_function',
          ],
          description: 'The refactoring goal. Determines the plan template and risk model.',
        },
        scope: {
          type: 'number',
          description: 'Maximum number of files the plan should touch. Defaults to 10. ' +
            'Lower values produce safer, more focused plans.',
        },
      },
      required: ['target', 'goal'],
    },
  },
  {
    name: 'holo_scaffold_code',
    description: 'Generate a code scaffold (test, interface, module, trait, component) that follows ' +
      'the naming and style conventions detected in the absorbed codebase. ' +
      'Analyzes existing files in the target directory for patterns. ' +
      'Optionally pulls context from a specific symbol in the knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['test', 'interface', 'module', 'trait', 'component'],
          description: 'Type of scaffold to generate.',
        },
        name: {
          type: 'string',
          description: 'Name for the new artifact (e.g., "UserService", "PaymentProcessor").',
        },
        targetDir: {
          type: 'string',
          description: 'Absolute path to the directory where the scaffold will be placed.',
        },
        context: {
          type: 'string',
          description: 'Optional symbol name or file path to scaffold from. ' +
            'For tests: the symbol to test. For interfaces: the class to extract from.',
        },
        language: {
          type: 'string',
          description: 'Target language. Auto-detected from targetDir if omitted. ' +
            'Supports: typescript, javascript, holoscript',
        },
      },
      required: ['type', 'name', 'targetDir'],
    },
  },
];

// =============================================================================
// HANDLER
// =============================================================================

export async function handleRefactorCodegenTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'holo_generate_refactor_plan':
      return handleGenerateRefactorPlan(args);
    case 'holo_scaffold_code':
      return handleScaffoldCode(args);
    default:
      return null;
  }
}

// =============================================================================
// REFACTOR PLAN GENERATOR
// =============================================================================

interface RefactorStep {
  order: number;
  action: string;
  file: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
}

interface RefactorPlan {
  target: string;
  goal: string;
  steps: RefactorStep[];
  affectedFiles: string[];
  riskScore: number;
  codebasePatterns: string[];
  rollbackStrategy: string;
  estimatedImpact: string;
}

async function handleGenerateRefactorPlan(args: Record<string, unknown>): Promise<unknown> {
  const target = args.target as string;
  const goal = args.goal as string;
  const scope = (args.scope as number) ?? 10;

  if (!target || !goal) {
    return { error: 'Both target and goal are required.' };
  }

  // Import graph-rag-tools to check readiness
  const { isGraphRAGReady } = await import('@holoscript/absorb-service/mcp');
  if (!isGraphRAGReady()) {
    return {
      error: 'No Graph RAG engine initialized. Call holo_absorb_repo first.',
      hint: 'The refactor plan generator needs the knowledge graph to analyze dependencies.',
    };
  }

  const { handleGraphRagTool } = await import('@holoscript/absorb-service/mcp');

  // 1. Gather context about the target from the graph
  const contextResult = (await handleGraphRagTool('holo_ask_codebase', {
    question: `Describe the symbol or module "${target}": what it does, its callers, callees, and community. List its dependencies and dependents.`,
    topK: 15,
  })) as Record<string, unknown> | null;

  // 2. Find similar patterns in the codebase (for convention matching)
  const patternResult = (await handleGraphRagTool('holo_semantic_search', {
    query: `${goal.replace(/_/g, ' ')} pattern similar to ${target}`,
    topK: 5,
  })) as Record<string, unknown> | null;

  // 3. Build the plan based on goal type
  const context = contextResult as Record<string, unknown>;
  const patterns = patternResult as Record<string, unknown>;

  const contextEntries = (context?.context ?? []) as Array<Record<string, unknown>>;
  const patternEntries = (patterns?.results ?? []) as Array<Record<string, unknown>>;

  // Extract affected files from context
  const affectedFiles = new Set<string>();
  for (const entry of contextEntries) {
    const filePath = entry?.file as string | undefined;
    if (filePath) affectedFiles.add(filePath);
  }

  // Detect codebase conventions
  const codebasePatterns: string[] = [];
  for (const p of patternEntries.slice(0, 3)) {
    if (p?.name && p?.type) {
      codebasePatterns.push(
        `${String(p.type)} "${String(p.name)}" at ${String(p.file)}:${String(p.line)}`
      );
    }
  }

  // Generate steps based on goal
  const steps = generateStepsForGoal(
    goal,
    target,
    contextEntries,
    Array.from(affectedFiles).slice(0, scope)
  );

  // Calculate risk score (0-1)
  const riskScore = calculateRiskScore(goal, contextEntries, affectedFiles.size);

  const plan: RefactorPlan = {
    target,
    goal,
    steps,
    affectedFiles: Array.from(affectedFiles).slice(0, scope),
    riskScore: Math.round(riskScore * 100) / 100,
    codebasePatterns,
    rollbackStrategy: `git stash or git revert. ${affectedFiles.size} file(s) would be modified.`,
    estimatedImpact: `${affectedFiles.size} files, ${contextEntries.length} symbols in blast radius`,
  };

  return plan;
}

function generateStepsForGoal(
  goal: string,
  target: string,
  contextEntries: Array<Record<string, unknown>>,
  affectedFiles: string[]
): RefactorStep[] {
  const steps: RefactorStep[] = [];
  let order = 1;

  switch (goal) {
    case 'extract_interface': {
      const targetFile = affectedFiles[0] ?? `${target}.ts`;
      steps.push(
        {
          order: order++,
          action: 'create',
          file: targetFile.replace(/\.ts$/, '.interface.ts'),
          description: `Extract public method signatures from ${target} into a new interface I${target}`,
          risk: 'low',
        },
        {
          order: order++,
          action: 'modify',
          file: targetFile,
          description: `Make ${target} implement I${target}. Update imports.`,
          risk: 'low',
        }
      );
      // Add steps for each consumer
      for (const file of affectedFiles.slice(1, 5)) {
        steps.push({
          order: order++,
          action: 'modify',
          file,
          description: `Update imports to reference I${target} instead of concrete class`,
          risk: 'medium',
        });
      }
      break;
    }

    case 'reduce_coupling': {
      steps.push({
        order: order++,
        action: 'analyze',
        file: affectedFiles[0] ?? target,
        description: `Identify tightly coupled dependencies in ${target}. Look for direct instantiation, circular imports, and shared mutable state.`,
        risk: 'low',
      });
      // Group by community to find cross-boundary dependencies
      const crossBoundaryFiles = affectedFiles.filter(
        (f) => !f.includes(path.dirname(affectedFiles[0] ?? ''))
      );
      if (crossBoundaryFiles.length > 0) {
        steps.push({
          order: order++,
          action: 'create',
          file: path.join(path.dirname(affectedFiles[0] ?? '.'), 'types.ts'),
          description: 'Create shared types/interfaces file to break circular dependencies',
          risk: 'low',
        });
      }
      for (const file of affectedFiles.slice(0, 5)) {
        steps.push({
          order: order++,
          action: 'modify',
          file,
          description: `Inject dependencies via constructor/parameters instead of direct import`,
          risk: 'medium',
        });
      }
      break;
    }

    case 'add_tests': {
      const testDir = affectedFiles[0]
        ? path.join(path.dirname(affectedFiles[0]), '__tests__')
        : '__tests__';
      steps.push(
        {
          order: order++,
          action: 'create',
          file: path.join(testDir, `${target}.test.ts`),
          description: `Create test file for ${target} covering public API surface`,
          risk: 'low',
        },
        {
          order: order++,
          action: 'create',
          file: path.join(testDir, `${target}.test.ts`),
          description: `Write tests for each public method. Prioritize methods with highest caller count.`,
          risk: 'low',
        }
      );
      // Add mock setup if there are many dependencies
      if (contextEntries.length > 3) {
        steps.push({
          order: order++,
          action: 'create',
          file: path.join(testDir, `__mocks__`, `${target}.mock.ts`),
          description: `Create mock/stub for ${target}'s dependencies (${contextEntries.length} symbols in context)`,
          risk: 'low',
        });
      }
      break;
    }

    case 'improve_docs': {
      for (const entry of contextEntries.slice(0, 5)) {
        steps.push({
          order: order++,
          action: 'modify',
          file: String(entry?.file ?? target),
          description: `Add JSDoc to ${String(entry?.name ?? target)}: @param, @returns, @example, @throws`,
          risk: 'low',
        });
      }
      steps.push({
        order: order++,
        action: 'create',
        file: path.join(path.dirname(affectedFiles[0] ?? '.'), 'README.md'),
        description: `Create or update module README with architecture overview and usage examples`,
        risk: 'low',
      });
      break;
    }

    case 'split_module': {
      const targetFile = affectedFiles[0] ?? target;
      const dir = path.dirname(targetFile);
      steps.push(
        {
          order: order++,
          action: 'analyze',
          file: targetFile,
          description: `Identify cohesive sub-groups within ${target} using community detection. Target: each sub-group becomes its own file.`,
          risk: 'low',
        },
        {
          order: order++,
          action: 'create',
          file: path.join(dir, 'index.ts'),
          description: 'Create barrel export file to maintain backward compatibility',
          risk: 'low',
        }
      );
      // Suggest up to 3 sub-modules based on context
      const uniqueTypes = new Set(contextEntries.map((e) => String(e?.type ?? '')).filter(Boolean));
      for (const symbolType of Array.from(uniqueTypes).slice(0, 3)) {
        steps.push({
          order: order++,
          action: 'create',
          file: path.join(dir, `${target}.${symbolType}s.ts`),
          description: `Extract all ${symbolType} symbols into dedicated file`,
          risk: 'medium',
        });
      }
      break;
    }

    case 'inline_module': {
      steps.push(
        {
          order: order++,
          action: 'modify',
          file: affectedFiles[0] ?? target,
          description: `Inline the contents of ${target} into its primary consumer`,
          risk: 'medium',
        },
        {
          order: order++,
          action: 'delete',
          file: affectedFiles[0] ?? target,
          description: `Remove the now-empty module file`,
          risk: 'high',
        }
      );
      for (const file of affectedFiles.slice(1, 5)) {
        steps.push({
          order: order++,
          action: 'modify',
          file,
          description: `Update imports from ${target} to point to the inlined location`,
          risk: 'medium',
        });
      }
      break;
    }

    case 'extract_function': {
      steps.push(
        {
          order: order++,
          action: 'analyze',
          file: affectedFiles[0] ?? target,
          description: `Identify repeated logic or long methods in ${target} suitable for extraction`,
          risk: 'low',
        },
        {
          order: order++,
          action: 'modify',
          file: affectedFiles[0] ?? target,
          description: `Extract identified logic into named helper function(s) with explicit parameters`,
          risk: 'medium',
        }
      );
      break;
    }

    default:
      steps.push({
        order: 1,
        action: 'analyze',
        file: affectedFiles[0] ?? target,
        description: `Analyze ${target} for ${goal} opportunities.`,
        risk: 'low',
      });
  }

  return steps;
}

function calculateRiskScore(
  goal: string,
  contextEntries: Array<Record<string, unknown>>,
  affectedFileCount: number
): number {
  // Base risk by goal type
  const goalRisk: Record<string, number> = {
    extract_interface: 0.2,
    reduce_coupling: 0.5,
    add_tests: 0.1,
    improve_docs: 0.05,
    split_module: 0.6,
    inline_module: 0.7,
    extract_function: 0.3,
  };
  const base = goalRisk[goal] ?? 0.3;

  // Scale by blast radius
  const blastFactor = Math.min(1, affectedFileCount / 20);

  // Scale by coupling density
  const callerCount = contextEntries.reduce((sum, e) => {
    const callers = e?.callers as unknown[] | undefined;
    return sum + (callers?.length ?? 0);
  }, 0);
  const couplingFactor = Math.min(1, callerCount / 50);

  return Math.min(1, base * 0.5 + blastFactor * 0.3 + couplingFactor * 0.2);
}

// =============================================================================
// CODE SCAFFOLD GENERATOR
// =============================================================================

interface ConventionProfile {
  indentation: string;
  semicolons: boolean;
  singleQuotes: boolean;
  trailingComma: boolean;
  hasJSDoc: boolean;
  importStyle: 'esm' | 'commonjs' | 'mixed';
  testFramework: string;
  fileNaming: 'camelCase' | 'PascalCase' | 'kebab-case' | 'snake_case';
}

async function handleScaffoldCode(args: Record<string, unknown>): Promise<unknown> {
  const scaffoldType = args.type as string;
  const name = args.name as string;
  const targetDir = args.targetDir as string;
  const context = args.context as string | undefined;
  const language = (args.language as string) ?? detectLanguageFromDir(targetDir);

  if (!scaffoldType || !name || !targetDir) {
    return { error: 'type, name, and targetDir are required.' };
  }

  // 1. Detect conventions from existing files in the target directory
  const conventions = detectConventions(targetDir);

  // 2. Optionally pull context from Graph RAG
  let symbolContext: Record<string, unknown> | null = null;
  if (context) {
    try {
      const { isGraphRAGReady, handleGraphRagTool } =
        await import('@holoscript/absorb-service/mcp');
      if (isGraphRAGReady()) {
        symbolContext = (await handleGraphRagTool('holo_semantic_search', {
          query: context,
          topK: 3,
        })) as Record<string, unknown>;
      }
    } catch {
      // Graph RAG not available — proceed without context
    }
  }

  // 3. Generate the scaffold
  const { content, filePath } = generateScaffold(
    scaffoldType,
    name,
    targetDir,
    language,
    conventions,
    symbolContext
  );

  return {
    filePath,
    content,
    language,
    conventions: {
      indentation: conventions.indentation === '  ' ? '2 spaces' : '4 spaces',
      semicolons: conventions.semicolons,
      quotes: conventions.singleQuotes ? 'single' : 'double',
      importStyle: conventions.importStyle,
      testFramework: conventions.testFramework,
    },
    hint: `Use holo_write_file to save this scaffold to ${filePath}`,
  };
}

function detectLanguageFromDir(dir: string): string {
  if (!fs.existsSync(dir)) return 'typescript';
  try {
    const files = fs.readdirSync(dir);
    if (files.some((f) => f.endsWith('.ts') || f.endsWith('.tsx'))) return 'typescript';
    if (files.some((f) => f.endsWith('.js') || f.endsWith('.jsx'))) return 'javascript';
    if (files.some((f) => f.endsWith('.holo') || f.endsWith('.hsplus'))) return 'holoscript';
  } catch {
    // Can't read directory
  }
  return 'typescript';
}

function detectConventions(dir: string): ConventionProfile {
  const defaults: ConventionProfile = {
    indentation: '  ',
    semicolons: true,
    singleQuotes: true,
    trailingComma: true,
    hasJSDoc: false,
    importStyle: 'esm',
    testFramework: 'vitest',
    fileNaming: 'PascalCase',
  };

  if (!fs.existsSync(dir)) return defaults;

  try {
    const files = fs
      .readdirSync(dir)
      .filter(
        (f) => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.tsx') || f.endsWith('.jsx')
      );

    if (files.length === 0) return defaults;

    // Sample up to 3 files for convention detection
    const sampleFiles = files.slice(0, 3);
    let tabCount = 0;
    let spaceCount = 0;
    let semiCount = 0;
    let noSemiCount = 0;
    let singleQuoteCount = 0;
    let doubleQuoteCount = 0;
    let jsdocCount = 0;
    let esmImportCount = 0;
    let cjsRequireCount = 0;

    for (const file of sampleFiles) {
      try {
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');
        const lines = content.split('\n');

        for (const line of lines.slice(0, 50)) {
          // Indentation
          if (line.startsWith('\t')) tabCount++;
          else if (line.startsWith('  ')) spaceCount++;

          // Semicolons
          if (line.trimEnd().endsWith(';')) semiCount++;
          else if (
            line.trim().length > 0 &&
            !line.trim().startsWith('//') &&
            !line.trim().startsWith('*')
          )
            noSemiCount++;

          // Quotes
          if (line.includes("'")) singleQuoteCount++;
          if (line.includes('"')) doubleQuoteCount++;

          // JSDoc
          if (line.includes('/**')) jsdocCount++;

          // Import style
          if (line.startsWith('import ')) esmImportCount++;
          if (line.includes('require(')) cjsRequireCount++;
        }
      } catch {
        // Skip unreadable files
      }
    }

    // File naming convention
    let fileNaming: ConventionProfile['fileNaming'] = 'PascalCase';
    if (files.some((f) => f.includes('-'))) fileNaming = 'kebab-case';
    else if (files.some((f) => f.includes('_'))) fileNaming = 'snake_case';
    else if (files.some((f) => /^[a-z]/.test(f))) fileNaming = 'camelCase';

    return {
      indentation: tabCount > spaceCount ? '\t' : '  ',
      semicolons: semiCount > noSemiCount,
      singleQuotes: singleQuoteCount > doubleQuoteCount,
      trailingComma: true, // hard to detect reliably
      hasJSDoc: jsdocCount > 0,
      importStyle: cjsRequireCount > esmImportCount ? 'commonjs' : 'esm',
      testFramework:
        fs.existsSync(path.join(dir, '..', 'vitest.config.ts')) ||
        fs.existsSync(path.join(dir, '..', '..', 'vitest.config.ts'))
          ? 'vitest'
          : 'jest',
      fileNaming,
    };
  } catch {
    return defaults;
  }
}

function generateScaffold(
  scaffoldType: string,
  name: string,
  targetDir: string,
  language: string,
  conventions: ConventionProfile,
  symbolContext: Record<string, unknown> | null
): { content: string; filePath: string } {
  const q = conventions.singleQuotes ? "'" : '"';
  const semi = conventions.semicolons ? ';' : '';
  const ind = conventions.indentation;

  // Extract context info for richer scaffolds
  const contextSymbols = ((symbolContext as Record<string, unknown>)?.results ?? []) as Array<
    Record<string, unknown>
  >;
  const contextHint: Record<string, unknown> | null =
    contextSymbols.length > 0 ? contextSymbols[0] : null;

  switch (scaffoldType) {
    case 'test': {
      const testFile =
        conventions.fileNaming === 'kebab-case'
          ? `${toKebabCase(name)}.test.ts`
          : `${name}.test.ts`;
      const filePath = path.join(targetDir, testFile);
      const framework = conventions.testFramework;
      const importLine =
        framework === 'vitest'
          ? `import { describe, it, expect, beforeEach } from ${q}vitest${q}${semi}`
          : '';
      const contextImport = contextHint
        ? `import { ${String(contextHint.name)} } from ${q}./${contextHint.file ? path.basename(String(contextHint.file), '.ts') : name}${q}${semi}`
        : `// import { ${name} } from ${q}./${name}${q}${semi}`;

      const content = [
        contextHint && conventions.hasJSDoc ? `/**\n * Tests for ${name}\n */` : '',
        importLine,
        contextImport,
        '',
        `describe(${q}${name}${q}, () => {`,
        `${ind}// TODO: Add setup`,
        '',
        `${ind}describe(${q}initialization${q}, () => {`,
        `${ind}${ind}it(${q}should create an instance${q}, () => {`,
        `${ind}${ind}${ind}// Arrange`,
        `${ind}${ind}${ind}// Act`,
        `${ind}${ind}${ind}// Assert`,
        `${ind}${ind}${ind}${semi}`,
        `${ind}${ind}})${semi}`,
        `${ind}})${semi}`,
        '',
        contextHint?.signature
          ? [
              `${ind}describe(${q}${contextHint.name}${q}, () => {`,
              `${ind}${ind}it(${q}should handle valid input${q}, () => {`,
              `${ind}${ind}${ind}// TODO: Test ${contextHint.signature}`,
              `${ind}${ind}${ind}${semi}`,
              `${ind}${ind}})${semi}`,
              '',
              `${ind}${ind}it(${q}should handle edge cases${q}, () => {`,
              `${ind}${ind}${ind}// TODO: Test edge cases`,
              `${ind}${ind}${ind}${semi}`,
              `${ind}${ind}})${semi}`,
              `${ind}})${semi}`,
            ].join('\n')
          : '',
        `})${semi}`,
        '',
      ]
        .filter(Boolean)
        .join('\n');

      return { content, filePath };
    }

    case 'interface': {
      const fileName =
        conventions.fileNaming === 'kebab-case'
          ? `${toKebabCase(name)}.interface.ts`
          : `${name}.interface.ts`;
      const filePath = path.join(targetDir, fileName);

      const methods: string[] = [];
      for (const sym of contextSymbols.slice(0, 5)) {
        if (sym?.signature) {
          methods.push(`${ind}${sym.signature}${semi}`);
        } else if (sym?.name) {
          methods.push(`${ind}${sym.name}(...args: unknown[]): unknown${semi}`);
        }
      }
      if (methods.length === 0) {
        methods.push(`${ind}// TODO: Define interface methods`);
      }

      const content = [
        conventions.hasJSDoc
          ? `/**\n * Interface for ${name}\n * @description Extracted from concrete implementation\n */`
          : '',
        `export interface I${name} {`,
        ...methods,
        `}`,
        '',
      ]
        .filter(Boolean)
        .join('\n');

      return { content, filePath };
    }

    case 'module': {
      const fileName =
        conventions.fileNaming === 'kebab-case' ? `${toKebabCase(name)}.ts` : `${name}.ts`;
      const filePath = path.join(targetDir, fileName);

      const content = [
        conventions.hasJSDoc ? `/**\n * ${name} Module\n *\n * @module ${name}\n */` : '',
        '',
        `// =============================================================================`,
        `// TYPES`,
        `// =============================================================================`,
        '',
        `export interface ${name}Options {`,
        `${ind}// TODO: Define options`,
        `}`,
        '',
        `// =============================================================================`,
        `// IMPLEMENTATION`,
        `// =============================================================================`,
        '',
        `export class ${name} {`,
        conventions.hasJSDoc ? `${ind}/** Create a new ${name} instance */` : '',
        `${ind}constructor(private readonly options: ${name}Options = {}) {}`,
        '',
        conventions.hasJSDoc ? `${ind}/** Initialize the module */` : '',
        `${ind}async initialize(): Promise<void> {`,
        `${ind}${ind}// TODO: Implementation`,
        `${ind}}`,
        '',
        conventions.hasJSDoc ? `${ind}/** Dispose resources */` : '',
        `${ind}async dispose(): Promise<void> {`,
        `${ind}${ind}// TODO: Cleanup`,
        `${ind}}`,
        `}`,
        '',
      ]
        .filter(Boolean)
        .join('\n');

      return { content, filePath };
    }

    case 'trait': {
      const fileName = `${name.toLowerCase()}.holo`;
      const filePath = path.join(targetDir, fileName);

      const content = [
        `// ${name} trait definition`,
        `// Generated by HoloScript CodeGen`,
        '',
        `trait @${name} {`,
        `  // Properties`,
        `  enabled: true`,
        '',
        `  // Lifecycle hooks`,
        `  on_init: {`,
        `    // TODO: Initialize trait state`,
        `  }`,
        '',
        `  on_update: {`,
        `    // TODO: Per-frame update logic`,
        `  }`,
        '',
        `  on_dispose: {`,
        `    // TODO: Cleanup`,
        `  }`,
        `}`,
        '',
      ].join('\n');

      return { content, filePath };
    }

    case 'component': {
      const fileName =
        conventions.fileNaming === 'kebab-case'
          ? `${toKebabCase(name)}.component.ts`
          : `${name}Component.ts`;
      const filePath = path.join(targetDir, fileName);

      const content = [
        conventions.hasJSDoc ? `/**\n * ${name} Component\n *\n * @component\n */` : '',
        '',
        `export interface ${name}Props {`,
        `${ind}// TODO: Define props`,
        `}`,
        '',
        `export class ${name}Component {`,
        `${ind}private readonly props: ${name}Props${semi}`,
        '',
        `${ind}constructor(props: ${name}Props) {`,
        `${ind}${ind}this.props = props${semi}`,
        `${ind}}`,
        '',
        conventions.hasJSDoc ? `${ind}/** Mount the component */` : '',
        `${ind}mount(): void {`,
        `${ind}${ind}// TODO: Component mount logic`,
        `${ind}}`,
        '',
        conventions.hasJSDoc ? `${ind}/** Unmount the component */` : '',
        `${ind}unmount(): void {`,
        `${ind}${ind}// TODO: Component teardown`,
        `${ind}}`,
        `}`,
        '',
      ]
        .filter(Boolean)
        .join('\n');

      return { content, filePath };
    }

    default:
      return {
        content: `// Unknown scaffold type: ${scaffoldType}\n`,
        filePath: path.join(targetDir, `${name}.ts`),
      };
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}
