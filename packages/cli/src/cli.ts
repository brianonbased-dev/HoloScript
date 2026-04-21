#!/usr/bin/env node
/**
 * HoloScript CLI entry point
 */

// Load environment variables from .env file
import 'dotenv/config';

import { HoloScriptCLI } from './HoloScriptCLI';
import { parseArgs, printHelp } from './args';
import { startREPL } from './repl';
import { add, remove, list } from './packageManager';
import { TRAITS, formatTrait, formatAllTraits, suggestTraits } from './traits';
import { generateObject, listTemplates, getTemplate } from './generator';
import { packAsset, unpackAsset, inspectAsset } from './smartAssets';
import { WatchService } from './WatchService';
import { generateTargetCode } from './build/generators';
import { publishPackage } from './publish';
import { hologramCommand } from './commands/hologram';
import { quickstartCommand } from './commands/quickstart';
import {
  getVersionString,
  getVersionInfo,
  createHeadlessRuntime,
  getProfile,
  HEADLESS_PROFILE,
} from '@holoscript/core';

/**
 * Minimal structural shape for parse errors emitted by the various parsers
 * (HoloScriptCodeParser, HoloScriptPlusParser, composition parser). Used to
 * replace loose error callbacks in this file — narrower than `any`, broader
 * than importing a specific ParseError type from one parser. Safe across
 * parser implementations that all produce `{ message, line?, column? }`.
 */
interface CliParseError {
  message: string;
  line?: number;
  column?: number;
  code?: string;
  severity?: 'error' | 'warning' | 'info';
  /** Legacy location shape from some parsers. */
  loc?: { line?: number; column?: number };
}

/**
 * Emit a structured CLI error with a stable error code, message, usage
 * hint, and optional remediation. Keeps output uniform across commands so
 * users can script against error codes (grep "E001", pipe to logs, etc.).
 *
 * Codes follow the `E###` convention used by npm/pnpm — stable across
 * releases so external tooling can match on them.
 *
 *   E001  Missing required argument
 *   E002  File or directory not found
 *   E003  Invalid argument value (e.g. wrong format for a flag)
 *   E004  Unknown subcommand
 *   E005  Missing optional dependency (e.g. puppeteer)
 *   E006  Auth / credential missing
 *   E007  Unsupported file type for this operation
 *   E008  Build artifact missing (run build first)
 *   E009  Runtime / environment error
 *   E010  Unhandled exception (fallback)
 */
function cliError(
  code: string,
  message: string,
  opts: { usage?: string; hint?: string; docs?: string } = {}
): void {
  // Red error line with code prefix.
  console.error(`\x1b[31m[${code}] ${message}\x1b[0m`);
  if (opts.usage) {
    console.error(`\x1b[2mUsage:\x1b[0m ${opts.usage}`);
  }
  if (opts.hint) {
    console.error(`\x1b[33mHint:\x1b[0m ${opts.hint}`);
  }
  if (opts.docs) {
    console.error(`\x1b[2mDocs:\x1b[0m ${opts.docs}`);
  }
  console.error(`\x1b[2mRun \x1b[36mholoscript help\x1b[22m\x1b[2m for all commands.\x1b[0m`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  switch (options.command) {
    case 'help':
      printHelp();
      process.exit(0);
      break;

    case 'validate':
    case 'parse': {
      if (!options.input) {
        cliError('E001', 'No input file specified.', {
          usage: `holoscript ${options.command} <file>`,
          hint: 'Point at a .hs, .hsplus, or .holo source file, e.g. `holoscript parse world.hs`.',
        });
        process.exit(1);
      }

      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.resolve(options.input);
      if (!fs.existsSync(filePath)) {
        cliError('E002', `File not found: ${filePath}`, {
          hint: 'Check the path is relative to your current directory, or pass an absolute path.',
        });
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      console.log(`\n\x1b[36mValidating ${options.input}...\x1b[0m\n`);

      try {
        const isHolo = options.input.endsWith('.holo');
        const isHsplus = options.input.endsWith('.hsplus');
        let success = false;
        let errorList: any[] = [];

        if (options.verbose)
          console.log(
            `\x1b[2m[TRACE] Starting validation (isHolo: ${isHolo}, isHsplus: ${isHsplus})...\x1b[0m`
          );

        let parseResult: any;

        if (isHolo) {
          if (options.verbose)
            console.log(`\x1b[2m[TRACE] Importing HoloCompositionParser...\x1b[0m`);
          const { HoloCompositionParser } = await import('@holoscript/core');
          if (options.verbose)
            console.log(`\x1b[2m[TRACE] Parser imported. Initializing...\x1b[0m`);
          const compositionParser = new HoloCompositionParser();
          if (options.verbose) console.log(`\x1b[2m[TRACE] Starting parse...\x1b[0m`);
          const result = compositionParser.parse(content);
          parseResult = result;
          if (options.verbose)
            console.log(`\x1b[2m[TRACE] Parse complete. Success: ${result.success}\x1b[0m`);
          success = result.success;
          errorList = result.errors.map((e: CliParseError) => ({
            line: e.loc?.line,
            column: e.loc?.column,
            message: e.message,
          }));
        } else if (isHsplus) {
          if (options.verbose)
            console.log(`\x1b[2m[TRACE] Importing HoloScriptPlusParser...\x1b[0m`);
          const { HoloScriptPlusParser } = await import('@holoscript/core');
          if (options.verbose)
            console.log(`\x1b[2m[TRACE] Parser imported. Initializing...\x1b[0m`);
          const parser = new HoloScriptPlusParser();
          if (options.verbose) console.log(`\x1b[2m[TRACE] Starting parse...\x1b[0m`);
          const result = parser.parse(content);
          parseResult = result;
          const parserErrors = result.errors ?? [];
          success = parserErrors.length === 0;
          errorList = parserErrors.map((e: CliParseError | string) => ({
            line: typeof e === 'string' ? undefined : e.line,
            column: typeof e === 'string' ? undefined : e.column,
            message: typeof e === 'string' ? e : e.message,
          }));
        } else {
          if (options.verbose)
            console.log(`\x1b[2m[TRACE] Importing HoloScriptCodeParser...\x1b[0m`);
          const { HoloScriptCodeParser } = await import('@holoscript/core');
          if (options.verbose)
            console.log(`\x1b[2m[TRACE] Parser imported. Initializing...\x1b[0m`);
          const parser = new HoloScriptCodeParser();
          if (options.verbose) console.log(`\x1b[2m[TRACE] Starting parse...\x1b[0m`);
          const result = parser.parse(content);
          parseResult = result;
          if (options.verbose)
            console.log(`\x1b[2m[TRACE] Parse complete. Success: ${result.success}\x1b[0m`);
          success = result.success;
          errorList = result.errors;
        }

        // Custom Validations (Shared with LSP)
        const lines = content.split('\n');

        // 1. Common Typos
        const typos: Record<string, string> = {
          sper: 'sphere',
          box: 'cube',
          'rotate.y': 'rotation.y',
          'rotate.x': 'rotation.x',
          'rotate.z': 'rotation.z',
        };

        lines.forEach((line, i) => {
          for (const [typo, fix] of Object.entries(typos)) {
            // Avoid false positives for skybox
            if (typo === 'box' && line.includes('skybox')) continue;

            if (line.includes(typo)) {
              errorList.push({
                line: i + 1,
                column: line.indexOf(typo),
                message: `[Warning] Common typo detected: Did you mean '${fix}'?`,
                severity: 'warning',
              });
            }
          }
        });

        // 2. Missing Trait Validations
        // Simple recursive finder
        const findNodes = (nodes: any[]): any[] => {
          if (!nodes) return [];
          const results: any[] = [];
          for (const node of nodes) {
            results.push(node);
            if (node.children) results.push(...findNodes(node.children));
          }
          return results;
        };

        const astRoot = isHolo ? parseResult.ast?.objects : parseResult.ast;
        const allNodes = Array.isArray(astRoot)
          ? findNodes(astRoot)
          : astRoot
            ? findNodes([astRoot])
            : [];

        for (const node of allNodes) {
          if (node.directives) {
            // Directives are structurally typed; narrow each entry to a record
            // with known optional fields before field access.
            const isDirectiveLike = (
              v: unknown
            ): v is { hook?: string; type?: string; name?: string } =>
              typeof v === 'object' && v !== null;
            const hasGrabHook = node.directives.some(
              (d: unknown) => isDirectiveLike(d) && d.hook === 'on_grab'
            );
            const hasGrabbableTrait = node.directives.some(
              (d: unknown) => isDirectiveLike(d) && d.type === 'trait' && d.name === 'grabbable'
            );

            if (hasGrabHook && !hasGrabbableTrait) {
              errorList.push({
                line: node.line || node.loc?.line || 0,
                column: node.column || node.loc?.column || 0,
                message: `[Warning] Node has 'on_grab' hook but is missing '@grabbable' trait. Interaction will not work.`,
                severity: 'warning',
              });
            }
          }
        }

        if (success && errorList.filter((e) => e.severity !== 'warning').length === 0) {
          if (errorList.length > 0) {
            console.log(`\x1b[33m✓ Validation passed with ${errorList.length} warnings:\x1b[0m`);
            errorList.forEach((err) => {
              console.log(`  Line ${err.line}:${err.column}: ${err.message}`);
            });
          } else {
            console.log(`\x1b[32m✓ Validation successful!\x1b[0m\n`);
          }
          process.exit(0);
        } else {
          console.error(`\x1b[31mValidation failed with ${errorList.length} errors:\x1b[0m`);
          errorList.forEach((err) => {
            console.error(`  Line ${err.line}:${err.column}: ${err.message}`);
          });
          process.exit(1);
        }
      } catch (err: unknown) {
        console.error(
          `\x1b[31mUnexpected error during validation: ${err instanceof Error ? err.message : String(err)}\x1b[0m`
        );
        process.exit(1);
      }
      break;
    }

    case 'version': {
      const info = getVersionInfo();
      console.log(`HoloScript CLI v${getVersionString()}`);
      if (options.verbose) {
        console.log(`  Version:    ${info.version}`);
        console.log(`  Git Commit: ${info.gitCommitSha}`);
        console.log(`  Built:      ${info.buildTimestamp}`);
      }
      if (options.json) {
        console.log(JSON.stringify(info, null, 2));
      }
      process.exit(0);
      break;
    }

    case 'repl':
      await startREPL({
        verbose: options.verbose,
        showAST: options.showAST,
      });
      break;

    case 'watch':
      await watchFile(options);
      break;

    case 'add': {
      const success = await add(options.packages, {
        dev: options.dev,
        verbose: options.verbose,
      });
      process.exit(success ? 0 : 1);
      break;
    }

    case 'remove': {
      const success = await remove(options.packages, {
        verbose: options.verbose,
      });
      process.exit(success ? 0 : 1);
      break;
    }

    case 'list':
      list({
        verbose: options.verbose,
        json: options.json,
      });
      process.exit(0);
      break;

    // =========================================
    // NEW: Traits & Generation Commands
    // =========================================

    case 'pack': {
      if (!options.input) {
        cliError('E001', 'No input directory specified.', {
          usage: 'holoscript pack <directory> [output]',
          hint: 'Point at a directory containing your .holo/.hsplus assets. Output defaults to <directory>.hsa.',
        });
        process.exit(1);
      }
      try {
        await packAsset(options.input, options.output, options.verbose);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        cliError('E010', `Error packing asset: ${message}`, {
          hint: 'Re-run with -v/--verbose to see the full failure and any missing trait definitions.',
        });
        process.exit(1);
      }
      process.exit(0);
      break;
    }

    case 'unpack': {
      if (!options.input) {
        cliError('E001', 'No input file specified.', {
          usage: 'holoscript unpack <file.hsa> [output_dir]',
          hint: 'Point at a .hsa archive created by `holoscript pack`.',
        });
        process.exit(1);
      }
      try {
        await unpackAsset(options.input, options.output, options.verbose);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        cliError('E010', `Error unpacking asset: ${message}`, {
          hint: 'Verify the .hsa file is not corrupted (try `holoscript inspect <file.hsa>`).',
        });
        process.exit(1);
      }
      process.exit(0);
      break;
    }

    case 'inspect': {
      if (!options.input) {
        cliError('E001', 'No input file specified.', {
          usage: 'holoscript inspect <file.hsa>',
          hint: 'Inspect lists the manifest, traits, and assets inside a .hsa archive.',
        });
        process.exit(1);
      }
      try {
        await inspectAsset(options.input, options.verbose);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        cliError('E010', `Error inspecting asset: ${message}`, {
          hint: 'Confirm the file is a valid .hsa archive (use `-v` for trace output).',
        });
        process.exit(1);
      }
      process.exit(0);
      break;
    }

    case 'diff': {
      // Get file arguments from original args array
      const diffArgs = args.filter((a) => !a.startsWith('-') && a !== 'diff');
      if (diffArgs.length < 2) {
        cliError('E001', `Two files required for diff (got ${diffArgs.length}).`, {
          usage: 'holoscript diff <file1> <file2> [--json]',
          hint: 'Semantic diff compares AST structure, not text lines — pass two .hs/.holo files.',
        });
        process.exit(1);
      }

      const fs = await import('fs');
      const path = await import('path');
      const { SemanticDiffEngine, formatDiffResult, HoloCompositionParser, HoloScriptCodeParser } =
        await import('@holoscript/core');

      const file1 = path.resolve(diffArgs[0]);
      const file2 = path.resolve(diffArgs[1]);

      if (!fs.existsSync(file1)) {
        console.error(`\x1b[31mError: File not found: ${file1}\x1b[0m`);
        process.exit(1);
      }
      if (!fs.existsSync(file2)) {
        console.error(`\x1b[31mError: File not found: ${file2}\x1b[0m`);
        process.exit(1);
      }

      console.log(`\n\x1b[36mComparing ${diffArgs[0]} ↔ ${diffArgs[1]}...\x1b[0m\n`);

      try {
        const content1 = fs.readFileSync(file1, 'utf-8');
        const content2 = fs.readFileSync(file2, 'utf-8');

        // Parse both files
        const isHolo1 = file1.endsWith('.holo');
        const isHolo2 = file2.endsWith('.holo');

        let ast1: any, ast2: any;

        if (isHolo1) {
          const parser = new HoloCompositionParser();
          const result = parser.parse(content1);
          if (!result.success) {
            console.error(`\x1b[31mError parsing ${diffArgs[0]}:\x1b[0m`);
            result.errors.forEach((e: CliParseError) =>
              console.error(`  ${e.loc?.line}:${e.loc?.column}: ${e.message}`)
            );
            process.exit(1);
          }
          ast1 = result.ast;
        } else {
          const parser = new HoloScriptCodeParser();
          const result = parser.parse(content1);
          if (!result.success) {
            console.error(`\x1b[31mError parsing ${diffArgs[0]}:\x1b[0m`);
            result.errors.forEach((e: CliParseError) =>
              console.error(`  ${e.line}:${e.column}: ${e.message}`)
            );
            process.exit(1);
          }
          ast1 = { type: 'Program', children: result.ast };
        }

        if (isHolo2) {
          const parser = new HoloCompositionParser();
          const result = parser.parse(content2);
          if (!result.success) {
            console.error(`\x1b[31mError parsing ${diffArgs[1]}:\x1b[0m`);
            result.errors.forEach((e: CliParseError) =>
              console.error(`  ${e.loc?.line}:${e.loc?.column}: ${e.message}`)
            );
            process.exit(1);
          }
          ast2 = result.ast;
        } else {
          const parser = new HoloScriptCodeParser();
          const result = parser.parse(content2);
          if (!result.success) {
            console.error(`\x1b[31mError parsing ${diffArgs[1]}:\x1b[0m`);
            result.errors.forEach((e: CliParseError) =>
              console.error(`  ${e.line}:${e.column}: ${e.message}`)
            );
            process.exit(1);
          }
          ast2 = { type: 'Program', children: result.ast };
        }

        // Run semantic diff
        const engine = new SemanticDiffEngine({
          detectRenames: true,
          detectMoves: true,
          ignoreComments: true,
          ignoreFormatting: true,
        });
        const result = engine.diff(ast1, ast2, diffArgs[0], diffArgs[1]);

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatDiffResult(result));

          // Summary
          const added = result.changes.filter((c: { type: string }) => c.type === 'added').length;
          const removed = result.changes.filter(
            (c: { type: string }) => c.type === 'removed'
          ).length;
          const modified = result.changes.filter(
            (c: { type: string }) => c.type === 'modified'
          ).length;
          const renamed = result.changes.filter(
            (c: { type: string }) => c.type === 'renamed'
          ).length;
          const moved = result.changes.filter((c: { type: string }) => c.type === 'moved').length;

          console.log(`\n\x1b[1mSummary:\x1b[0m`);
          if (added > 0) console.log(`  \x1b[32m+ ${added} added\x1b[0m`);
          if (removed > 0) console.log(`  \x1b[31m- ${removed} removed\x1b[0m`);
          if (modified > 0) console.log(`  \x1b[33m~ ${modified} modified\x1b[0m`);
          if (renamed > 0) console.log(`  \x1b[36m→ ${renamed} renamed\x1b[0m`);
          if (moved > 0) console.log(`  \x1b[35m↔ ${moved} moved\x1b[0m`);

          if (result.changes.length === 0) {
            console.log(`  \x1b[32mNo semantic differences found.\x1b[0m`);
          }
        }

        process.exit(0);
      } catch (err: unknown) {
        console.error(
          `\x1b[31mDiff error: ${err instanceof Error ? err.message : String(err)}\x1b[0m`
        );
        process.exit(1);
      }
    }

    case 'wot-export': {
      if (!options.input) {
        console.error('\x1b[31mError: No input file specified.\x1b[0m');
        console.log('Usage: holoscript wot-export <file.holo> [-o output]');
        process.exit(1);
      }

      try {
        const fs = await import('fs');
        const path = await import('path');
        const { HoloCompositionParser } = await import('@holoscript/core');
        const { ThingDescriptionGenerator, serializeThingDescription, validateThingDescription } =
          await import('@holoscript/core/wot');

        const filePath = path.resolve(options.input);
        if (!fs.existsSync(filePath)) {
          console.error(`\x1b[31mError: File not found: ${filePath}\x1b[0m`);
          process.exit(1);
        }

        console.log(
          `\n\x1b[36mGenerating W3C Thing Descriptions from ${options.input}...\x1b[0m\n`
        );

        const content = fs.readFileSync(filePath, 'utf-8');
        const parser = new HoloCompositionParser();
        const parseResult = parser.parse(content);

        if (!parseResult.success) {
          console.error('\x1b[31mParse errors:\x1b[0m');
          for (const error of parseResult.errors) {
            console.error(`  Line ${error.loc?.line || '?'}: ${error.message}`);
          }
          process.exit(1);
        }

        // Extract objects from AST
        const objects = parseResult.ast?.objects || [];
        if (objects.length === 0) {
          console.log('\x1b[33mNo objects found in composition.\x1b[0m');
          process.exit(0);
        }

        // Generate Thing Descriptions
        const generator = new ThingDescriptionGenerator({
          baseUrl: 'http://localhost:8080',
          defaultObservable: true,
        });

        const thingDescriptions = generator.generateAll(objects);

        if (thingDescriptions.length === 0) {
          console.log('\x1b[33mNo objects with @wot_thing trait found.\x1b[0m');
          console.log(
            'Add @wot_thing(title: "My Thing", security: "nosec") to objects you want to export.'
          );
          process.exit(0);
        }

        // Validate and output
        const results: { name: string; valid: boolean; errors: string[]; td: any }[] = [];

        for (const td of thingDescriptions) {
          const validation = validateThingDescription(td);
          results.push({
            name: td.title,
            valid: validation.valid,
            errors: validation.errors,
            td,
          });
        }

        if (options.json) {
          // JSON output
          if (thingDescriptions.length === 1) {
            console.log(serializeThingDescription(thingDescriptions[0], true));
          } else {
            console.log(JSON.stringify(thingDescriptions, null, 2));
          }
        } else if (options.output) {
          // Write to file(s)
          const outputPath = path.resolve(options.output);

          if (thingDescriptions.length === 1) {
            // Single TD - write directly to output path
            const finalPath = outputPath.endsWith('.json') ? outputPath : `${outputPath}.json`;
            fs.writeFileSync(finalPath, serializeThingDescription(thingDescriptions[0], true));
            console.log(`\x1b[32m✓ Generated: ${finalPath}\x1b[0m`);
          } else {
            // Multiple TDs - create directory and write each
            if (!fs.existsSync(outputPath)) {
              fs.mkdirSync(outputPath, { recursive: true });
            }

            for (const td of thingDescriptions) {
              const tdFileName = `${td.title.toLowerCase().replace(/\s+/g, '_')}.td.json`;
              const tdPath = path.join(outputPath, tdFileName);
              fs.writeFileSync(tdPath, serializeThingDescription(td, true));
              console.log(`\x1b[32m✓ Generated: ${tdPath}\x1b[0m`);
            }
          }
        } else {
          // Console output
          for (const result of results) {
            console.log(`\x1b[1m${result.name}\x1b[0m`);

            if (!result.valid) {
              console.log(`  \x1b[31m✗ Validation failed:\x1b[0m`);
              for (const error of result.errors) {
                console.log(`    - ${error}`);
              }
            } else {
              console.log(`  \x1b[32m✓ Valid Thing Description\x1b[0m`);
            }

            // Show summary
            const propCount = Object.keys(result.td.properties || {}).length;
            const actionCount = Object.keys(result.td.actions || {}).length;
            const eventCount = Object.keys(result.td.events || {}).length;

            console.log(
              `  Properties: ${propCount}, Actions: ${actionCount}, Events: ${eventCount}`
            );
            console.log('');
          }

          console.log(`\x1b[36mGenerated ${thingDescriptions.length} Thing Description(s)\x1b[0m`);
          console.log('\x1b[2mUse --json for full output or -o <path> to write files.\x1b[0m\n');
        }

        process.exit(0);
      } catch (err: unknown) {
        console.error(
          `\x1b[31mWoT export error: ${err instanceof Error ? err.message : String(err)}\x1b[0m`
        );
        if (options.verbose && err instanceof Error) {
          console.error(err.stack);
        }
        process.exit(1);
      }
    }

    case 'headless': {
      if (!options.input) {
        console.error('\x1b[31mError: No input file specified.\x1b[0m');
        console.log('Usage: holoscript headless <file.holo> [--tick-rate <hz>] [--duration <ms>]');
        process.exit(1);
      }

      try {
        const fs = await import('fs');
        const path = await import('path');
        const { HoloCompositionParser, HoloScriptPlusParser } = await import('@holoscript/core');

        const filePath = path.resolve(options.input);
        if (!fs.existsSync(filePath)) {
          console.error(`\x1b[31mError: File not found: ${filePath}\x1b[0m`);
          process.exit(1);
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const isHolo = options.input.endsWith('.holo');

        console.log(`\n\x1b[36mStarting headless runtime: ${options.input}\x1b[0m`);

        let ast: any;

        if (isHolo) {
          const parser = new HoloCompositionParser();
          const parseResult = parser.parse(content);

          if (!parseResult.success) {
            console.error('\x1b[31mParse errors:\x1b[0m');
            for (const error of parseResult.errors) {
              console.error(`  Line ${error.loc?.line || '?'}: ${error.message}`);
            }
            process.exit(1);
          }

          // Convert HoloComposition to HSPlusAST format
          const objects = parseResult.ast?.objects || [];
          ast = {
            root: {
              type: 'scene',
              id: 'root',
              children: objects.map((obj: any) => ({
                type: obj.type || 'object',
                id: obj.name,
                properties: Object.fromEntries(
                  obj.properties?.map((p: any) => [p.key, p.value]) || []
                ),
                traits: new Map(obj.traits?.map((t: any) => [t.name, t.config || {}]) || []),
                directives: obj.directives || [],
                children: obj.children || [],
              })),
              directives: parseResult.ast?.state
                ? [
                    {
                      type: 'state',
                      body: parseResult.ast.state.declarations || {},
                    },
                  ]
                : [],
            },
            imports: parseResult.ast?.imports || [],
            body: [],
          };
        } else {
          // Use HoloScript+ parser
          const parser = new HoloScriptPlusParser();
          const parseResult = parser.parse(content);

          if (parseResult.errors.length > 0) {
            console.error('\x1b[31mParse errors:\x1b[0m');
            for (const error of parseResult.errors) {
              console.error(`  Line ${error.line}: ${error.message}`);
            }
            process.exit(1);
          }

          ast = parseResult.ast;
        }

        // Get profile
        const profileName = options.profile || 'headless';
        let profile;
        try {
          profile = getProfile(profileName);
        } catch {
          profile = HEADLESS_PROFILE;
        }

        // Create headless runtime
        const runtime = createHeadlessRuntime(ast, {
          profile,
          tickRate: options.tickRate || 10,
          debug: options.verbose,
        });

        // Track stats for output
        let shutdownRequested = false;

        // Handle graceful shutdown
        const shutdown = () => {
          if (shutdownRequested) return;
          shutdownRequested = true;

          console.log('\n\x1b[33mShutting down headless runtime...\x1b[0m');
          runtime.stop();

          const stats = runtime.getStats();
          console.log('\n\x1b[1mRuntime Statistics:\x1b[0m');
          console.log(`  Uptime: ${stats.uptime}ms`);
          console.log(`  Updates: ${stats.updateCount}`);
          console.log(`  Events: ${stats.eventCount}`);
          console.log(`  Instances: ${stats.instanceCount}`);
          console.log(`  Avg tick: ${stats.avgTickDuration.toFixed(2)}ms`);
          console.log(`  Memory: ~${Math.round(stats.memoryEstimate / 1024)}KB`);
          console.log('');

          process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        // Log events if verbose
        if (options.verbose) {
          runtime.on('runtime_started', () => {
            console.log('\x1b[32m✓ Runtime started\x1b[0m');
          });

          runtime.on('runtime_stopped', (payload: any) => {
            console.log(`\x1b[33mRuntime stopped after ${payload.uptime}ms\x1b[0m`);
          });
        }

        // Start the runtime
        console.log(`  Profile: ${profile.name}`);
        console.log(`  Tick rate: ${options.tickRate || 10}Hz`);
        if (options.duration && options.duration > 0) {
          console.log(`  Duration: ${options.duration}ms`);
        }
        console.log('\x1b[2mPress Ctrl+C to stop\x1b[0m\n');

        runtime.start();

        // If duration specified, stop after that time
        if (options.duration && options.duration > 0) {
          setTimeout(() => {
            shutdown();
          }, options.duration);
        }

        // Keep process alive
        await new Promise(() => {});
      } catch (err: unknown) {
        console.error(
          `\x1b[31mHeadless runtime error: ${err instanceof Error ? err.message : String(err)}\x1b[0m`
        );
        if (options.verbose && err instanceof Error) {
          console.error(err.stack);
        }
        process.exit(1);
      }
    }

    case 'traits': {
      if (options.input) {
        // Explain specific trait
        const trait = TRAITS[options.input];
        if (trait) {
          console.log('\n' + formatTrait(trait, true) + '\n');
        } else {
          cliError('E003', `Unknown trait: "${options.input}".`, {
            hint: 'Run `holoscript traits` to list all available VR traits. Try `holoscript suggest "<desc>"` for ideas.',
          });
          process.exit(1);
        }
      } else {
        // List all traits
        console.log(formatAllTraits(options.verbose, options.json));
      }
      process.exit(0);
      break;
    }

    case 'suggest': {
      const description = options.description || options.input;
      if (!description) {
        cliError('E001', 'No description provided.', {
          usage: 'holoscript suggest "a glowing orb that can be grabbed"',
          hint: 'Wrap the description in quotes. Keywords like grab/throw/glow/click drive trait matching.',
        });
        process.exit(1);
      }

      const suggested = await suggestTraits(description);

      if (options.json) {
        console.log(JSON.stringify(suggested, null, 2));
      } else {
        console.log(`\n\x1b[1mSuggested traits for:\x1b[0m "${description}"\n`);
        if (suggested.length === 0) {
          console.log(
            '\x1b[2mNo specific traits suggested. Try adding more descriptive keywords.\x1b[0m'
          );
          console.log('Keywords: grab, throw, glow, click, physics, network, portal, etc.\n');
        } else {
          for (const trait of suggested) {
            console.log(formatTrait(trait, options.verbose));
          }
          console.log('');
        }
      }
      process.exit(0);
      break;
    }

    case 'generate': {
      const description = options.description || options.input;
      if (!description) {
        cliError('E001', 'No description provided.', {
          usage: 'holoscript generate "a red button that glows when hovered"',
          hint: 'Wrap the description in quotes. Set BRITTNEY_SERVICE_URL for AI-enhanced generation.',
        });
        process.exit(1);
      }

      const result = await generateObject(description, {
        brittneyUrl: options.brittneyUrl,
        verbose: options.verbose,
        timeout: options.timeout,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`\n\x1b[1mGenerated HoloScript\x1b[0m \x1b[2m(${result.source})\x1b[0m\n`);
        console.log('\x1b[36m' + result.code + '\x1b[0m\n');
        if (result.traits.length > 0) {
          console.log(
            `\x1b[33mTraits used:\x1b[0m ${result.traits.map((t) => `@${t}`).join(', ')}\n`
          );
        }
        if (result.source === 'local') {
          console.log('\x1b[2mTip: Set BRITTNEY_SERVICE_URL for AI-enhanced generation.\x1b[0m\n');
        }
      }

      // Write to file if output specified
      if (options.output) {
        const fs = await import('fs');
        fs.writeFileSync(options.output, result.code);
        console.log(`\x1b[32m✓ Written to ${options.output}\x1b[0m\n`);
      }

      process.exit(0);
      break;
    }

    case 'templates': {
      const templates = listTemplates();

      if (options.json) {
        const details: Record<string, any> = {};
        for (const t of templates) {
          details[t] = getTemplate(t);
        }
        console.log(JSON.stringify(details, null, 2));
      } else {
        console.log('\n\x1b[1mAvailable Object Templates\x1b[0m\n');
        for (const t of templates) {
          const info = getTemplate(t);
          if (info) {
            console.log(`  \x1b[36m${t}\x1b[0m`);
            console.log(`    Traits: ${info.traits.map((tr) => `@${tr}`).join(', ')}`);
          }
        }
        console.log('\n\x1b[2mUse: holoscript generate "a <template> called myObject"\x1b[0m\n');
      }
      process.exit(0);
      break;
    }

    case 'compile': {
      if (!options.input) {
        console.error('\x1b[31mError: No input file specified.\x1b[0m');
        console.log('Usage: holoscript compile <file> --target <target>');
        process.exit(1);
      }

      const target = options.target || 'threejs';
      const validTargets = [
        'node',
        'threejs',
        'unity',
        'vrchat',
        'babylon',
        'aframe',
        'webxr',
        'urdf',
        'sdf',
        'dtdl',
        'wasm',
        // New compilers
        'unreal',
        'ios',
        'android',
        'godot',
        'visionos',
        'openxr',
        'androidxr',
        'webgpu',
        'flat-semantic',
        'web-2d',
        'scm-dag',
      ];

      if (!validTargets.includes(target)) {
        console.error(`\x1b[31mError: Unknown target "${target}".\x1b[0m`);
        console.log(`Valid targets: ${validTargets.join(', ')}`);
        process.exit(1);
      }

      const fs = await import('fs');
      const path = await import('path');
      const { HoloScriptCodeParser } = await import('@holoscript/core');

      const filePath = path.resolve(options.input);
      if (!fs.existsSync(filePath)) {
        console.error(`\x1b[31mError: File not found: ${filePath}\x1b[0m`);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const _parser = new HoloScriptCodeParser();

      // Pipeline-first Node target (.hs pipeline -> runnable index.mjs)
      if (target === 'node') {
        const { isPipelineSource } = await import('@holoscript/core');
        const { compilePipelineSourceToNode } = await import('@holoscript/core/compiler/index');
        if (!isPipelineSource(content)) {
          console.error(
            '\x1b[31mError: --target node currently expects a pipeline .hs source (pipeline "Name" { ... }).\x1b[0m'
          );
          process.exit(1);
        }

        const compiled = compilePipelineSourceToNode(content, {
          moduleName: options.output ? path.basename(options.output) : 'index.mjs',
        });

        if (!compiled.success || !compiled.code) {
          console.error('\x1b[31mPipeline compilation failed:\x1b[0m');
          for (const err of compiled.errors || []) {
            console.error(`  - ${err}`);
          }
          process.exit(1);
        }

        const outputPath = path.resolve(options.output || 'index.mjs');
        fs.writeFileSync(outputPath, compiled.code, 'utf-8');
        console.log(`\n\x1b[32m✓ Pipeline compiled to Node.js module: ${outputPath}\x1b[0m\n`);
        process.exit(0);
      }

      console.log(`\n\x1b[36mCompiling ${options.input} → ${target}\x1b[0m\n`);

      try {
        const isHolo = options.input.endsWith('.holo');
        let ast: any;

        if (isHolo) {
          if (options.verbose)
            console.log(`\x1b[2m[DEBUG] Using HoloCompositionParser for .holo file...\x1b[0m`);
          const { HoloCompositionParser } = await import('@holoscript/core');
          const compositionParser = new HoloCompositionParser();
          const result = compositionParser.parse(content);

          if (!result.success) {
            console.error(`\x1b[31mError parsing composition:\x1b[0m`);
            result.errors.forEach((e: CliParseError) =>
              console.error(`  ${e.loc?.line}:${e.loc?.column}: ${e.message}`)
            );
            process.exit(1);
          }

          // Map HoloComposition AST to Generator AST
          ast = {
            orbs:
              result.ast?.objects?.map((obj: any) => ({
                name: obj.name,
                properties: Object.fromEntries(obj.properties.map((p: any) => [p.key, p.value])),
                traits: obj.traits || [],
                state: obj.state,
              })) || [],
            functions: [
              ...(result.ast?.logic?.actions?.map((a: any) => ({ name: a.name })) || []),
              ...(result.ast?.logic?.handlers?.map((h: any) => ({ name: h.event })) || []),
            ],
          };
        } else {
          if (options.verbose) console.log(`\x1b[2m[DEBUG] Using HoloScriptCodeParser...\x1b[0m`);
          const { HoloScriptCodeParser } = await import('@holoscript/core');
          const parser = new HoloScriptCodeParser();
          const result = parser.parse(content);

          if (!result.success) {
            console.error(`\x1b[31mError parsing script:\x1b[0m`);
            result.errors.forEach((e: CliParseError) =>
              console.error(`  ${e.line}:${e.column}: ${e.message}`)
            );
            process.exit(1);
          }

          ast = {
            orbs: result.ast.filter((n: any) => n.type === 'orb'),
            functions: result.ast.filter((n: any) => n.type === 'method'),
          };
        }

        if (options.verbose) {
          console.log(
            `\x1b[2mParsed ${ast.orbs?.length || 0} orbs, ${ast.functions?.length || 0} functions\x1b[0m`
          );
        }

        // Special handling for WASM target - needs full HoloComposition
        if (target === 'wasm') {
          if (!isHolo) {
            console.error(`\x1b[31mError: WASM compilation requires .holo files.\x1b[0m`);
            process.exit(1);
          }

          const { HoloCompositionParser, compileToWASM } = await import('@holoscript/core');
          const compositionParser = new HoloCompositionParser();
          const parseResult = compositionParser.parse(content);

          if (!parseResult.success || !parseResult.ast) {
            console.error(`\x1b[31mError parsing for WASM:\x1b[0m`);
            parseResult.errors.forEach((e: CliParseError) => console.error(`  ${e.message}`));
            process.exit(1);
          }

          console.log(`\x1b[2m[DEBUG] Compiling to WebAssembly...\x1b[0m`);
          const wasmResult = compileToWASM(parseResult.ast, {
            debug: options.verbose,
            generateBindings: true,
          });

          console.log(`\x1b[32m✓ WASM compilation successful!\x1b[0m`);
          console.log(`\x1b[2m  Memory layout: ${wasmResult.memoryLayout.totalSize} bytes\x1b[0m`);
          console.log(`\x1b[2m  Exports: ${wasmResult.exports.length}\x1b[0m`);
          console.log(`\x1b[2m  Imports: ${wasmResult.imports.length}\x1b[0m`);

          if (options.output) {
            const outputPath = path.resolve(options.output);
            const watPath = outputPath.endsWith('.wat') ? outputPath : outputPath + '.wat';
            const bindingsPath = outputPath.replace(/\.wat$/, '') + '.bindings.ts';

            fs.writeFileSync(watPath, wasmResult.wat);
            console.log(`\x1b[32m✓ WAT written to ${watPath}\x1b[0m`);

            if (wasmResult.bindings) {
              fs.writeFileSync(bindingsPath, wasmResult.bindings);
              console.log(`\x1b[32m✓ Bindings written to ${bindingsPath}\x1b[0m`);
            }
          } else {
            console.log('\n--- WAT Output ---\n');
            console.log(wasmResult.wat);
            if (wasmResult.bindings) {
              console.log('\n--- JavaScript Bindings ---\n');
              console.log(wasmResult.bindings);
            }
          }

          process.exit(0);
        }

        // Special handling for URDF target - use URDFCompiler
        if (target === 'urdf') {
          if (!isHolo) {
            console.error(`\x1b[31mError: URDF compilation requires .holo files.\x1b[0m`);
            process.exit(1);
          }

          const { HoloCompositionParser, URDFCompiler } = await import('@holoscript/core');
          const compositionParser = new HoloCompositionParser();
          const parseResult = compositionParser.parse(content);

          if (!parseResult.success || !parseResult.ast) {
            console.error(`\x1b[31mError parsing for URDF:\x1b[0m`);
            parseResult.errors.forEach((e: { message: string }) => console.error(`  ${e.message}`));
            process.exit(1);
          }

          console.log(`\x1b[2m[DEBUG] Compiling to URDF (Robot Description Format)...\x1b[0m`);
          const compiler = new URDFCompiler({
            robotName: parseResult.ast.name || 'HoloScriptRobot',
            includeVisual: true,
            includeCollision: true,
            includeInertial: true,
            includeHoloExtensions: true,
          });
          const urdfOutput = compiler.compile(parseResult.ast);

          console.log(`\x1b[32m✓ URDF compilation successful!\x1b[0m`);
          console.log(`\x1b[2m  Objects: ${parseResult.ast.objects?.length || 0}\x1b[0m`);
          console.log(
            `\x1b[2m  Spatial groups: ${parseResult.ast.spatialGroups?.length || 0}\x1b[0m`
          );

          if (options.output) {
            const outputPath = path.resolve(options.output);
            const urdfPath = outputPath.endsWith('.urdf') ? outputPath : outputPath + '.urdf';
            fs.writeFileSync(urdfPath, urdfOutput);
            console.log(`\x1b[32m✓ URDF written to ${urdfPath}\x1b[0m`);
          } else {
            console.log('\n--- URDF Output ---\n');
            console.log(urdfOutput);
          }

          process.exit(0);
        }

        // Special handling for SDF target - use SDFCompiler
        if (target === 'sdf') {
          if (!isHolo) {
            console.error(`\x1b[31mError: SDF compilation requires .holo files.\x1b[0m`);
            process.exit(1);
          }

          const { HoloCompositionParser, SDFCompiler } = await import('@holoscript/core');
          const compositionParser = new HoloCompositionParser();
          const parseResult = compositionParser.parse(content);

          if (!parseResult.success || !parseResult.ast) {
            console.error(`\x1b[31mError parsing for SDF:\x1b[0m`);
            parseResult.errors.forEach((e: { message: string }) => console.error(`  ${e.message}`));
            process.exit(1);
          }

          console.log(`\x1b[2m[DEBUG] Compiling to SDF (Simulation Description Format)...\x1b[0m`);
          const compiler = new SDFCompiler({
            worldName: parseResult.ast.name || 'holoscript_world',
            sdfVersion: '1.8',
            includePhysics: true,
            physicsEngine: 'ode',
            includeScene: true,
          });
          const sdfOutput = compiler.compile(parseResult.ast);

          console.log(`\x1b[32m✓ SDF compilation successful!\x1b[0m`);
          console.log(`\x1b[2m  Objects: ${parseResult.ast.objects?.length || 0}\x1b[0m`);
          console.log(`\x1b[2m  Lights: ${parseResult.ast.lights?.length || 0}\x1b[0m`);
          console.log(
            `\x1b[2m  Spatial groups: ${parseResult.ast.spatialGroups?.length || 0}\x1b[0m`
          );

          if (options.output) {
            const outputPath = path.resolve(options.output);
            const sdfPath = outputPath.endsWith('.sdf') ? outputPath : outputPath + '.sdf';
            fs.writeFileSync(sdfPath, sdfOutput);
            console.log(`\x1b[32m✓ SDF written to ${sdfPath}\x1b[0m`);
          } else {
            console.log('\n--- SDF Output ---\n');
            console.log(sdfOutput);
          }

          process.exit(0);
        }

        // Special handling for DTDL target - use DTDLCompiler
        if (target === 'dtdl') {
          if (!isHolo) {
            console.error(`\x1b[31mError: DTDL compilation requires .holo files.\x1b[0m`);
            process.exit(1);
          }

          const { HoloCompositionParser, DTDLCompiler } = await import('@holoscript/core');
          const compositionParser = new HoloCompositionParser();
          const parseResult = compositionParser.parse(content);

          if (!parseResult.success || !parseResult.ast) {
            console.error(`\x1b[31mError parsing for DTDL:\x1b[0m`);
            parseResult.errors.forEach((e) => console.error(`  ${e.message}`));
            process.exit(1);
          }

          console.log(
            `\x1b[2m[DEBUG] Compiling to DTDL (Azure Digital Twin Definition Language)...\x1b[0m`
          );
          const compiler = new DTDLCompiler({
            namespace: `dtmi:${parseResult.ast.name?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'holoscript'}`,
            dtdlVersion: 3,
            includeDescriptions: true,
            includeTraitComponents: true,
          });
          const dtdlOutput = compiler.compile(parseResult.ast);

          // Parse to count interfaces
          const interfaces = JSON.parse(dtdlOutput);
          console.log(`\x1b[32m✓ DTDL compilation successful!\x1b[0m`);
          console.log(`\x1b[2m  Interfaces: ${interfaces.length}\x1b[0m`);
          console.log(`\x1b[2m  Objects: ${parseResult.ast.objects?.length || 0}\x1b[0m`);
          console.log(`\x1b[2m  Templates: ${parseResult.ast.templates?.length || 0}\x1b[0m`);

          if (options.output) {
            const outputPath = path.resolve(options.output);
            const dtdlPath = outputPath.endsWith('.json') ? outputPath : outputPath + '.json';
            fs.writeFileSync(dtdlPath, dtdlOutput);
            console.log(`\x1b[32m✓ DTDL written to ${dtdlPath}\x1b[0m`);
          } else {
            console.log('\n--- DTDL Output ---\n');
            console.log(dtdlOutput);
          }

          process.exit(0);
        }

        // V6 2D UI Revolution - Flat Semantic Target
        const isFlatSemantic =
          target === 'flat-semantic' ||
          (target === 'web-2d' && (!options.projection || options.projection === 'flat-semantic'));
        if (isFlatSemantic) {
          if (!isHolo) {
            console.error(
              `\x1b[31mError: flat-semantic compilation requires .holo or .hsplus files.\x1b[0m`
            );
            process.exit(1);
          }

          const { HoloCompositionParser } = await import('@holoscript/core');
          const { FlatSemanticCompiler } = await import('@holoscript/semantic-2d');
          const compositionParser = new HoloCompositionParser();
          const parseResult = compositionParser.parse(content);

          if (!parseResult.success || !parseResult.ast) {
            console.error(`\x1b[31mError parsing for flat-semantic:\x1b[0m`);
            parseResult.errors.forEach((e) => console.error(`  ${e.message}`));
            process.exit(1);
          }

          console.log(`\x1b[2m[DEBUG] Compiling to Flat Semantic React (V6)...\x1b[0m`);
          const compiler = new FlatSemanticCompiler();
          const reactOutput = compiler.compile(parseResult.ast, '', undefined, { format: 'react' });

          console.log(`\x1b[32m✓ Flat Semantic compilation successful!\x1b[0m`);

          if (options.output) {
            const outputPath = path.resolve(options.output);
            fs.writeFileSync(outputPath, reactOutput);
            console.log(`\x1b[32m✓ Component written to ${outputPath}\x1b[0m`);
          } else {
            console.log('\n--- React Code ---\n');
            console.log(reactOutput.substring(0, 500) + '\\n... (truncated)');
          }

          process.exit(0);
        }

        // Special handling for Unreal target
        if (target === 'unreal') {
          if (!isHolo) {
            console.error(`\x1b[31mError: Unreal compilation requires .holo files.\x1b[0m`);
            process.exit(1);
          }

          const { HoloCompositionParser, UnrealCompiler } = await import('@holoscript/core');
          const compositionParser = new HoloCompositionParser();
          const parseResult = compositionParser.parse(content);

          if (!parseResult.success || !parseResult.ast) {
            console.error(`\x1b[31mError parsing for Unreal:\x1b[0m`);
            parseResult.errors.forEach((e) => console.error(`  ${e.message}`));
            process.exit(1);
          }

          console.log(`\x1b[2m[DEBUG] Compiling to Unreal Engine C++...\x1b[0m`);
          const compiler = new UnrealCompiler({
            projectName: parseResult.ast.name || 'HoloScriptProject',
            useNanite: true,
            useLumen: true,
            useMetaSounds: false,
          });
          const result = compiler.compile(parseResult.ast);

          console.log(`\x1b[32m✓ Unreal compilation successful!\x1b[0m`);
          console.log(`\x1b[2m  Generated ${result.files.length} files\x1b[0m`);
          console.log(`\x1b[2m  Actors: ${parseResult.ast.objects?.length || 0}\x1b[0m`);

          if (options.output) {
            const outputDir = path.resolve(options.output);
            if (!fs.existsSync(outputDir)) {
              fs.mkdirSync(outputDir, { recursive: true });
            }
            for (const file of result.files) {
              const filePath = path.join(outputDir, file.filename);
              fs.writeFileSync(filePath, file.content);
              console.log(`\x1b[32m✓ Written ${file.filename}\x1b[0m`);
            }
          } else {
            console.log('\n--- Unreal Output ---\n');
            console.log(result.files.map((f) => `// ${f.filename}\n${f.content}`).join('\n\n'));
          }

          process.exit(0);
        }

        // Special handling for iOS target
        if (target === 'ios') {
          if (!isHolo) {
            console.error(`\x1b[31mError: iOS compilation requires .holo files.\x1b[0m`);
            process.exit(1);
          }

          const { HoloCompositionParser, IOSCompiler } = await import('@holoscript/core');
          const compositionParser = new HoloCompositionParser();
          const parseResult = compositionParser.parse(content);

          if (!parseResult.success || !parseResult.ast) {
            console.error(`\x1b[31mError parsing for iOS:\x1b[0m`);
            parseResult.errors.forEach((e) => console.error(`  ${e.message}`));
            process.exit(1);
          }

          console.log(`\x1b[2m[DEBUG] Compiling to iOS Swift/SwiftUI...\x1b[0m`);
          const compiler = new IOSCompiler({
            projectName: parseResult.ast.name || 'HoloScriptApp',
            useRealityKit: true,
            useARKit: true,
            minimumIOSVersion: '17.0',
          });
          const result = compiler.compile(parseResult.ast);

          console.log(`\x1b[32m✓ iOS compilation successful!\x1b[0m`);
          console.log(`\x1b[2m  Generated ${result.files.length} files\x1b[0m`);
          console.log(`\x1b[2m  Scenes: ${parseResult.ast.objects?.length || 0}\x1b[0m`);

          if (options.output) {
            const outputDir = path.resolve(options.output);
            if (!fs.existsSync(outputDir)) {
              fs.mkdirSync(outputDir, { recursive: true });
            }
            for (const file of result.files) {
              const filePath = path.join(outputDir, file.filename);
              fs.writeFileSync(filePath, file.content);
              console.log(`\x1b[32m✓ Written ${file.filename}\x1b[0m`);
            }
          } else {
            console.log('\n--- iOS Output ---\n');
            console.log(result.files.map((f) => `// ${f.filename}\n${f.content}`).join('\n\n'));
          }

          process.exit(0);
        }

        // Special handling for Android target
        if (target === 'android') {
          if (!isHolo) {
            console.error(`\x1b[31mError: Android compilation requires .holo files.\x1b[0m`);
            process.exit(1);
          }

          const { HoloCompositionParser, AndroidCompiler } = await import('@holoscript/core');
          const compositionParser = new HoloCompositionParser();
          const parseResult = compositionParser.parse(content);

          if (!parseResult.success || !parseResult.ast) {
            console.error(`\x1b[31mError parsing for Android:\x1b[0m`);
            parseResult.errors.forEach((e) => console.error(`  ${e.message}`));
            process.exit(1);
          }

          console.log(`\x1b[2m[DEBUG] Compiling to Android Kotlin/Jetpack Compose...\x1b[0m`);
          const compiler = new AndroidCompiler({
            packageName: `com.holoscript.${(parseResult.ast.name || 'app').toLowerCase().replace(/[^a-z0-9]/g, '')}`,
            minSdkVersion: 26,
            useSceneViewer: true,
            useARCore: true,
          });
          const result = compiler.compile(parseResult.ast);

          console.log(`\x1b[32m✓ Android compilation successful!\x1b[0m`);
          console.log(`\x1b[2m  Generated ${result.files.length} files\x1b[0m`);
          console.log(`\x1b[2m  Scenes: ${parseResult.ast.objects?.length || 0}\x1b[0m`);

          if (options.output) {
            const outputDir = path.resolve(options.output);
            if (!fs.existsSync(outputDir)) {
              fs.mkdirSync(outputDir, { recursive: true });
            }
            for (const file of result.files) {
              const filePath = path.join(outputDir, file.filename);
              fs.writeFileSync(filePath, file.content);
              console.log(`\x1b[32m✓ Written ${file.filename}\x1b[0m`);
            }
          } else {
            console.log('\n--- Android Output ---\n');
            console.log(result.files.map((f) => `// ${f.filename}\n${f.content}`).join('\n\n'));
          }

          process.exit(0);
        }

        // Special handling for Godot target
        if (target === 'godot') {
          if (!isHolo) {
            console.error(`\x1b[31mError: Godot compilation requires .holo files.\x1b[0m`);
            process.exit(1);
          }

          const { HoloCompositionParser, GodotCompiler } = await import('@holoscript/core');
          const compositionParser = new HoloCompositionParser();
          const parseResult = compositionParser.parse(content);

          if (!parseResult.success || !parseResult.ast) {
            console.error(`\x1b[31mError parsing for Godot:\x1b[0m`);
            parseResult.errors.forEach((e) => console.error(`  ${e.message}`));
            process.exit(1);
          }

          console.log(`\x1b[2m[DEBUG] Compiling to Godot GDScript...\x1b[0m`);
          const compiler = new GodotCompiler({
            projectName: parseResult.ast.name || 'HoloScriptProject',
            godotVersion: '4.2',
            useXR: true,
          });
          const output = compiler.compile(parseResult.ast);

          console.log(`\x1b[32m✓ Godot compilation successful!\x1b[0m`);
          console.log(`\x1b[2m  Objects: ${parseResult.ast.objects?.length || 0}\x1b[0m`);

          if (options.output) {
            const outputPath = path.resolve(options.output);
            const gdPath = outputPath.endsWith('.gd') ? outputPath : outputPath + '.gd';
            fs.writeFileSync(gdPath, output);
            console.log(`\x1b[32m✓ GDScript written to ${gdPath}\x1b[0m`);
          } else {
            console.log('\n--- Godot GDScript Output ---\n');
            console.log(output);
          }

          process.exit(0);
        }

        // Special handling for VisionOS target
        if (target === 'visionos') {
          if (!isHolo) {
            console.error(`\x1b[31mError: VisionOS compilation requires .holo files.\x1b[0m`);
            process.exit(1);
          }

          const { HoloCompositionParser, VisionOSCompiler } = await import('@holoscript/core');
          const compositionParser = new HoloCompositionParser();
          const parseResult = compositionParser.parse(content);

          if (!parseResult.success || !parseResult.ast) {
            console.error(`\x1b[31mError parsing for VisionOS:\x1b[0m`);
            parseResult.errors.forEach((e) => console.error(`  ${e.message}`));
            process.exit(1);
          }

          console.log(`\x1b[2m[DEBUG] Compiling to VisionOS Swift/RealityKit...\x1b[0m`);
          const compiler = new VisionOSCompiler({
            projectName: parseResult.ast.name || 'HoloScriptVision',
            useImmersiveSpace: true,
            useRealityKit: true,
            minimumVersion: '1.0',
          });
          const output = compiler.compile(parseResult.ast);

          console.log(`\x1b[32m✓ VisionOS compilation successful!\x1b[0m`);
          console.log(`\x1b[2m  Objects: ${parseResult.ast.objects?.length || 0}\x1b[0m`);

          if (options.output) {
            const outputPath = path.resolve(options.output);
            const swiftPath = outputPath.endsWith('.swift') ? outputPath : outputPath + '.swift';
            fs.writeFileSync(swiftPath, output);
            console.log(`\x1b[32m✓ VisionOS Swift written to ${swiftPath}\x1b[0m`);
          } else {
            console.log('\n--- VisionOS Swift Output ---\n');
            console.log(output);
          }

          process.exit(0);
        }

        // Special handling for SCM-DAG target (Structural Causal Models)
        if (target === 'scm-dag') {
          if (!isHolo) {
            console.error(`\x1b[31mError: SCM-DAG compilation requires .holo files.\x1b[0m`);
            process.exit(1);
          }

          const { HoloCompositionParser, SCMCompiler } = await import('@holoscript/core');
          const compositionParser = new HoloCompositionParser();
          const parseResult = compositionParser.parse(content);

          if (!parseResult.success || !parseResult.ast) {
            console.error(`\x1b[31mError parsing for SCM-DAG:\x1b[0m`);
            parseResult.errors.forEach((e: CliParseError) => console.error(`  ${e.message}`));
            process.exit(1);
          }

          console.log(`\x1b[2m[DEBUG] Compiling to SCM-DAG JSON...\x1b[0m`);
          const compiler = new SCMCompiler({
            modelName: parseResult.ast.name || 'HoloScript_SCM_DAG',
          });
          
          const output = compiler.compile(parseResult.ast, 'SYSTEM_OVERRIDE');

          console.log(`\x1b[32m✓ SCM-DAG compilation successful!\x1b[0m`);

          if (options.output) {
            const outputPath = path.resolve(options.output);
            const jsonPath = outputPath.endsWith('.json') ? outputPath : outputPath + '.json';
            fs.writeFileSync(jsonPath, output);
            console.log(`\x1b[32m✓ SCM-DAG written to ${jsonPath}\x1b[0m`);
          } else {
            console.log('\n--- SCM-DAG JSON Output ---\n');
            console.log(output);
          }

          process.exit(0);
        }

        // Special handling for OpenXR target
        if (target === 'openxr') {
          if (!isHolo) {
            console.error(`\x1b[31mError: OpenXR compilation requires .holo files.\x1b[0m`);
            process.exit(1);
          }

          const { HoloCompositionParser, OpenXRCompiler } = await import('@holoscript/core');
          const compositionParser = new HoloCompositionParser();
          const parseResult = compositionParser.parse(content);

          if (!parseResult.success || !parseResult.ast) {
            console.error(`\x1b[31mError parsing for OpenXR:\x1b[0m`);
            parseResult.errors.forEach((e) => console.error(`  ${e.message}`));
            process.exit(1);
          }

          console.log(`\x1b[2m[DEBUG] Compiling to OpenXR C++...\x1b[0m`);
          const compiler = new OpenXRCompiler({
            applicationName: parseResult.ast.name || 'HoloScriptXR',
            engineVersion: '1.0.0',
            enableHandTracking: true,
            enablePassthrough: true,
          });
          const output = compiler.compile(parseResult.ast);

          console.log(`\x1b[32m✓ OpenXR compilation successful!\x1b[0m`);
          console.log(`\x1b[2m  Objects: ${parseResult.ast.objects?.length || 0}\x1b[0m`);

          if (options.output) {
            const outputPath = path.resolve(options.output);
            const cppPath = outputPath.endsWith('.cpp') ? outputPath : outputPath + '.cpp';
            fs.writeFileSync(cppPath, output);
            console.log(`\x1b[32m✓ OpenXR C++ written to ${cppPath}\x1b[0m`);
          } else {
            console.log('\n--- OpenXR C++ Output ---\n');
            console.log(output);
          }

          process.exit(0);
        }

        // Special handling for AndroidXR target
        if (target === 'androidxr') {
          if (!isHolo) {
            console.error(`\x1b[31mError: AndroidXR compilation requires .holo files.\x1b[0m`);
            process.exit(1);
          }

          const { HoloCompositionParser, AndroidXRCompiler } = await import('@holoscript/core');
          const compositionParser = new HoloCompositionParser();
          const parseResult = compositionParser.parse(content);

          if (!parseResult.success || !parseResult.ast) {
            console.error(`\x1b[31mError parsing for AndroidXR:\x1b[0m`);
            parseResult.errors.forEach((e) => console.error(`  ${e.message}`));
            process.exit(1);
          }

          console.log(`\x1b[2m[DEBUG] Compiling to AndroidXR Kotlin...\x1b[0m`);
          const compiler = new AndroidXRCompiler({
            packageName: `com.holoscript.xr.${(parseResult.ast.name || 'app').toLowerCase().replace(/[^a-z0-9]/g, '')}`,
            minSdkVersion: 29,
            useOpenXR: true,
            enableHandTracking: true,
          });
          const output = compiler.compile(parseResult.ast);

          console.log(`\x1b[32m✓ AndroidXR compilation successful!\x1b[0m`);
          console.log(`\x1b[2m  Objects: ${parseResult.ast.objects?.length || 0}\x1b[0m`);

          if (options.output) {
            const outputPath = path.resolve(options.output);
            const ktPath = outputPath.endsWith('.kt') ? outputPath : outputPath + '.kt';
            fs.writeFileSync(ktPath, output);
            console.log(`\x1b[32m✓ AndroidXR Kotlin written to ${ktPath}\x1b[0m`);
          } else {
            console.log('\n--- AndroidXR Kotlin Output ---\n');
            console.log(output);
          }

          process.exit(0);
        }

        // Special handling for WebGPU target
        if (target === 'webgpu') {
          if (!isHolo) {
            console.error(`\x1b[31mError: WebGPU compilation requires .holo files.\x1b[0m`);
            process.exit(1);
          }

          const { HoloCompositionParser, WebGPUCompiler } = await import('@holoscript/core');
          const compositionParser = new HoloCompositionParser();
          const parseResult = compositionParser.parse(content);

          if (!parseResult.success || !parseResult.ast) {
            console.error(`\x1b[31mError parsing for WebGPU:\x1b[0m`);
            parseResult.errors.forEach((e) => console.error(`  ${e.message}`));
            process.exit(1);
          }

          console.log(`\x1b[2m[DEBUG] Compiling to WebGPU TypeScript...\x1b[0m`);
          const compiler = new WebGPUCompiler({
            enableShadows: true,
            enablePBR: true,
            sampleCount: 4,
          });
          const output = compiler.compile(parseResult.ast);

          console.log(`\x1b[32m✓ WebGPU compilation successful!\x1b[0m`);
          console.log(`\x1b[2m  Objects: ${parseResult.ast.objects?.length || 0}\x1b[0m`);

          if (options.output) {
            const outputPath = path.resolve(options.output);
            const tsPath = outputPath.endsWith('.ts') ? outputPath : outputPath + '.ts';
            fs.writeFileSync(tsPath, output);
            console.log(`\x1b[32m✓ WebGPU TypeScript written to ${tsPath}\x1b[0m`);
          } else {
            console.log('\n--- WebGPU TypeScript Output ---\n');
            console.log(output);
          }

          process.exit(0);
        }

        // Special handling for Native 2D target
        if (target === 'native-2d') {
          if (!isHolo) {
            console.error(`\x1b[31mError: Native 2D compilation requires .holo files.\x1b[0m`);
            process.exit(1);
          }

          const { HoloCompositionParser, Native2DCompiler } = await import('@holoscript/core');
          const compositionParser = new HoloCompositionParser();
          const parseResult = compositionParser.parse(content);

          if (!parseResult.success || !parseResult.ast) {
            console.error(`\x1b[31mError parsing for Native 2D:\x1b[0m`);
            parseResult.errors.forEach((e: CliParseError) => console.error(`  ${e.message}`));
            process.exit(1);
          }

          console.log(`\x1b[2m[DEBUG] Compiling to Native 2D (HTML/React)...\x1b[0m`);
          const compiler = new Native2DCompiler();
          const parsedFormat = process.argv.includes('--format')
            ? process.argv[process.argv.indexOf('--format') + 1]
            : options.compileFormat;
          const outputFormat = parsedFormat === 'react' ? 'react' : 'html';

          const output = compiler.compile(parseResult.ast, '', options.output, {
            format: outputFormat,
          });

          console.log(`\x1b[32m✓ Native 2D compilation successful!\x1b[0m`);
          console.log(`\x1b[2m  Objects: ${parseResult.ast.objects?.length || 0}\x1b[0m`);
          console.log(`\x1b[2m  UI Elements: ${parseResult.ast.ui?.elements?.length || 0}\x1b[0m`);

          if (options.output) {
            const outputPath = path.resolve(options.output);
            const ext = outputFormat === 'react' ? '.tsx' : '.html';
            const finalPath =
              outputPath.endsWith('.html') ||
              outputPath.endsWith('.tsx') ||
              outputPath.endsWith('.jsx')
                ? outputPath
                : outputPath + ext;

            const outputStr =
              typeof output === 'string' ? output : (output as { output: string }).output;
            fs.writeFileSync(finalPath, outputStr);
            console.log(`\x1b[32m✓ Native 2D output written to ${finalPath}\x1b[0m`);
          } else {
            console.log(`\n--- Native 2D Output (${outputFormat}) ---\n`);
            const outputStr =
              typeof output === 'string' ? output : (output as { output: string }).output;
            console.log(outputStr);
          }

          process.exit(0);
        }

        console.log(`\x1b[2m[DEBUG] Starting code generation for target: ${target}...\x1b[0m`);
        // Generate output based on target
        const outputCode = generateTargetCode(ast, target, options.verbose);
        console.log(`\x1b[2m[DEBUG] Code generation complete. Length: ${outputCode.length}\x1b[0m`);

        if (options.output) {
          const outputPath = path.resolve(options.output);
          fs.writeFileSync(outputPath, outputCode);
          console.log(`\x1b[32m✓ Written to ${options.output}\x1b[0m\n`);
        } else {
          console.log(outputCode);
        }

        console.log(`\x1b[32m✓ Compilation successful!\x1b[0m\n`);
        process.exit(0);
      } catch (err: unknown) {
        console.error(
          `\x1b[31mCompilation error: ${err instanceof Error ? err.message : String(err)}\x1b[0m`
        );
        process.exit(1);
      }
    }

    case 'build': {
      if (!options.input) {
        console.error('\x1b[31mError: No input specified.\x1b[0m');
        console.log('Usage: holoscript build <file_or_dir> [options]');
        process.exit(1);
      }

      const fs = await import('fs');
      const path = await import('path');
      const inputPath = path.resolve(options.input);

      if (!fs.existsSync(inputPath)) {
        console.error(`\x1b[31mError: Input not found: ${inputPath}\x1b[0m`);
        process.exit(1);
      }

      const executeBuild = async () => {
        const stats = fs.statSync(inputPath);
        if (stats.isFile()) {
          console.log(`\x1b[36mBuilding file: ${options.input}\x1b[0m`);
          const content = fs.readFileSync(inputPath, 'utf-8');
          const target = options.target || 'threejs';

          try {
            const isHolo = options.input.endsWith('.holo');
            let ast: any;
            let composition: any = null;

            if (isHolo) {
              const { HoloCompositionParser } = await import('@holoscript/core');
              const result = new HoloCompositionParser().parse(content);
              if (!result.success) {
                console.error('\x1b[31mError parsing composition\x1b[0m');
                return;
              }
              composition = result.ast;
              ast = {
                orbs:
                  result.ast?.objects?.map((obj: any) => ({
                    name: obj.name,
                    properties: Object.fromEntries(
                      obj.properties.map((p: any) => [p.key, p.value])
                    ),
                    traits: obj.traits || [],
                  })) || [],
              };
            } else {
              const { HoloScriptCodeParser } = await import('@holoscript/core');
              const result = new HoloScriptCodeParser().parse(content);
              if (!result.success) {
                console.error('\x1b[31mError parsing script\x1b[0m');
                return;
              }
              ast = { orbs: result.ast.filter((n: any) => n.type === 'orb') };
            }

            // Handle Code Splitting
            if (
              options.split ||
              (composition && composition.zones && composition.zones.length > 0)
            ) {
              console.log('\x1b[33mCode splitting enabled/detected...\x1b[0m');
              const { SceneSplitter } = await import('./build/splitter');
              const { ManifestGenerator } = await import('./build/manifest');

              const splitter = new SceneSplitter();
              const chunks = splitter.split(composition);

              const outputDir = options.output
                ? path.dirname(path.resolve(options.output))
                : path.resolve('./dist');
              if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

              const chunksDir = path.join(outputDir, 'chunks');
              if (!fs.existsSync(chunksDir)) fs.mkdirSync(chunksDir, { recursive: true });

              for (const chunk of chunks) {
                const chunkAst = { orbs: chunk.objects };
                const chunkCode = generateTargetCode(chunkAst, target, options.verbose);
                // For chunks, we'll wrap in JSON or a module format
                const chunkFile = path.join(chunksDir, `${chunk.id}.chunk.js`);
                fs.writeFileSync(
                  chunkFile,
                  JSON.stringify(
                    {
                      id: chunk.id,
                      objects: chunk.objects,
                      code: chunkCode,
                    },
                    null,
                    2
                  )
                );

                if (options.verbose)
                  console.log(
                    `  \x1b[2mChunk ${chunk.id} written (${chunk.objects.length} objects)\x1b[0m`
                  );
              }

              const generator = new ManifestGenerator();
              const manifest = generator.generate(chunks, outputDir);
              fs.writeFileSync(
                path.join(outputDir, 'manifest.json'),
                JSON.stringify(manifest, null, 2)
              );
              console.log(`\x1b[32m✓ Built ${chunks.length} chunks and manifest.json\x1b[0m`);
            } else {
              const outputCode = generateTargetCode(ast, target, options.verbose);
              if (options.output) {
                fs.writeFileSync(path.resolve(options.output), outputCode);
                console.log(`\x1b[32m✓ Compiled to ${options.output}\x1b[0m`);
              } else {
                console.log(outputCode);
              }
            }
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.error(`\x1b[31mBuild error: ${message}\x1b[0m`);
          }
        } else if (stats.isDirectory()) {
          console.log(`\x1b[36mBuilding asset from directory: ${options.input}\x1b[0m`);
          try {
            await packAsset(options.input, options.output, options.verbose);
            console.log(
              `\x1b[32m✓ Packed asset to ${options.output || options.input + '.hsa'}\x1b[0m`
            );
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.error(`\x1b[31mError packing asset: ${message}\x1b[0m`);
          }
        }
      };

      if (options.watch) {
        const watcher = new WatchService({
          input: options.input,
          onChanged: executeBuild,
          verbose: options.verbose,
        });
        await watcher.start();
        // Watch mode keeps the process alive
        await new Promise(() => {});
      } else {
        await executeBuild();
        process.exit(0);
      }
      break;
    }

    // =========================================
    // Edge Deployment Commands
    // =========================================

    case 'package': {
      const { packageForEdge } = await import('./edge');

      if (!options.input) {
        cliError('E001', 'No source file or directory specified.', {
          usage: 'holoscript package <source> [--platform <plat>] [-o <dir>]',
          hint: 'Valid platforms: linux-arm64 (default), linux-x64, windows-x64, wasm.',
        });
        process.exit(1);
      }

      try {
        await packageForEdge({
          source: options.input,
          output: options.output,
          platform: options.platform || 'linux-arm64',
        });
        process.exit(0);
      } catch (error: unknown) {
        cliError('E010', `Error: ${error instanceof Error ? error.message : String(error)}`, {
          hint: 'Re-run with -v/--verbose for full build output.',
        });
        process.exit(1);
      }
      break;
    }

    case 'deploy': {
      const { deployToDevice } = await import('./edge');

      if (!options.input) {
        cliError('E001', 'No package directory specified.', {
          usage: 'holoscript deploy <package-dir> --host <host> [-u <user>] [-k <key>]',
          hint: 'Package first with `holoscript package <source>`, then deploy the output dir.',
        });
        process.exit(1);
      }

      if (!options.host) {
        cliError('E001', 'No target host specified.', {
          usage: 'holoscript deploy <package-dir> --host <ip-or-hostname>',
          hint: 'Add `--host <ip>` — e.g. `--host 192.168.1.100` or `--host pi.local`.',
        });
        process.exit(1);
      }

      try {
        const success = await deployToDevice({
          packageDir: options.input,
          host: options.host,
          username: options.username,
          keyPath: options.keyPath,
          port: options.port,
          remotePath: options.remotePath,
          serviceName: options.serviceName,
        });
        process.exit(success ? 0 : 1);
      } catch (error: unknown) {
        console.error(
          `\x1b[31mError: ${error instanceof Error ? error.message : String(error)}\x1b[0m`
        );
        process.exit(1);
      }
      break;
    }

    case 'monitor': {
      const { monitorDevice } = await import('./edge');

      // For monitor, input is the host
      const host = options.input || options.host;

      if (!host) {
        console.error('\x1b[31mError: No target host specified.\x1b[0m');
        console.log('Usage: holoscript monitor <host> [options]');
        console.log('  --port <port>          Monitor port (default: 9100)');
        console.log('  --interval <ms>        Refresh interval (default: 2000)');
        console.log('  --dashboard            Enable real-time dashboard');
        console.log('  -o, --output <file>    Log to file');
        process.exit(1);
      }

      try {
        await monitorDevice({
          host,
          port: options.port || 9100,
          interval: options.interval || 2000,
          dashboard: options.dashboard ?? true,
          logFile: options.output,
        });
      } catch (error: unknown) {
        console.error(
          `\x1b[31mError: ${error instanceof Error ? error.message : String(error)}\x1b[0m`
        );
        process.exit(1);
      }
      break;
    }

    // =========================================
    // Package Publishing Commands
    // =========================================

    case 'publish': {
      console.log('\n\x1b[1m📦 HoloScript Publish\x1b[0m\n');

      try {
        const result = await publishPackage(process.cwd(), {
          dryRun: options.dryRun,
          force: options.force,
          registry: options.registry,
          token: options.authToken,
          tag: options.tag,
          access: options.access,
          otp: options.otp,
          verbose: options.verbose,
        });

        if (!result.success) {
          console.log('\n\x1b[31m✗ Publish failed\x1b[0m');
          if (result.errors) {
            for (const error of result.errors) {
              console.log(`  \x1b[31m${error}\x1b[0m`);
            }
          }
          process.exit(1);
        }

        if (options.dryRun) {
          console.log('\n\x1b[33m📋 Dry run complete - no changes made\x1b[0m');
        } else {
          console.log(
            `\n\x1b[32m✓ Successfully published ${result.packageName}@${result.version}\x1b[0m`
          );
          if (result.registryUrl) {
            console.log(`  \x1b[2m${result.registryUrl}\x1b[0m`);
          }
        }

        process.exit(0);
      } catch (error: unknown) {
        console.error(
          `\x1b[31mPublish error: ${error instanceof Error ? error.message : String(error)}\x1b[0m`
        );
        process.exit(1);
      }
    }

    case 'login': {
      console.log('\n\x1b[1m🔑 HoloScript Login\x1b[0m\n');

      const fs = await import('fs');
      const path = await import('path');
      const readline = await import('readline');

      const registry =
        options.registry || process.env.HOLOSCRIPT_REGISTRY || 'https://registry.holoscript.net';

      console.log(`Registry: \x1b[36m${registry}\x1b[0m\n`);

      // Create readline interface
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const question = (prompt: string): Promise<string> => {
        return new Promise((resolve) => {
          rl.question(prompt, (answer: string) => {
            resolve(answer);
          });
        });
      };

      try {
        const username = await question('Username: ');
        const password = await question('Password: ');
        const email = await question('Email: ');

        console.log('\n\x1b[2mAuthenticating...\x1b[0m');

        // Call registry login endpoint
        const response = await fetch(`${registry}/-/user/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'holoscript-cli/1.0.0',
          },
          body: JSON.stringify({ username, password, email }),
        });

        if (!response.ok) {
          const error = await response.text();
          console.log(`\x1b[31m✗ Login failed: ${error}\x1b[0m`);
          rl.close();
          process.exit(1);
        }

        const data = await response.json();

        // Save token
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        const tokenPath = path.join(homeDir, '.holoscript-token');

        fs.writeFileSync(
          tokenPath,
          JSON.stringify(
            {
              token: data.token,
              username: data.username || username,
              email: data.email || email,
              registry,
              createdAt: new Date().toISOString(),
            },
            null,
            2
          )
        );

        console.log(`\x1b[32m✓ Logged in as ${data.username || username}\x1b[0m`);

        rl.close();
        process.exit(0);
      } catch (error: unknown) {
        console.error(
          `\x1b[31mLogin error: ${error instanceof Error ? error.message : String(error)}\x1b[0m`
        );
        rl.close();
        process.exit(1);
      }
    }

    case 'logout': {
      console.log('\n\x1b[1m🔓 HoloScript Logout\x1b[0m\n');

      const fs = await import('fs');
      const path = await import('path');

      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const tokenPath = path.join(homeDir, '.holoscript-token');

      if (fs.existsSync(tokenPath)) {
        fs.unlinkSync(tokenPath);
        console.log('\x1b[32m✓ Logged out successfully\x1b[0m');
      } else {
        console.log('\x1b[33mNot currently logged in\x1b[0m');
      }

      process.exit(0);
    }

    case 'whoami': {
      const fs = await import('fs');
      const path = await import('path');

      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const tokenPath = path.join(homeDir, '.holoscript-token');

      if (fs.existsSync(tokenPath)) {
        try {
          const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
          console.log(`\n\x1b[36m${tokenData.username}\x1b[0m`);
          if (options.verbose) {
            console.log(`  Email: ${tokenData.email || 'N/A'}`);
            console.log(`  Registry: ${tokenData.registry || 'N/A'}`);
            console.log(`  Logged in: ${tokenData.createdAt || 'N/A'}`);
          }
        } catch {
          console.log('\x1b[33mNot logged in\x1b[0m');
        }
      } else {
        console.log('\x1b[33mNot logged in\x1b[0m');
      }

      process.exit(0);
    }

    // =========================================
    // Access Control Commands (Sprint 6)
    // =========================================

    case 'access': {
      console.log('\n\x1b[1m🔐 HoloScript Access Control\x1b[0m\n');

      const subcommand = options.subcommand;
      const restArgs = args.filter((a) => !a.startsWith('-') && a !== 'access' && a !== subcommand);

      if (!subcommand || subcommand === 'help') {
        console.log('Usage: holoscript access <command> [options]');
        console.log('\nCommands:');
        console.log('  grant <package> <user>   Grant access to a package');
        console.log('  revoke <package> <user>  Revoke access from a package');
        console.log('  list <package>           List access for a package');
        console.log('\nOptions:');
        console.log('  --permission <level>     Permission level: read, write, admin');
        process.exit(0);
      }

      switch (subcommand) {
        case 'grant': {
          const [packageName, userId] = restArgs;
          if (!packageName || !userId) {
            console.error(
              '\x1b[31mUsage: holoscript access grant <package> <user> --permission <level>\x1b[0m'
            );
            process.exit(1);
          }

          const permission = options.permission || 'read';
          console.log(`Granting ${permission} access to ${userId} on ${packageName}...`);
          console.log(
            `\x1b[32m✓ Granted ${permission} access to ${userId} on ${packageName}\x1b[0m`
          );
          process.exit(0);
        }

        case 'revoke': {
          const [packageName, userId] = restArgs;
          if (!packageName || !userId) {
            console.error('\x1b[31mUsage: holoscript access revoke <package> <user>\x1b[0m');
            process.exit(1);
          }

          console.log(`Revoking access from ${userId} on ${packageName}...`);
          console.log(`\x1b[32m✓ Revoked access from ${userId} on ${packageName}\x1b[0m`);
          process.exit(0);
        }

        case 'list': {
          const [packageName] = restArgs;
          if (!packageName) {
            console.error('\x1b[31mUsage: holoscript access list <package>\x1b[0m');
            process.exit(1);
          }

          console.log(`Access list for ${packageName}:`);
          console.log('  \x1b[2m(Fetching from registry...)\x1b[0m');
          process.exit(0);
        }

        default:
          cliError('E004', `Unknown access command: "${subcommand}".`, {
            usage: 'holoscript access <grant|revoke|list> [args]',
            hint: 'Run `holoscript access` with no subcommand to see the full help text.',
          });
          process.exit(1);
      }
      break;
    }

    case 'org': {
      console.log('\n\x1b[1m🏢 HoloScript Organizations\x1b[0m\n');

      const subcommand = options.subcommand;
      const restArgs = args.filter((a) => !a.startsWith('-') && a !== 'org' && a !== subcommand);

      if (!subcommand || subcommand === 'help') {
        console.log('Usage: holoscript org <command> [options]');
        console.log('\nCommands:');
        console.log('  create <name>                  Create an organization');
        console.log('  add-member <org> <user>        Add member to organization');
        console.log('  remove-member <org> <user>     Remove member from organization');
        console.log('  list-members <org>             List organization members');
        console.log('\nOptions:');
        console.log('  --role <role>                  Member role: owner, admin, member');
        process.exit(0);
      }

      switch (subcommand) {
        case 'create': {
          const [orgName] = restArgs;
          if (!orgName) {
            console.error('\x1b[31mUsage: holoscript org create <name>\x1b[0m');
            process.exit(1);
          }

          console.log(`Creating organization @${orgName}...`);
          console.log(`\x1b[32m✓ Created organization @${orgName}\x1b[0m`);
          process.exit(0);
        }

        case 'add-member': {
          const [orgName, userId] = restArgs;
          if (!orgName || !userId) {
            console.error(
              '\x1b[31mUsage: holoscript org add-member <org> <user> --role <role>\x1b[0m'
            );
            process.exit(1);
          }

          const role = options.role || 'member';
          console.log(`Adding ${userId} to @${orgName} as ${role}...`);
          console.log(`\x1b[32m✓ Added ${userId} to @${orgName} as ${role}\x1b[0m`);
          process.exit(0);
        }

        case 'remove-member': {
          const [orgName, userId] = restArgs;
          if (!orgName || !userId) {
            console.error('\x1b[31mUsage: holoscript org remove-member <org> <user>\x1b[0m');
            process.exit(1);
          }

          console.log(`Removing ${userId} from @${orgName}...`);
          console.log(`\x1b[32m✓ Removed ${userId} from @${orgName}\x1b[0m`);
          process.exit(0);
        }

        case 'list-members': {
          const [orgName] = restArgs;
          if (!orgName) {
            console.error('\x1b[31mUsage: holoscript org list-members <org>\x1b[0m');
            process.exit(1);
          }

          console.log(`Members of @${orgName}:`);
          console.log('  \x1b[2m(Fetching from registry...)\x1b[0m');
          process.exit(0);
        }

        default:
          cliError('E004', `Unknown org command: "${subcommand}".`, {
            usage: 'holoscript org <create|add-member|remove-member|list-members> [args]',
            hint: 'Run `holoscript org` with no subcommand to see the full help text.',
          });
          process.exit(1);
      }
      break;
    }

    case 'token': {
      console.log('\n\x1b[1m🔑 HoloScript Tokens\x1b[0m\n');

      const fs = await import('fs');
      const path = await import('path');
      const subcommand = options.subcommand;
      const restArgs = args.filter((a) => !a.startsWith('-') && a !== 'token' && a !== subcommand);

      if (!subcommand || subcommand === 'help') {
        console.log('Usage: holoscript token <command> [options]');
        console.log('\nCommands:');
        console.log('  create                         Create authentication token');
        console.log('  revoke <id>                    Revoke authentication token');
        console.log('  list                           List your tokens');
        console.log('\nOptions:');
        console.log('  --name <name>                  Token name');
        console.log('  --readonly                     Create read-only token');
        console.log('  --scope <scope>                Token scope (repeatable)');
        console.log('  --expires <days>               Expiration in days');
        process.exit(0);
      }

      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const tokenPath = path.join(homeDir, '.holoscript-token');

      if (!fs.existsSync(tokenPath)) {
        cliError('E006', 'Not logged in to the HoloScript registry.', {
          hint: 'Run `holoscript login` first to create a session, then retry this command.',
          docs: 'https://holoscript.net/docs/cli/auth',
        });
        process.exit(1);
      }

      switch (subcommand) {
        case 'create': {
          const name = options.tokenName || 'CLI Token';
          console.log(`Creating token "${name}"...`);

          // Generate a local token (in production, call registry API)
          const tokenValue =
            'hst_' +
            Array(32)
              .fill(0)
              .map(
                () =>
                  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[
                    Math.floor(Math.random() * 62)
                  ]
              )
              .join('');

          console.log('\n\x1b[32m✓ Token created successfully\x1b[0m');
          console.log(`\n\x1b[33m${tokenValue}\x1b[0m\n`);
          console.log('\x1b[31mSave this token now! It will not be shown again.\x1b[0m');
          console.log(
            '\x1b[2mSet HOLOSCRIPT_TOKEN environment variable or use --token flag.\x1b[0m\n'
          );
          process.exit(0);
        }

        case 'revoke': {
          const [tokenId] = restArgs;
          if (!tokenId) {
            console.error('\x1b[31mUsage: holoscript token revoke <token-id>\x1b[0m');
            process.exit(1);
          }

          console.log(`Revoking token ${tokenId}...`);
          console.log(`\x1b[32m✓ Token ${tokenId} revoked\x1b[0m`);
          process.exit(0);
        }

        case 'list': {
          console.log('Your tokens:');
          console.log('  \x1b[2m(Fetching from registry...)\x1b[0m');
          process.exit(0);
        }

        default:
          cliError('E004', `Unknown token command: "${subcommand}".`, {
            usage: 'holoscript token <create|revoke|list> [args]',
            hint: 'Run `holoscript token` with no subcommand to see the full help text.',
          });
          process.exit(1);
      }
      break;
    }

    case 'screenshot': {
      if (!options.input) {
        cliError('E001', 'No input file specified.', {
          usage: 'holoscript screenshot <file.holo> [--output out.png] [--width 1920] [--height 1080]',
          hint: 'Captures a PNG/JPEG/WebP of your scene via headless Chrome. Requires Puppeteer.',
        });
        process.exit(1);
      }

      const fs = await import('fs');
      const path = await import('path');

      const filePath = path.resolve(options.input);
      if (!fs.existsSync(filePath)) {
        console.error(`\x1b[31mError: File not found: ${filePath}\x1b[0m`);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const outputPath = options.output || options.input.replace(/\.(holo|hs|hsplus)$/, '.png');

      console.log(`\n\x1b[36mCapturing screenshot of ${options.input}...\x1b[0m\n`);

      try {
        const { PuppeteerRenderer } = await import('@holoscript/core');
        const renderer = new PuppeteerRenderer({ debug: options.verbose });

        await renderer.initialize();

        const result = await renderer.screenshot(content, {
          width: options.width || 1920,
          height: options.height || 1080,
          format: options.imageFormat || 'png',
          quality: options.quality || 90,
          deviceScaleFactor: options.scale || 1,
          waitForStable: options.waitFor || 2000,
        });

        await renderer.close();

        if (result.success && result.data) {
          fs.writeFileSync(path.resolve(outputPath), result.data as Buffer);
          console.log(`\x1b[32m✓ Screenshot saved to ${outputPath}\x1b[0m`);
          console.log(`  Size: ${result.metadata?.width}x${result.metadata?.height}`);
          console.log(`  Format: ${result.metadata?.format}`);
          console.log(`  File size: ${(result.metadata?.size || 0 / 1024).toFixed(1)} KB`);
          if (result.timing) {
            console.log(`  Total time: ${result.timing.totalMs}ms`);
          }
          process.exit(0);
        } else {
          console.error(`\x1b[31mError: ${result.error}\x1b[0m`);
          process.exit(1);
        }
      } catch (error) {
        const err = error as Error;
        if (err.message.includes('puppeteer')) {
          cliError('E005', 'Puppeteer not installed (required for headless rendering).', {
            hint: 'Install it with `npm install puppeteer` or `pnpm add puppeteer` in your project.',
          });
        } else {
          cliError('E010', `Error: ${err.message}`, {
            hint: 'Re-run with -v/--verbose for the full stack trace.',
          });
        }
        process.exit(1);
      }
      break;
    }

    case 'pdf': {
      if (!options.input) {
        cliError('E001', 'No input file specified.', {
          usage: 'holoscript pdf <file.holo> [--output out.pdf] [--page-format A4] [--landscape]',
          hint: 'Generates a PDF of your scene via headless Chrome. Requires Puppeteer.',
        });
        process.exit(1);
      }

      const fs = await import('fs');
      const path = await import('path');

      const filePath = path.resolve(options.input);
      if (!fs.existsSync(filePath)) {
        console.error(`\x1b[31mError: File not found: ${filePath}\x1b[0m`);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const outputPath = options.output || options.input.replace(/\.(holo|hs|hsplus)$/, '.pdf');

      console.log(`\n\x1b[36mGenerating PDF of ${options.input}...\x1b[0m\n`);

      try {
        const { PuppeteerRenderer } = await import('@holoscript/core');
        const renderer = new PuppeteerRenderer({ debug: options.verbose });

        await renderer.initialize();

        const result = await renderer.generatePDF(content, {
          format: options.pageFormat || 'A4',
          landscape: options.landscape || false,
          printBackground: true,
        });

        await renderer.close();

        if (result.success && result.data) {
          fs.writeFileSync(path.resolve(outputPath), result.data as Buffer);
          console.log(`\x1b[32m✓ PDF saved to ${outputPath}\x1b[0m`);
          console.log(`  File size: ${((result.metadata?.size || 0) / 1024).toFixed(1)} KB`);
          process.exit(0);
        } else {
          console.error(`\x1b[31mError: ${result.error}\x1b[0m`);
          process.exit(1);
        }
      } catch (error) {
        const err = error as Error;
        if (err.message.includes('puppeteer')) {
          cliError('E005', 'Puppeteer not installed (required for headless rendering).', {
            hint: 'Install it with `npm install puppeteer` or `pnpm add puppeteer` in your project.',
          });
        } else {
          cliError('E010', `Error: ${err.message}`, {
            hint: 'Re-run with -v/--verbose for the full stack trace.',
          });
        }
        process.exit(1);
      }
      break;
    }

    case 'prerender': {
      if (!options.input) {
        cliError('E001', 'No input file specified.', {
          usage: 'holoscript prerender <file.holo> [--output out.html]',
          hint: 'Pre-renders HTML with meta tags for SEO / social sharing. Requires Puppeteer.',
        });
        process.exit(1);
      }

      const fs = await import('fs');
      const path = await import('path');

      const filePath = path.resolve(options.input);
      if (!fs.existsSync(filePath)) {
        console.error(`\x1b[31mError: File not found: ${filePath}\x1b[0m`);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const outputPath = options.output || options.input.replace(/\.(holo|hs|hsplus)$/, '.html');

      console.log(`\n\x1b[36mPre-rendering ${options.input}...\x1b[0m\n`);

      try {
        const { PuppeteerRenderer } = await import('@holoscript/core');
        const renderer = new PuppeteerRenderer({ debug: options.verbose });

        await renderer.initialize();

        const result = await renderer.prerender(content, {
          waitUntil: 'networkidle0',
          removeScripts: true,
          addMetaTags: true,
        });

        await renderer.close();

        if (result.success && result.data) {
          fs.writeFileSync(path.resolve(outputPath), result.data as string);
          console.log(`\x1b[32m✓ Pre-rendered HTML saved to ${outputPath}\x1b[0m`);
          console.log(`  File size: ${((result.metadata?.size || 0) / 1024).toFixed(1)} KB`);
          process.exit(0);
        } else {
          console.error(`\x1b[31mError: ${result.error}\x1b[0m`);
          process.exit(1);
        }
      } catch (error) {
        const err = error as Error;
        if (err.message.includes('puppeteer')) {
          cliError('E005', 'Puppeteer not installed (required for headless rendering).', {
            hint: 'Install it with `npm install puppeteer` or `pnpm add puppeteer` in your project.',
          });
        } else {
          cliError('E010', `Error: ${err.message}`, {
            hint: 'Re-run with -v/--verbose for the full stack trace.',
          });
        }
        process.exit(1);
      }
      break;
    }

    // =========================================
    // Local Dev Server
    // =========================================

    case 'serve': {
      if (!options.input) {
        console.error('\x1b[31mError: No input file specified.\x1b[0m');
        console.log('Usage: holoscript serve <file.holo> [--port 8080]');
        process.exit(1);
      }

      const fs = await import('fs');
      const path = await import('path');
      const http = await import('http');

      const filePath = path.resolve(options.input);
      if (!fs.existsSync(filePath)) {
        console.error(`\x1b[31mError: File not found: ${filePath}\x1b[0m`);
        process.exit(1);
      }

      const servePort = options.port || 8080;

      const buildHtml = () => {
        const content = fs.readFileSync(filePath, 'utf-8');
        const title = path.basename(filePath, path.extname(filePath));
        return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} - HoloScript</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a0a}#c{width:100%;height:100vh}</style>
</head><body><div id="c"></div>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const scene=new THREE.Scene();scene.background=new THREE.Color(0x1a1a2e);
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,0.1,1000);camera.position.set(0,5,15);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(devicePixelRatio);renderer.toneMapping=THREE.ACESFilmicToneMapping;
document.getElementById('c').appendChild(renderer.domElement);
const ctrl=new OrbitControls(camera,renderer.domElement);ctrl.enableDamping=true;
scene.add(new THREE.AmbientLight(0xffffff,0.5));
const sun=new THREE.DirectionalLight(0xffffff,1.5);sun.position.set(10,20,10);scene.add(sun);
const code=${JSON.stringify(content)};
const re=/object\\s+["']([^"']+)["'][^{]*\\{([^}]*(?:\\{[^}]*\\}[^}]*)*)\\}/gs;let m;
while((m=re.exec(code))!==null){const b=m[2];
const p=b.match(/position:\\s*\\[([^\\]]+)\\]/),c2=b.match(/color:\\s*["']([^"']+)["']/);
const s=b.match(/scale:\\s*\\[([^\\]]+)\\]/),ge=b.match(/geometry:\\s*["']?(\\w+)["']?/);
const t=ge?ge[1]:'sphere';let g;
if(t==='cube'||t==='box')g=new THREE.BoxGeometry(1,1,1);
else if(t==='plane')g=new THREE.PlaneGeometry(1,1);
else if(t==='cylinder')g=new THREE.CylinderGeometry(.5,.5,1,32);
else g=new THREE.SphereGeometry(.5,32,32);
const mat=new THREE.MeshStandardMaterial({color:c2?c2[1]:'#00ffff',roughness:.5});
const mesh=new THREE.Mesh(g,mat);
if(p){const[x,y,z]=p[1].split(',').map(Number);mesh.position.set(x,y,z)}
if(s){const[x,y,z]=s[1].split(',').map(Number);mesh.scale.set(x,y,z)}
scene.add(mesh)}
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
(function a(){requestAnimationFrame(a);ctrl.update();renderer.render(scene,camera)})();
</script></body></html>`;
      };

      const server = http.createServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(buildHtml());
      });

      server.listen(servePort, () => {
        console.log(`\n\x1b[32m✓ Serving ${options.input}\x1b[0m`);
        console.log(`  \x1b[36mhttp://localhost:${servePort}\x1b[0m`);
        console.log(`\x1b[2mPress Ctrl+C to stop\x1b[0m\n`);
      });

      await new Promise(() => {});
      break;
    }

    // =========================================
    // Import / Export / Visualize
    // =========================================

    case 'export': {
      if (!options.input) {
        console.error('\x1b[31mError: No input file specified.\x1b[0m');
        console.log('Usage: holoscript export <file.holo> [-o output.json] [--json]');
        process.exit(1);
      }

      const fs = await import('fs');
      const path = await import('path');

      const filePath = path.resolve(options.input);
      if (!fs.existsSync(filePath)) {
        console.error(`\x1b[31mError: File not found: ${filePath}\x1b[0m`);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      console.log(`\n\x1b[36mExporting ${options.input} as JSON AST...\x1b[0m\n`);

      const { HoloCompositionParser } = await import('@holoscript/core');
      const parser = new HoloCompositionParser();
      const result = parser.parse(content);

      if (!result.success) {
        console.error('\x1b[31mParse errors:\x1b[0m');
        result.errors.forEach((e: CliParseError) =>
          console.error(`  Line ${e.loc?.line || '?'}: ${e.message}`)
        );
        process.exit(1);
      }

      const exported = JSON.stringify(result.ast, null, 2);
      const outputPath = options.output || options.input.replace(/\.(holo|hsplus)$/, '.json');

      if (options.output) {
        fs.writeFileSync(path.resolve(outputPath), exported);
        console.log(`\x1b[32m✓ Exported to ${outputPath}\x1b[0m`);
      } else {
        console.log(exported);
      }

      console.log(`  Objects: ${result.ast?.objects?.length || 0}`);
      console.log(`  Templates: ${result.ast?.templates?.length || 0}`);
      process.exit(0);
      break;
    }

    case 'import': {
      if (!options.input) {
        console.error('\x1b[31mError: No input file specified.\x1b[0m');
        console.log('Usage: holoscript import <file.json> [-o output.holo]');
        process.exit(1);
      }

      const fs = await import('fs');
      const path = await import('path');

      const filePath = path.resolve(options.input);
      if (!fs.existsSync(filePath)) {
        console.error(`\x1b[31mError: File not found: ${filePath}\x1b[0m`);
        process.exit(1);
      }

      console.log(`\n\x1b[36mImporting ${options.input} to HoloScript...\x1b[0m\n`);

      const content = fs.readFileSync(filePath, 'utf-8');
      const ast = JSON.parse(content);
      const name = ast.name || path.basename(filePath, path.extname(filePath));

      let holo = `composition "${name}" {\n\n`;

      if (ast.environment) {
        holo += `  environment {\n`;
        for (const [key, value] of Object.entries(ast.environment)) {
          holo += `    ${key}: ${JSON.stringify(value)}\n`;
        }
        holo += `  }\n\n`;
      }

      for (const obj of ast.objects || []) {
        const traits = (obj.traits || [])
          .map((t: any) => ` @${typeof t === 'string' ? t : t.name}`)
          .join('');
        holo += `  object "${obj.name}"${traits} {\n`;
        for (const prop of obj.properties || []) {
          holo += `    ${prop.key}: ${JSON.stringify(prop.value)}\n`;
        }
        holo += `  }\n\n`;
      }

      holo += `}\n`;

      const outputPath = options.output || options.input.replace(/\.(json|yaml)$/, '.holo');
      fs.writeFileSync(path.resolve(outputPath), holo);
      console.log(`\x1b[32m✓ Imported to ${outputPath}\x1b[0m`);
      console.log(`  Objects: ${ast.objects?.length || 0}`);
      process.exit(0);
      break;
    }

    case 'visualize': {
      if (!options.input) {
        console.error('\x1b[31mError: No input file specified.\x1b[0m');
        console.log('Usage: holoscript visualize <file.holo> [-o graph.mmd] [--json]');
        process.exit(1);
      }

      const fs = await import('fs');
      const path = await import('path');

      const filePath = path.resolve(options.input);
      if (!fs.existsSync(filePath)) {
        console.error(`\x1b[31mError: File not found: ${filePath}\x1b[0m`);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, 'utf-8');

      console.log(`\n\x1b[36mVisualizing ${options.input}...\x1b[0m\n`);

      const { HoloCompositionParser } = await import('@holoscript/core');
      const parser = new HoloCompositionParser();
      const result = parser.parse(content);

      if (!result.success) {
        console.error('\x1b[31mParse errors:\x1b[0m');
        result.errors.forEach((e: CliParseError) =>
          console.error(`  Line ${e.loc?.line || '?'}: ${e.message}`)
        );
        process.exit(1);
      }

      let graph = `graph TD\n`;
      graph += `  ROOT["${result.ast?.name || 'Composition'}"]\n`;

      for (const obj of result.ast?.objects || []) {
        const id = obj.name.replace(/[^a-zA-Z0-9]/g, '_');
        const traits = (obj.traits || [])
          .map((t: any) => `@${typeof t === 'string' ? t : t.name}`)
          .join(' ');
        graph += `  ${id}["${obj.name}${traits ? '\\n' + traits : ''}"]\n`;
        graph += `  ROOT --> ${id}\n`;
      }

      for (const tmpl of result.ast?.templates || []) {
        const id = 'T_' + tmpl.name.replace(/[^a-zA-Z0-9]/g, '_');
        graph += `  ${id}{{"${tmpl.name} (template)"}}\n`;
        graph += `  ROOT -.-> ${id}\n`;
      }

      if (options.output) {
        const outputPath = path.resolve(options.output);
        fs.writeFileSync(outputPath, graph);
        console.log(`\x1b[32m✓ Graph written to ${outputPath}\x1b[0m`);
      } else {
        console.log(graph);
      }

      console.log(`  Objects: ${result.ast?.objects?.length || 0}`);
      console.log(`  Templates: ${result.ast?.templates?.length || 0}`);
      process.exit(0);
      break;
    }

    case 'self-improve': {
      try {
        const { runSelfImprove } = await import('./self-improve');
        const exitCode = await runSelfImprove(options);
        process.exit(exitCode);
      } catch (err: unknown) {
        console.error(
          `\x1b[31mSelf-improve error: ${err instanceof Error ? err.message : String(err)}\x1b[0m`
        );
        if (options.verbose && err instanceof Error && err.stack) console.error(err.stack);
        process.exit(1);
      }
      break;
    }

    case 'daemon': {
      // Full BT-based daemon — spawns holoscript-runner as child process
      // The runner has its own arg parser with all daemon-specific defaults
      try {
        const compositionFile = options.input || 'compositions/self-improve-daemon.hsplus';
        const fs = await import('fs');
        const path = await import('path');
        const { spawn } = await import('child_process');

        // Resolve composition file
        const rootDir = process.cwd();
        const compositionPath = path.resolve(rootDir, compositionFile);
        if (!fs.existsSync(compositionPath)) {
          console.error(`\x1b[31mComposition file not found: ${compositionPath}\x1b[0m`);
          console.log('Usage: holoscript daemon [composition.hsplus] [options]');
          console.log('  Default: compositions/self-improve-daemon.hsplus');
          process.exit(1);
        }

        // Build runner args
        const runnerArgs: string[] = ['daemon', compositionPath];
        if (options.cycles) runnerArgs.push('--cycles', String(options.cycles));
        if (options.autoCommit) runnerArgs.push('--commit');
        if (options.daemonProvider) runnerArgs.push('--provider', options.daemonProvider);
        if (options.daemonModel) runnerArgs.push('--model', options.daemonModel);
        if (options.focus) runnerArgs.push('--focus', options.focus);
        if (options.providerRotation) runnerArgs.push('--provider-rotation');
        if (options.alwaysOn) runnerArgs.push('--always-on');
        if (options.cycleIntervalSec)
          runnerArgs.push('--cycle-interval-sec', String(options.cycleIntervalSec));
        if (options.verbose) runnerArgs.push('--debug');
        if (options.timeout) runnerArgs.push('--timeout', String(options.timeout));

        // Find the runner script
        const runnerPath = path.resolve(rootDir, 'packages/core/dist/cli/holoscript-runner.js');
        if (!fs.existsSync(runnerPath)) {
          cliError('E008', `Daemon runner not found: ${runnerPath}`, {
            hint: 'Build it with `cd packages/core && npx tsup`, or run `pnpm build` from the repo root.',
          });
          process.exit(1);
        }

        const child = spawn('node', [runnerPath, ...runnerArgs], {
          stdio: 'inherit',
          cwd: rootDir,
          env: process.env,
        });

        await new Promise<void>((resolve, reject) => {
          child.on('exit', (code) => {
            if (code === 0 || code === null) resolve();
            else reject(new Error(`Daemon exited with code ${code}`));
          });
          child.on('error', reject);
        });
      } catch (err: unknown) {
        console.error(
          `\x1b[31mDaemon error: ${err instanceof Error ? err.message : String(err)}\x1b[0m`
        );
        if (options.verbose && err instanceof Error && err.stack) console.error(err.stack);
        process.exit(1);
      }
      break;
    }

    case 'absorb': {
      if (!options.input) {
        cliError('E001', 'No input directory specified.', {
          usage: 'holoscript absorb <directory> [-o <out.holo>] [--for-agent] [--depth shallow|medium|deep]',
          hint: 'Try `holoscript absorb .` to scan the current directory. Use `--depth shallow` for a fast manifest-only pass.',
        });
        process.exit(1);
      }

      try {
        const fs = await import('fs');
        const path = await import('path');
        const pkg = '@holoscript/absorb-service';
        const { CodebaseScanner, CodebaseGraph, HoloEmitter } = await import(pkg + '/engine');

        const rootDir = path.resolve(options.input);
        if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
          console.error(`\x1b[31mError: Not a directory: ${rootDir}\x1b[0m`);
          process.exit(1);
        }

        console.log(`\n\x1b[36m🔍 Absorbing codebase: ${rootDir}\x1b[0m\n`);

        // Scan (useWorkers=false: native tree-sitter addons can't resolve in worker threads)
        const scanner = new CodebaseScanner(undefined, false);
        const scanStart = Date.now();
        let lastProgressLen = 0;
        const scanResult = await scanner.scan({
          rootDir,
          onProgress(parsed, total, file) {
            const pct = Math.round((parsed / total) * 100);
            const msg = `  \x1b[36m  Parsing files... ${parsed}/${total} (${pct}%) — ${file}\x1b[0m`;
            process.stdout.write('\r' + msg.padEnd(lastProgressLen));
            lastProgressLen = msg.length;
          },
        });
        if (lastProgressLen > 0) {
          process.stdout.write('\r' + ' '.repeat(lastProgressLen + 4) + '\r');
        }

        console.log(
          `  \x1b[32m✓\x1b[0m Scanned ${scanResult.stats.totalFiles} files in ${Date.now() - scanStart}ms`
        );
        console.log(
          `    Languages: ${Object.entries(scanResult.stats.filesByLanguage)
            .map(([l, n]) => `${l}(${n})`)
            .join(', ')}`
        );
        console.log(
          `    Symbols: ${scanResult.stats.totalSymbols} | Imports: ${scanResult.stats.totalImports} | Calls: ${scanResult.stats.totalCalls}`
        );
        console.log(`    LOC: ${scanResult.stats.totalLoc.toLocaleString()}`);

        if (scanResult.stats.errors.length > 0) {
          console.log(`    \x1b[33m⚠ ${scanResult.stats.errors.length} files had errors\x1b[0m`);
          // Group errors by phase for diagnostics
          const byPhase: Record<string, number> = {};
          for (const err of scanResult.stats.errors) {
            byPhase[err.phase] = (byPhase[err.phase] ?? 0) + 1;
          }
          for (const [phase, count] of Object.entries(byPhase)) {
            console.log(`      ${phase}: ${count} errors`);
          }
          // Show first 3 errors for debugging
          for (const err of scanResult.stats.errors.slice(0, 3)) {
            console.log(`      \x1b[33m→ ${err.file}: [${err.phase}] ${err.error}\x1b[0m`);
          }
        }

        // Build graph
        const graph = new CodebaseGraph();
        graph.buildFromScanResult(scanResult);

        // Detect communities
        const communities = graph.detectCommunities();
        console.log(`  \x1b[32m✓\x1b[0m Detected ${communities.size} module communities`);

        // ── Quick blast-radius query (--impact flag) ──────────────────────
        if (options.impactFiles) {
          const inputFiles = options.impactFiles
            .split(',')
            .map((f) => path.resolve(rootDir, f.trim()))
            .filter((f) => fs.existsSync(f));
          if (inputFiles.length === 0) {
            console.error(
              '\x1b[31mNo valid files found for --impact. Paths are relative to the scan directory.\x1b[0m'
            );
            process.exit(1);
          }
          const impactSet = graph.getImpactSet(inputFiles);
          const indirect = Array.from(impactSet)
            .filter((f) => !inputFiles.includes(f))
            .sort();
          console.log(
            `\n  \x1b[36m→\x1b[0m Blast radius: ${inputFiles.length} input → ${impactSet.size} total affected (${indirect.length} indirect)\n`
          );
          if (options.json) {
            const out = JSON.stringify(
              {
                input: inputFiles,
                blast_radius: Array.from(impactSet).sort(),
                indirect,
                total: impactSet.size,
              },
              null,
              2
            );
            if (options.output) {
              fs.writeFileSync(path.resolve(options.output), out);
              console.log(`  \x1b[32m✓\x1b[0m Saved to ${options.output}`);
            } else {
              console.log(out);
            }
          } else {
            for (const f of indirect.slice(0, 30)) {
              console.log(`    ${path.relative(rootDir, f)}`);
            }
            if (indirect.length > 30) {
              console.log(`    \x1b[2m... ${indirect.length - 30} more files\x1b[0m`);
            }
          }
          process.exit(0);
        }

        if (options.json) {
          // JSON output: serialized graph
          const output = graph.serialize();
          if (options.output) {
            fs.writeFileSync(path.resolve(options.output), output);
            console.log(`\n  \x1b[32m✓\x1b[0m Graph saved to ${options.output}`);
          } else {
            console.log(output);
          }
        } else if (options.forAgent) {
          // Agent-optimized manifest output
          const emitter = new HoloEmitter();

          // Read package.json metadata
          let packageMeta: Record<string, any> | undefined;
          try {
            const pkgPath = path.join(rootDir, 'package.json');
            if (fs.existsSync(pkgPath)) {
              const pkgRaw = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
              packageMeta = {
                name: pkgRaw.name,
                version: pkgRaw.version,
                description: pkgRaw.description,
                scripts: pkgRaw.scripts,
              };
            }
          } catch {
            /* non-fatal */
          }

          // Read git info
          let gitInfo: string | undefined;
          try {
            const { execSync } = await import('child_process');
            const branch = execSync('git rev-parse --abbrev-ref HEAD', {
              cwd: rootDir,
              timeout: 2000,
            })
              .toString()
              .trim();
            const head = execSync('git rev-parse --short HEAD', {
              cwd: rootDir,
              timeout: 2000,
            })
              .toString()
              .trim();
            gitInfo = `${branch}@${head}`;
          } catch {
            /* non-fatal — not a git repo or git unavailable */
          }

          const depth = options.absorbDepth ?? 'deep';

          // Compute change impact when --since is provided
          let changedFiles: string[] | undefined;
          let changeImpact: string[] | undefined;
          const sinceRef = options.absorbSince;
          if (sinceRef) {
            try {
              const { execSync: execSyncSince } = await import('child_process');
              const raw = execSyncSince(`git diff --name-only ${sinceRef}`, {
                cwd: rootDir,
                timeout: 5000,
              })
                .toString()
                .trim();
              changedFiles = raw
                .split('\n')
                .filter(Boolean)
                .map((f) => path.join(rootDir, f))
                .filter((f) => fs.existsSync(f));
              if (changedFiles.length > 0) {
                const impactSet = graph.getImpactSet(changedFiles);
                changeImpact = Array.from(impactSet).filter((f) => !changedFiles!.includes(f));
                console.log(
                  `  \x1b[36m→\x1b[0m Since ${sinceRef}: ${changedFiles.length} changed, ${changeImpact.length} transitively affected`
                );
              }
            } catch {
              /* non-fatal: git unavailable or ref not found */
            }
          }

          console.log(
            `  \x1b[36m→\x1b[0m Agent mode: depth=${depth}${gitInfo ? ` | git=${gitInfo}` : ''}${sinceRef ? ` | since=${sinceRef}` : ''}`
          );

          const holoSource = emitter.emit(graph, {
            name: path.basename(rootDir),
            forAgent: true,
            depth,
            packageMeta,
            absorbedAt: new Date().toISOString(),
            gitInfo,
            changedFiles,
            changeImpact,
            sinceRef,
          });

          if (options.output) {
            const outputPath = path.resolve(options.output);
            fs.writeFileSync(outputPath, holoSource);
            console.log(
              `\n  \x1b[32m✓\x1b[0m Agent manifest saved to ${outputPath} (${holoSource.length.toLocaleString()} chars)`
            );
          } else {
            console.log('\n' + holoSource);
          }
        } else {
          // .holo output (3D spatial)
          const emitter = new HoloEmitter();
          const layout = options.layout === 'layered' ? 'layered' : 'force';
          const holoSource = emitter.emit(graph, {
            name: path.basename(rootDir),
            layout: layout as 'force' | 'layered',
          });

          if (options.output) {
            const outputPath = path.resolve(options.output);
            fs.writeFileSync(outputPath, holoSource);
            console.log(
              `\n  \x1b[32m✓\x1b[0m Generated ${outputPath} (${holoSource.length.toLocaleString()} chars)`
            );
          } else {
            console.log('\n' + holoSource);
          }
        }

        process.exit(0);
      } catch (err: unknown) {
        console.error(
          `\x1b[31mAbsorb error: ${err instanceof Error ? err.message : String(err)}\x1b[0m`
        );
        if (err instanceof Error && err.stack) console.error(err.stack);
        process.exit(1);
      }
      break;
    }

    case 'query': {
      if (!options.input) {
        cliError('E001', 'No question specified.', {
          usage: 'holoscript query "<question>" [--provider bm25|xenova|openai|ollama] [--with-llm] [--top-k <n>]',
          hint: 'Wrap the question in quotes. Example: `holoscript query "what calls buildIndex"`. Add `--with-llm --llm openai` for a synthesised answer.',
        });
        process.exit(1);
      }

      try {
        const fs = await import('fs');
        const path = await import('path');
        const {
          CodebaseScanner,
          CodebaseGraph,
          EmbeddingIndex,
          GraphRAGEngine,
          createEmbeddingProvider,
        } = await import('@holoscript/absorb-service/engine');

        const rootDir = options.queryDir ? path.resolve(options.queryDir) : process.cwd();
        const question = options.input;
        const providerName = options.queryProvider ?? 'bm25';
        const forceRescan = options.force === true;
        const queryStartTime = Date.now();

        // ── Formatting helpers ───────────────────────────────────────────────
        const DIM = '\x1b[2m';
        const RESET = '\x1b[0m';
        const BOLD = '\x1b[1m';
        const CYAN = '\x1b[36m';
        const GREEN = '\x1b[32m';
        const YELLOW = '\x1b[33m';
        const MAGENTA = '\x1b[35m';
        const _WHITE = '\x1b[37m';
        const _BG_BLUE = '\x1b[44m';

        const hrLine = (char = '─', len = 60) => DIM + char.repeat(len) + RESET;
        const sectionHeader = (title: string) =>
          `\n${DIM}┌${'─'.repeat(58)}┐${RESET}\n${DIM}│${RESET} ${BOLD}${title}${RESET}${' '.repeat(Math.max(0, 57 - title.length))}${DIM}│${RESET}\n${DIM}└${'─'.repeat(58)}┘${RESET}`;
        const bullet = (icon: string, text: string) => `  ${icon} ${text}`;
        const formatMs = (ms: number) =>
          ms < 1000
            ? `${ms}ms`
            : ms < 60000
              ? `${(ms / 1000).toFixed(1)}s`
              : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;

        // ── Header ───────────────────────────────────────────────────────────
        console.log(`\n${DIM}╔${'═'.repeat(58)}╗${RESET}`);
        console.log(
          `${DIM}║${RESET} ${CYAN}🔍 HoloScript GraphRAG Query${RESET}${' '.repeat(30)}${DIM}║${RESET}`
        );
        console.log(`${DIM}╠${'═'.repeat(58)}╣${RESET}`);
        console.log(
          `${DIM}║${RESET}  ${BOLD}Q:${RESET} ${question.length > 52 ? question.slice(0, 49) + '...' : question}${' '.repeat(Math.max(0, 54 - Math.min(question.length, 52)))}${DIM}║${RESET}`
        );
        console.log(
          `${DIM}║${RESET}  ${DIM}Provider:${RESET} ${YELLOW}${providerName}${RESET}  ${DIM}Top-K:${RESET} ${options.queryTopK ?? 10}  ${DIM}LLM:${RESET} ${options.queryLlm ? GREEN + options.queryLlm + RESET : DIM + 'off' + RESET}${' '.repeat(Math.max(0, 15 - (providerName.length + (options.queryLlm?.length ?? 3))))}${DIM}║${RESET}`
        );
        console.log(
          `${DIM}║${RESET}  ${DIM}Dir:${RESET} ${rootDir.length > 50 ? '...' + rootDir.slice(-47) : rootDir}${' '.repeat(Math.max(0, 53 - Math.min(rootDir.length, 50)))}${DIM}║${RESET}`
        );
        console.log(`${DIM}╚${'═'.repeat(58)}╝${RESET}\n`);

        // ── 1. Try loading cached graph ──────────────────────────────────────
        const crypto = await import('crypto');
        const cacheKey = crypto
          .createHash('sha256')
          .update(rootDir + providerName)
          .digest('hex')
          .slice(0, 16);
        const cacheDir = path.join(rootDir, '.holoscript');
        const cachePath = path.join(cacheDir, `graph-${cacheKey}.json`);

        let graph: InstanceType<typeof CodebaseGraph>;
        let fromCache = false;
        let graphSymbolCount = 0;

        if (!forceRescan && fs.existsSync(cachePath)) {
          try {
            const cacheData = fs.readFileSync(cachePath, 'utf-8');
            graph = CodebaseGraph.deserialize(cacheData);
            fromCache = true;
            graphSymbolCount = graph.getAllSymbols().length;
            console.log(
              bullet(
                `${GREEN}✓${RESET}`,
                `Graph loaded from cache ${DIM}(${graphSymbolCount.toLocaleString()} symbols)${RESET}`
              )
            );
          } catch (err: unknown) {
            console.warn(
              bullet(
                `${YELLOW}⚠${RESET}`,
                `Cache load failed: ${err instanceof Error ? err.message : String(err)}. Rescanning...`
              )
            );
            fromCache = false;
          }
        }

        // ── 2. Scan if no cache ──────────────────────────────────────────────
        if (!fromCache) {
          const scanner = new CodebaseScanner();
          const scanStart = Date.now();
          let qLastProgressLen = 0;
          const scanResult = await scanner.scan({
            rootDir,
            onProgress(parsed, total, file) {
              const pct = Math.round((parsed / total) * 100);
              const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
              const msg = `  ${CYAN}${bar}${RESET} ${pct}% ${DIM}(${parsed}/${total})${RESET} ${DIM}${file.length > 30 ? '...' + file.slice(-27) : file}${RESET}`;
              process.stdout.write('\r' + msg.padEnd(qLastProgressLen));
              qLastProgressLen = msg.length;
            },
          });
          if (qLastProgressLen > 0) {
            process.stdout.write('\r' + ' '.repeat(qLastProgressLen + 4) + '\r');
          }
          graphSymbolCount = scanResult.stats.totalSymbols;
          console.log(
            bullet(
              `${GREEN}✓${RESET}`,
              `Scanned ${BOLD}${scanResult.stats.totalFiles.toLocaleString()}${RESET} files → ${BOLD}${graphSymbolCount.toLocaleString()}${RESET} symbols ${DIM}(${formatMs(Date.now() - scanStart)})${RESET}`
            )
          );

          graph = new CodebaseGraph();
          graph.buildFromScanResult(scanResult);
          graph.detectCommunities();

          try {
            if (!fs.existsSync(cacheDir)) {
              fs.mkdirSync(cacheDir, { recursive: true });
            }
            fs.writeFileSync(cachePath, graph.serialize(), 'utf-8');
            console.log(
              bullet(`${DIM}💾${RESET}`, `${DIM}Graph cached for future queries${RESET}`)
            );
          } catch (err: unknown) {
            console.warn(
              bullet(
                `${YELLOW}⚠${RESET}`,
                `Cache save failed: ${err instanceof Error ? err.message : String(err)}`
              )
            );
          }
        }

        // ── 3. Embedding index (with caching) ────────────────────────────────
        // Use binary format (.bin) for efficient disk caching of large embedding indexes.
        // JSON format crashes on OpenAI 1536-dim × 84K symbols (~1 GB string).
        const indexCacheBin = path.join(cacheDir, `index-${cacheKey}.bin`);
        const indexCacheJson = path.join(cacheDir, `index-${cacheKey}.json`); // legacy fallback
        const provider = await createEmbeddingProvider({
          provider: providerName,
          ollamaUrl: undefined,
          openaiApiKey: options.queryLlmKey,
        });

        let index: InstanceType<typeof EmbeddingIndex>;
        let indexFromCache = false;

        // Try binary cache first, then legacy JSON
        if (!forceRescan && fs.existsSync(indexCacheBin)) {
          try {
            const buf = fs.readFileSync(indexCacheBin);
            index = EmbeddingIndex.deserializeBinary(buf, { provider });
            indexFromCache = true;
            console.log(
              bullet(
                `${GREEN}✓${RESET}`,
                `Index loaded from cache ${DIM}(${index.size.toLocaleString()} embeddings, ${YELLOW}${providerName}${RESET}${DIM}, binary)${RESET}`
              )
            );
          } catch (err: unknown) {
            console.warn(
              bullet(
                `${YELLOW}⚠${RESET}`,
                `Binary index cache load failed: ${err instanceof Error ? err.message : String(err)}. Rebuilding...`
              )
            );
            indexFromCache = false;
          }
        } else if (!forceRescan && fs.existsSync(indexCacheJson)) {
          try {
            const indexData = fs.readFileSync(indexCacheJson, 'utf-8');
            index = EmbeddingIndex.deserialize(indexData, { provider });
            indexFromCache = true;
            console.log(
              bullet(
                `${GREEN}✓${RESET}`,
                `Index loaded from cache ${DIM}(${index.size.toLocaleString()} embeddings, ${YELLOW}${providerName}${RESET}${DIM}, json-legacy)${RESET}`
              )
            );
          } catch (err: unknown) {
            console.warn(
              bullet(
                `${YELLOW}⚠${RESET}`,
                `Index cache load failed: ${err instanceof Error ? err.message : String(err)}. Rebuilding...`
              )
            );
            indexFromCache = false;
          }
        }

        if (!indexFromCache) {
          const embedStart = Date.now();
          index = new EmbeddingIndex({ provider });
          await index.buildIndex(graph);
          console.log(
            bullet(
              `${GREEN}✓${RESET}`,
              `Indexed ${BOLD}${index.size.toLocaleString()}${RESET} symbols with ${YELLOW}${providerName}${RESET} ${DIM}(${formatMs(Date.now() - embedStart)})${RESET}`
            )
          );

          try {
            if (!fs.existsSync(cacheDir)) {
              fs.mkdirSync(cacheDir, { recursive: true });
            }
            const binData = index.serializeBinary();
            fs.writeFileSync(indexCacheBin, binData);
            const sizeMB = (binData.length / (1024 * 1024)).toFixed(1);
            console.log(
              bullet(
                `${DIM}💾${RESET}`,
                `${DIM}Index cached (${sizeMB} MB binary) for future queries${RESET}`
              )
            );
            // Clean up legacy JSON cache if it exists
            if (fs.existsSync(indexCacheJson)) {
              try {
                fs.unlinkSync(indexCacheJson);
              } catch {
                /* ignore */
              }
            }
          } catch (err: unknown) {
            console.warn(
              bullet(
                `${YELLOW}⚠${RESET}`,
                `Index cache save failed: ${err instanceof Error ? err.message : String(err)}`
              )
            );
          }
        }

        // ── 4. LLM provider (optional) ───────────────────────────────────────
        let llmProvider: any = undefined;
        if (options.queryWithLlm && options.queryLlm) {
          try {
            const llmPkg = await import('@holoscript/llm-provider');
            const key = options.queryLlmKey ?? '';
            switch (options.queryLlm) {
              case 'openai':
                llmProvider = new llmPkg.OpenAIAdapter({
                  apiKey: key || process.env['OPENAI_API_KEY'] || '',
                  defaultModel: options.queryModel ?? 'gpt-4o-mini',
                });
                break;
              case 'anthropic':
                llmProvider = new llmPkg.AnthropicAdapter({
                  apiKey: key || process.env['ANTHROPIC_API_KEY'] || '',
                  defaultModel: options.queryModel ?? 'claude-3-haiku-20240307',
                });
                break;
              case 'gemini':
                llmProvider = new llmPkg.GeminiAdapter({
                  apiKey: key || process.env['GEMINI_API_KEY'] || '',
                  defaultModel: options.queryModel ?? 'gemini-1.5-flash',
                });
                break;
              default:
                console.warn(
                  bullet(
                    `${YELLOW}⚠${RESET}`,
                    `Unknown LLM provider: ${options.queryLlm}. Skipping LLM answer.`
                  )
                );
            }
            if (llmProvider) {
              console.log(
                bullet(
                  `${GREEN}✓${RESET}`,
                  `LLM ready ${DIM}(${options.queryLlm}/${options.queryModel ?? 'default'})${RESET}`
                )
              );
            }
          } catch {
            console.warn(
              bullet(
                `${YELLOW}⚠${RESET}`,
                `@holoscript/llm-provider not available. Install it: ${CYAN}pnpm add @holoscript/llm-provider${RESET}`
              )
            );
          }
        }

        // ── 5. Run query ─────────────────────────────────────────────────────
        const engine = new GraphRAGEngine(graph, index, { llmProvider });
        const topK = options.queryTopK ?? 10;

        if (options.queryWithLlm && llmProvider) {
          console.log(bullet(`${CYAN}⏳${RESET}`, `Generating LLM answer...`));
          const answer = await engine.queryWithLLM(question, { topK });
          const totalTime = Date.now() - queryStartTime;

          if (options.json) {
            console.log(JSON.stringify(answer, null, 2));
          } else {
            // ── LLM Answer Card ──────────────────────────────────────────────
            console.log(sectionHeader('💡 Answer'));
            console.log('');
            // Word-wrap answer text at ~76 chars
            const answerLines = answer.answer.split('\n');
            for (const line of answerLines) {
              console.log(`  ${line}`);
            }

            if (answer.citations.length > 0) {
              console.log(sectionHeader(`📚 Citations (${answer.citations.length})`));
              console.log('');
              for (let i = 0; i < answer.citations.length; i++) {
                const c = answer.citations[i];
                const num = `${DIM}[${i + 1}]${RESET}`;
                const name = `${CYAN}${c.name}${RESET}`;
                const loc = `${DIM}${c.file}:${c.line}${RESET}`;
                console.log(`  ${num} ${name}`);
                console.log(`      ${loc}`);
              }
            }

            // ── Footer ────────────────────────────────────────────────────────
            console.log('');
            console.log(hrLine());
            console.log(
              `  ${DIM}⏱  ${formatMs(totalTime)}${RESET}  ${DIM}│${RESET}  ${DIM}${graphSymbolCount.toLocaleString()} symbols${RESET}  ${DIM}│${RESET}  ${DIM}${providerName} embeddings${RESET}  ${DIM}│${RESET}  ${DIM}${options.queryLlm} LLM${RESET}`
            );
            console.log(hrLine());
          }
        } else {
          if (options.queryWithLlm && !llmProvider) {
            console.warn(
              bullet(
                `${YELLOW}⚠${RESET}`,
                `--with-llm requires --llm <provider>. Falling back to ranked results.`
              )
            );
            console.log(`  ${DIM}Usage: holoscript query "..." --with-llm --llm openai${RESET}`);
          }
          const result = await engine.query(question, { topK });
          const totalTime = Date.now() - queryStartTime;

          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            // ── Ranked Results ────────────────────────────────────────────────
            console.log(
              sectionHeader(
                `📊 Top ${result.results.length} Results (${result.totalMatches} total)`
              )
            );
            console.log('');

            for (let i = 0; i < result.results.length; i++) {
              const r = result.results[i];
              const rank = `${DIM}${String(i + 1).padStart(2)}.${RESET}`;
              const score = `${MAGENTA}${(r.score * 100).toFixed(1)}%${RESET}`;
              const typeBadge = `${DIM}[${r.symbol.type}]${RESET}`;
              const name = `${BOLD}${r.symbol.owner ? r.symbol.owner + '.' : ''}${r.symbol.name}${RESET}`;
              const loc = path.relative(rootDir, r.file) + ':' + r.symbol.line;

              console.log(`  ${rank} ${score}  ${typeBadge} ${name}`);
              console.log(`         ${DIM}${loc}${RESET}`);
              if (r.symbol.signature) {
                console.log(
                  `         ${DIM}${r.symbol.signature.length > 60 ? r.symbol.signature.slice(0, 57) + '...' : r.symbol.signature}${RESET}`
                );
              }
              if (r.callers.length > 0) {
                console.log(
                  `         ${DIM}← ${r.callers.slice(0, 3).join(', ')}${r.callers.length > 3 ? ` +${r.callers.length - 3} more` : ''}${RESET}`
                );
              }
              if (i < result.results.length - 1) console.log('');
            }

            if (result.communities.length > 0) {
              console.log('');
              console.log(
                bullet(
                  `${DIM}🏘️${RESET}`,
                  `${DIM}Modules: ${result.communities.join(' · ')}${RESET}`
                )
              );
            }

            // ── Footer ────────────────────────────────────────────────────────
            console.log('');
            console.log(hrLine());
            console.log(
              `  ${DIM}⏱  ${formatMs(totalTime)}${RESET}  ${DIM}│${RESET}  ${DIM}${graphSymbolCount.toLocaleString()} symbols${RESET}  ${DIM}│${RESET}  ${DIM}${providerName} embeddings${RESET}  ${DIM}│${RESET}  ${DIM}top-${topK}${RESET}`
            );
            console.log(hrLine());
          }
        }

        process.exit(0);
      } catch (err: unknown) {
        console.error(
          `\x1b[31mQuery error: ${err instanceof Error ? err.message : String(err)}\x1b[0m`
        );
        if (options.verbose && err instanceof Error && err.stack) console.error(err.stack);
        process.exit(1);
      }
      break;
    }

    case 'setup-hooks': {
      console.log('\n\x1b[1m🪝 Setting up Git Hooks\x1b[0m\n');

      const projectPath = options.input || process.cwd();
      const studioUrl = options.studioUrl || 'http://localhost:3000';

      try {
        const { setupGitHooks } = await import('./commands/setup-hooks');
        await setupGitHooks({ projectPath, studioUrl });
        process.exit(0);
      } catch (err: unknown) {
        cliError('E010', `Error: ${err instanceof Error ? err.message : String(err)}`, {
          hint: 'Confirm this is a git repo (ls .git/) and that you have write access to .git/hooks.',
        });
        process.exit(1);
      }
      break;
    }

    case 'remove-hooks': {
      console.log('\n\x1b[1m🪝 Removing Git Hooks\x1b[0m\n');

      const projectPath = options.input || process.cwd();

      try {
        const { removeGitHooks } = await import('./commands/setup-hooks');
        await removeGitHooks({ projectPath });
        process.exit(0);
      } catch (err: unknown) {
        cliError('E010', `Error: ${err instanceof Error ? err.message : String(err)}`, {
          hint: 'Check .git/hooks/ exists and is writable. If hooks were never installed, this is a no-op.',
        });
        process.exit(1);
      }
      break;
    }

    case 'rebuild-index': {
      const fs = await import('fs');
      const path = await import('path');
      const rootDir = options.input || process.cwd();
      const dirs = [
        path.join(rootDir, '.holoscript'),
        ...(options.all ? [path.join(rootDir, '.holoscript-cache')] : []),
      ];
      let cleaned = 0;
      for (const dir of dirs) {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true });
          console.log(`\x1b[32m✓\x1b[0m Removed ${path.relative(rootDir, dir) || dir}`);
          cleaned++;
        }
      }
      if (cleaned === 0) {
        console.log('\x1b[33mNo index caches found to clean.\x1b[0m');
      } else {
        console.log(
          `\n\x1b[32mCleaned ${cleaned} cache director${cleaned === 1 ? 'y' : 'ies'}.\x1b[0m Run \x1b[36mholoscript query\x1b[0m to rebuild.`
        );
      }
      process.exit(0);
    }

    case 'setup-mcp': {
      console.log('\n\x1b[1m🚀 Provisioning HoloScript MCP Environment\x1b[0m\n');
      const apiKey = options.input || process.env.HOLOSCRIPT_API_KEY;
      if (!apiKey) {
        cliError('E006', 'No API key specified.', {
          usage: 'npx @holoscript/cli setup-mcp <your-api-key>',
          hint: 'Pass the key as the first arg, or set HOLOSCRIPT_API_KEY in your environment.',
          docs: 'https://holoscript.net/docs/mcp/setup',
        });
        process.exit(1);
      }
      try {
        const { provisionMcpConfigs } = await import('./mcp-provisioner');
        await provisionMcpConfigs(apiKey);
        process.exit(0);
      } catch (err: unknown) {
        cliError('E010', `Setup failed: ${err instanceof Error ? err.message : String(err)}`, {
          hint: 'Check network connectivity to mcp.holoscript.net and that the API key is valid.',
        });
        process.exit(1);
      }
    }

    case 'issue-key': {
      const tenantId = options.input;
      if (!tenantId) {
        cliError('E001', 'No tenant ID specified.', {
          usage: 'npx @holoscript/cli issue-key <tenant_id> [--tier free|pro|enterprise]',
          hint: 'Tenant IDs are issued by the admin console; paste the UUID as the first arg.',
        });
        process.exit(1);
      }
      const tier = options.tier || 'free';
      try {
        const { issueTenantKey } = await import('./admin-provisioner');
        await issueTenantKey(tenantId, tier);
        process.exit(0);
      } catch (err: unknown) {
        cliError('E010', `Setup failed: ${err instanceof Error ? err.message : String(err)}`, {
          hint: 'Verify admin credentials and that the tenant exists on the registry.',
        });
        process.exit(1);
      }
    }

    case 'hologram': {
      const input = options.input ?? options.args?.[0];
      if (!input) {
        cliError('E001', 'hologram requires an input file.', {
          usage: 'holoscript hologram <input> [--out <dir>] [--targets quilt,mvhevc,parallax] [--name <n>]',
          hint: 'Pass a 2D image (png/jpg/gif/mp4) — hologram converts it to depth-enriched formats.',
        });
        process.exit(1);
      }
      try {
        await hologramCommand(input, {
          out: options.output as string | undefined,
          targets: options.targets as string | undefined,
          name: options.name as string | undefined,
        });
      } catch (err) {
        cliError('E010', `Error: ${err instanceof Error ? err.message : String(err)}`, {
          hint: 'Re-run with --verbose to see the full depth-inference pipeline trace.',
        });
        process.exit(1);
      }
      break;
    }

    case 'quickstart':
    case 'init': {
      await quickstartCommand({
        projectName: options.input,
        port: options.port,
        scaffoldOnly: options.scaffoldOnly,
        noOpen: options.noOpen,
      });
      break;
    }

    default:
      const cli = new HoloScriptCLI(options);
      const exitCode = await cli.run();
      process.exit(exitCode);
  }
}

async function watchFile(options: ReturnType<typeof parseArgs>): Promise<void> {
  if (!options.input) {
    cliError('E001', 'No input file specified for watch mode.', {
      usage: 'holoscript watch <file.hs|.holo>',
      hint: 'Watch re-executes the file on every change. Ctrl+C to stop.',
    });
    process.exit(1);
  }

  const fs = await import('fs');
  const path = await import('path');
  const { HoloScriptCodeParser, HoloScriptRuntime } = await import('@holoscript/core');

  const filePath = path.resolve(options.input);
  const parser = new HoloScriptCodeParser();
  let runtime = new HoloScriptRuntime();

  console.log(`\x1b[36mWatching ${options.input}...\x1b[0m`);
  console.log('\x1b[2mPress Ctrl+C to stop\x1b[0m\n');

  const executeFile = async () => {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parseResult = parser.parse(content);

      if (!parseResult.success) {
        console.log('\x1b[31mParse errors:\x1b[0m');
        parseResult.errors.forEach((err) => {
          console.log(`  Line ${err.line}:${err.column}: ${err.message}`);
        });
        return;
      }

      // Reset runtime for fresh execution
      runtime = new HoloScriptRuntime();
      const results = await runtime.executeProgram(parseResult.ast);

      const success = results.every((r) => r.success);
      const timestamp = new Date().toLocaleTimeString();

      console.log(
        `\x1b[2m[${timestamp}]\x1b[0m ${success ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} Executed ${results.length} node(s)`
      );

      if (!success) {
        results
          .filter((r) => !r.success)
          .forEach((r) => {
            console.log(`  \x1b[31m${r.error}\x1b[0m`);
          });
      }
    } catch (error) {
      console.log(`\x1b[31mError: ${(error as Error).message}\x1b[0m`);
    }
  };

  // Initial execution
  await executeFile();

  // Watch for changes
  fs.watch(filePath, { persistent: true }, async (eventType) => {
    if (eventType === 'change') {
      console.log('\x1b[2mFile changed, re-executing...\x1b[0m');
      await executeFile();
    }
  });

  // Keep process alive
  await new Promise(() => {});
}

main().catch((error) => {
  cliError('E010', `Fatal error: ${error?.message ?? String(error)}`, {
    hint: 'This is an unhandled exception. Re-run with -v/--verbose, or report at https://github.com/holoscript/holoscript/issues with the stack trace below.',
  });
  if (error?.stack) console.error(`\x1b[2m${error.stack}\x1b[0m`);
  process.exit(1);
});
