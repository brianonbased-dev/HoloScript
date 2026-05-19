/**
 * Physics demo smoke receipt generator.
 *
 * Validates .holo physics demos, detects physics traits, attempts
 * compilation, and produces a machine-readable JSON receipt.
 *
 * Usage (internal):
 *   import { runPhysicsSmoke } from './smoke';
 *   const receipt = await runPhysicsSmoke({ files: ['demo.holo'], target: 'threejs', json: true });
 */

import * as fs from 'fs';
import * as path from 'path';

export interface SmokeOptions {
  files: string[];
  target?: string;
  output?: string;
  json: boolean;
  verbose: boolean;
}

export interface PhysicsTraitEntry {
  name: string;
  params?: Record<string, unknown>;
}

export interface DemoReceipt {
  file: string;
  title: string | null;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  physicsTraits: PhysicsTraitEntry[];
  validationErrors: Array<{ line?: number; column?: number; message: string }>;
  validationWarnings: Array<{ line?: number; column?: number; message: string }>;
  compileResult?: {
    target: string;
    success: boolean;
    error?: string;
  };
}

export interface PhysicsSmokeReceipt {
  schema_version: 'physics-smoke-receipt-v1';
  benchmark: 'physics-smoke';
  generatedAt: string;
  status: 'completed' | 'error' | 'unsupported';
  demos: DemoReceipt[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    physicsTraitCounts: Record<string, number>;
  };
  failures: Array<{ stage: string; message: string; timestamp: string }>;
  notes: string[];
}

const KNOWN_PHYSICS_TRAITS = new Set([
  'cloth',
  'fluid',
  'soft_body',
  'soft_body_pro',
  'rope',
  'chain',
  'wind',
  'buoyancy',
  'destruction',
  'physics',
  'collidable',
  'grabbable',
  'throwable',
  'holdable',
  'breakable',
  'granular_material',
  'fluid_simulation',
]);

interface CliParseError {
  message: string;
  line?: number;
  column?: number;
  code?: string;
  severity?: 'error' | 'warning' | 'info';
  loc?: { line?: number; column?: number };
}

type SmokeDiagnostic = { line?: number; column?: number; message: string };

function isFatalParserDiagnostic(err: CliParseError): boolean {
  return err.severity !== 'warning' && err.severity !== 'info';
}

function toSmokeDiagnostic(err: CliParseError, stage: string): SmokeDiagnostic {
  return {
    line: err.loc?.line ?? err.line,
    column: err.loc?.column ?? err.column,
    message: `[${stage}] ${err.message}`,
  };
}

function extractPhysicsTraits(astObjects: any[]): PhysicsTraitEntry[] {
  const traits: PhysicsTraitEntry[] = [];
  const seen = new Set<string>();

  for (const obj of astObjects || []) {
    const objTraits = obj.traits || obj.directives || [];
    for (const t of objTraits) {
      const name = typeof t === 'string' ? t : t.name || t.type;
      if (typeof name === 'string' && KNOWN_PHYSICS_TRAITS.has(name) && !seen.has(name)) {
        seen.add(name);
        traits.push({
          name,
          params: typeof t === 'object' && t.params ? t.params : undefined,
        });
      }
    }
  }

  return traits;
}

function extractTitle(ast: any): string | null {
  const meta = ast?.metadata || ast?.properties?.metadata;
  if (meta?.title) return String(meta.title);
  if (ast?.title) return String(ast.title);
  return null;
}

async function validateFile(
  filePath: string,
  verbose: boolean
): Promise<{
  success: boolean;
  errors: Array<{ line?: number; column?: number; message: string }>;
  warnings: Array<{ line?: number; column?: number; message: string }>;
  ast: any;
}> {
  const fs = await import('fs');
  const content = fs.readFileSync(filePath, 'utf-8');

  const { HoloCompositionParser } = await import('@holoscript/core');
  const parser = new HoloCompositionParser();
  const result = parser.parse(content);

  const errors: Array<{ line?: number; column?: number; message: string }> = [];
  const warnings: Array<{ line?: number; column?: number; message: string }> = [];

  for (const e of result.errors || []) {
    const err = e as CliParseError;
    const entry = toSmokeDiagnostic(err, 'parser');
    if (!isFatalParserDiagnostic(err)) {
      warnings.push(entry);
    } else {
      errors.push(entry);
    }
  }

  // Custom validation: warn on common physics-specific issues
  const lines = content.split('\n');
  const typos: Record<string, string> = {
    sper: 'sphere',
    'rotate.y': 'rotation.y',
    'rotate.x': 'rotation.x',
    'rotate.z': 'rotation.z',
  };
  lines.forEach((line, i) => {
    for (const [typo, fix] of Object.entries(typos)) {
      if (typo === 'box' && line.includes('skybox')) continue;
      if (line.includes(typo)) {
        warnings.push({
          line: i + 1,
          column: line.indexOf(typo),
          message: `Common typo: Did you mean '${fix}'?`,
        });
      }
    }
  });

  // Missing @grabbable warning
  const astObjects = result.ast?.objects || [];
  for (const node of astObjects) {
    const directives = node.traits || node.directives || [];
    const hasGrabHook = directives.some(
      (d: any) => d.hook === 'on_grab' || d.name === 'on_grab'
    );
    const hasGrabbableTrait = directives.some(
      (d: any) => d.type === 'trait' && d.name === 'grabbable'
    );
    if (hasGrabHook && !hasGrabbableTrait) {
      warnings.push({
        line: node.line || node.loc?.line || 0,
        column: node.column || node.loc?.column || 0,
        message: `Node has 'on_grab' hook but is missing '@grabbable' trait.`,
      });
    }
  }

  const hasObjects = (result.ast?.objects?.length || 0) > 0;
  return {
    success: hasObjects && errors.length === 0,
    errors,
    warnings,
    ast: result.ast,
  };
}

async function compileDemo(
  filePath: string,
  target: string,
  verbose: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const fs = await import('fs');
    const content = fs.readFileSync(filePath, 'utf-8');

    const { HoloCompositionParser } = await import('@holoscript/core');
    const parser = new HoloCompositionParser();
    const parseResult = parser.parse(content);
    const fatalDiagnostics = (parseResult.errors || [])
      .map((e: unknown) => e as CliParseError)
      .filter(isFatalParserDiagnostic);
    if (fatalDiagnostics.length > 0) {
      const summary = fatalDiagnostics
        .slice(0, 3)
        .map((err: CliParseError) => {
          const line = err.loc?.line ?? err.line;
          const column = err.loc?.column ?? err.column;
          const location = line ? `${line}:${column ?? 0}: ` : '';
          return `${location}${err.message}`;
        })
        .join('; ');
      return {
        success: false,
        error: `Parse diagnostics before compilation: ${summary}`,
      };
    }

    const hasObjects = (parseResult.ast?.objects?.length || 0) > 0;
    if (!hasObjects) {
      return { success: false, error: 'Parse failed before compilation (no objects)' };
    }

    // Only attempt compilation for targets we can reasonably validate
    const validTargets = [
      'threejs', 'unity', 'vrchat', 'babylon', 'aframe', 'webxr',
      'unreal', 'ios', 'android', 'godot', 'visionos', 'openxr',
      'androidxr', 'webgpu', 'web-2d',
    ];

    if (!validTargets.includes(target)) {
      return { success: false, error: `Unsupported smoke target: ${target}` };
    }

    // For smoke purposes, we just verify the AST can be mapped to the
    // target shape. Full codegen is not required for a smoke test.
    const ast = parseResult.ast;
    const objects = ast?.objects || [];

    if (objects.length === 0) {
      return { success: false, error: 'No objects found in composition' };
    }

    // Check for duplicate object names
    const names = new Set<string>();
    for (const obj of objects) {
      if (names.has(obj.name)) {
        return { success: false, error: `Duplicate object name: ${obj.name}` };
      }
      names.add(obj.name);
    }

    if (verbose) {
      console.log(`  [smoke] Compilation shape OK for ${target} (${objects.length} objects)`);
    }

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runPhysicsSmoke(options: SmokeOptions): Promise<PhysicsSmokeReceipt> {
  const startTime = Date.now();
  const receipt: PhysicsSmokeReceipt = {
    schema_version: 'physics-smoke-receipt-v1',
    benchmark: 'physics-smoke',
    generatedAt: new Date().toISOString(),
    status: 'completed',
    demos: [],
    summary: { total: 0, passed: 0, failed: 0, skipped: 0, physicsTraitCounts: {} },
    failures: [],
    notes: [],
  };

  function note(message: string) {
    receipt.notes.push(message);
  }

  function fail(stage: string, message: string) {
    receipt.status = 'error';
    receipt.failures.push({ stage, message, timestamp: new Date().toISOString() });
  }

  // Resolve all files
  const resolvedFiles: string[] = [];
  for (const f of options.files) {
    try {
      const stat = fs.statSync(f);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(f);
        for (const e of entries) {
          if (e.endsWith('.holo')) {
            resolvedFiles.push(path.join(f, e));
          }
        }
      } else {
        resolvedFiles.push(f);
      }
    } catch (err: unknown) {
      // File does not exist — let the per-demo loop handle it
      resolvedFiles.push(f);
    }
  }

  if (resolvedFiles.length === 0) {
    fail('file_resolution', 'No .holo files found in provided paths.');
    receipt.status = 'unsupported';
    return receipt;
  }

  receipt.summary.total = resolvedFiles.length;
  note(`Smoke-testing ${resolvedFiles.length} physics demo(s)`);

  const target = options.target || 'threejs';
  note(`Compilation target: ${target}`);

  for (const file of resolvedFiles) {
    const demoStart = Date.now();
    let demoStatus: DemoReceipt['status'] = 'skipped';
    let validationErrors: DemoReceipt['validationErrors'] = [];
    let validationWarnings: DemoReceipt['validationWarnings'] = [];
    let physicsTraits: PhysicsTraitEntry[] = [];
    let title: string | null = null;
    let compileResult: DemoReceipt['compileResult'] = undefined;

    try {
      if (!fs.existsSync(file)) {
        validationErrors.push({ message: `File not found: ${file}` });
        demoStatus = 'failed';
      } else {
        const validation = await validateFile(file, options.verbose);
        title = extractTitle(validation.ast);
        validationErrors = validation.errors;
        validationWarnings = validation.warnings;
        physicsTraits = extractPhysicsTraits(validation.ast?.objects || []);

        if (!validation.success) {
          demoStatus = 'failed';
        } else {
          // Compilation smoke test
          const compile = await compileDemo(file, target, options.verbose);
          compileResult = { target, success: compile.success, error: compile.error };

          if (compile.success) {
            demoStatus = 'passed';
          } else {
            demoStatus = 'failed';
          }
        }
      }
    } catch (err: unknown) {
      demoStatus = 'failed';
      validationErrors.push({
        message: err instanceof Error ? err.message : String(err),
      });
    }

    const demoReceipt: DemoReceipt = {
      file,
      title,
      status: demoStatus,
      durationMs: Date.now() - demoStart,
      physicsTraits,
      validationErrors,
      validationWarnings,
      compileResult,
    };

    receipt.demos.push(demoReceipt);

    // Update summary
    if (demoStatus === 'passed') receipt.summary.passed++;
    else if (demoStatus === 'failed') receipt.summary.failed++;
    else receipt.summary.skipped++;

    for (const t of physicsTraits) {
      receipt.summary.physicsTraitCounts[t.name] =
        (receipt.summary.physicsTraitCounts[t.name] || 0) + 1;
    }
  }

  // Finalize status
  if (receipt.summary.failed === 0 && receipt.summary.passed > 0) {
    receipt.status = 'completed';
  } else if (receipt.summary.passed === 0) {
    receipt.status = 'error';
  } else {
    receipt.status = 'completed';
    note('Some demos failed; see per-demo status.');
  }

  note(`Total time: ${Date.now() - startTime}ms`);

  // Write output if requested
  if (options.output) {
    const outDir = path.dirname(options.output);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    fs.writeFileSync(options.output, JSON.stringify(receipt, null, 2), 'utf-8');
  }

  return receipt;
}

export function printSmokeReceipt(receipt: PhysicsSmokeReceipt): void {
  console.log(`\n\x1b[36mPhysics Smoke Receipt\x1b[0m\n`);
  console.log(`  Schema:    ${receipt.schema_version}`);
  console.log(`  Status:    ${receipt.status}`);
  console.log(`  Demos:     ${receipt.summary.total}`);
  console.log(`  Passed:    ${receipt.summary.passed}`);
  console.log(`  Failed:    ${receipt.summary.failed}`);
  console.log(`  Skipped:   ${receipt.summary.skipped}`);
  console.log(`  Generated: ${receipt.generatedAt}`);

  if (Object.keys(receipt.summary.physicsTraitCounts).length > 0) {
    console.log(`\n  \x1b[33mPhysics traits found:\x1b[0m`);
    for (const [name, count] of Object.entries(receipt.summary.physicsTraitCounts)) {
      console.log(`    ${name}: ${count}`);
    }
  }

  console.log('');
  for (const demo of receipt.demos) {
    const icon = demo.status === 'passed' ? '\x1b[32m✓\x1b[0m' :
                 demo.status === 'failed' ? '\x1b[31m✗\x1b[0m' : '\x1b[33m-\x1b[0m';
    const title = demo.title ? ` — ${demo.title}` : '';
    console.log(`  ${icon} ${path.basename(demo.file)}${title} (${demo.durationMs}ms)`);
    if (demo.physicsTraits.length > 0) {
      console.log(`      traits: ${demo.physicsTraits.map((t) => t.name).join(', ')}`);
    }
    if (demo.validationErrors.length > 0) {
      for (const e of demo.validationErrors) {
        console.log(`      \x1b[31mError: ${e.message}\x1b[0m`);
      }
    }
    if (demo.validationWarnings.length > 0) {
      for (const w of demo.validationWarnings) {
        console.log(`      \x1b[33mWarning: ${w.message}\x1b[0m`);
      }
    }
    if (demo.compileResult && !demo.compileResult.success) {
      console.log(`      \x1b[31mCompile: ${demo.compileResult.error}\x1b[0m`);
    }
  }

  if (receipt.notes.length > 0) {
    console.log(`\n  \x1b[2mNotes:\x1b[0m`);
    for (const n of receipt.notes) {
      console.log(`    • ${n}`);
    }
  }

  console.log('');
}
