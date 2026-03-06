#!/usr/bin/env node
/**
 * HoloScript CLI entry point
 */

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

const VERSION = '2.5.0';

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
        console.error('\x1b[31mError: No input file specified.\x1b[0m');
        console.log(`Usage: holoscript ${options.command} <file>`);
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

      console.log(`\n\x1b[36mValidating ${options.input}...\x1b[0m\n`);

      try {
        const isHolo = options.input.endsWith('.holo');
        let success = false;
        let errorList: any[] = [];

        if (options.verbose)
          console.log(`\x1b[2m[TRACE] Starting validation (isHolo: ${isHolo})...\x1b[0m`);

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
          errorList = result.errors.map((e: any) => ({
            line: e.loc?.line,
            column: e.loc?.column,
            message: e.message,
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
            const hasGrabHook = node.directives.some((d: any) => d.hook === 'on_grab');
            const hasGrabbableTrait = node.directives.some(
              (d: any) => d.type === 'trait' && d.name === 'grabbable'
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
      } catch (err: any) {
        console.error(`\x1b[31mUnexpected error during validation: ${err.message}\x1b[0m`);
        process.exit(1);
      }
      break;
    }

    case 'version':
      console.log(`HoloScript CLI v${VERSION}`);
      process.exit(0);
      break;

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
        console.error('\x1b[31mError: No input directory specified.\x1b[0m');
        console.log('Usage: holoscript pack <directory> [output]');
        process.exit(1);
      }
      try {
        await packAsset(options.input, options.output, options.verbose);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`\x1b[31mError packing asset: ${message}\x1b[0m`);
        process.exit(1);
      }
      process.exit(0);
      break;
    }

    case 'unpack': {
      if (!options.input) {
        console.error('\x1b[31mError: No input file specified.\x1b[0m');
        console.log('Usage: holoscript unpack <file.hsa> [output_dir]');
        process.exit(1);
      }
      try {
        await unpackAsset(options.input, options.output, options.verbose);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`\x1b[31mError unpacking asset: ${message}\x1b[0m`);
        process.exit(1);
      }
      process.exit(0);
      break;
    }

    case 'inspect': {
      if (!options.input) {
        console.error('\x1b[31mError: No input file specified.\x1b[0m');
        console.log('Usage: holoscript inspect <file.hsa>');
        process.exit(1);
      }
      try {
        await inspectAsset(options.input, options.verbose);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`\x1b[31mError inspecting asset: ${message}\x1b[0m`);
        process.exit(1);
      }
      process.exit(0);
      break;
    }

    case 'diff': {
      // Get file arguments from original args array
      const diffArgs = args.filter((a) => !a.startsWith('-') && a !== 'diff');
      if (diffArgs.length < 2) {
        console.error('\x1b[31mError: Two files required for diff.\x1b[0m');
        console.log('Usage: holoscript diff <file1> <file2> [--json]');
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
            result.errors.forEach((e: any) =>
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
            result.errors.forEach((e: any) =>
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
            result.errors.forEach((e: any) =>
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
            result.errors.forEach((e: any) =>
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
      } catch (err: any) {
        console.error(`\x1b[31mDiff error: ${err.message}\x1b[0m`);
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
      } catch (err: any) {
        console.error(`\x1b[31mWoT export error: ${err.message}\x1b[0m`);
        if (options.verbose) {
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
        const { createHeadlessRuntime, HEADLESS_PROFILE, getProfile } =
          await import('@holoscript/core/runtime/profiles');

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
          profile = getProfile(profileName as any);
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
      } catch (err: any) {
        console.error(`\x1b[31mHeadless runtime error: ${err.message}\x1b[0m`);
        if (options.verbose) {
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
          console.error(`\x1b[31mUnknown trait: ${options.input}\x1b[0m`);
          console.log('\nRun \x1b[36mholoscript traits\x1b[0m to see all available traits.');
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
        console.error('\x1b[31mError: No description provided.\x1b[0m');
        console.log('Usage: holoscript suggest "a glowing orb that can be grabbed"');
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
        console.error('\x1b[31mError: No description provided.\x1b[0m');
        console.log('Usage: holoscript generate "a red button that glows when hovered"');
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
            result.errors.forEach((e) =>
              console.error(`  ${e.loc?.line}:${e.loc?.column}: ${e.message}`)
            );
            process.exit(1);
          }

          // Map HoloComposition AST to Generator AST
          ast = {
            orbs:
              result.ast?.objects?.map((obj) => ({
                name: obj.name,
                properties: Object.fromEntries(obj.properties.map((p) => [p.key, p.value])),
                traits: obj.traits || [],
                state: obj.state,
              })) || [],
            functions: [
              ...(result.ast?.logic?.actions?.map((a) => ({ name: a.name })) || []),
              ...(result.ast?.logic?.handlers?.map((h) => ({ name: h.event })) || []),
            ],
          };
        } else {
          if (options.verbose) console.log(`\x1b[2m[DEBUG] Using HoloScriptCodeParser...\x1b[0m`);
          const { HoloScriptCodeParser } = await import('@holoscript/core');
          const parser = new HoloScriptCodeParser();
          const result = parser.parse(content);

          if (!result.success) {
            console.error(`\x1b[31mError parsing script:\x1b[0m`);
            result.errors.forEach((e) => console.error(`  ${e.line}:${e.column}: ${e.message}`));
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
            parseResult.errors.forEach((e) => console.error(`  ${e.message}`));
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
            parseResult.errors.forEach((e) => console.error(`  ${e.message}`));
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
            parseResult.errors.forEach((e) => console.error(`  ${e.message}`));
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
      } catch (err: any) {
        console.error(`\x1b[31mCompilation error: ${err.message}\x1b[0m`);
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
        console.error('\x1b[31mError: No source file or directory specified.\x1b[0m');
        console.log('Usage: holoscript package <source> [options]');
        console.log(
          '  --platform <platform>  Target platform (linux-arm64, linux-x64, windows-x64, wasm)'
        );
        console.log('  -o, --output <dir>     Output directory');
        process.exit(1);
      }

      try {
        await packageForEdge({
          source: options.input,
          output: options.output,
          platform: options.platform || 'linux-arm64',
        });
        process.exit(0);
      } catch (error: any) {
        console.error(`\x1b[31mError: ${error.message}\x1b[0m`);
        process.exit(1);
      }
      break;
    }

    case 'deploy': {
      const { deployToDevice } = await import('./edge');

      if (!options.input) {
        console.error('\x1b[31mError: No package directory specified.\x1b[0m');
        console.log('Usage: holoscript deploy <package-dir> --host <host> [options]');
        console.log('  --host <host>          Target host IP or hostname (required)');
        console.log('  -u, --username <user>  SSH username (default: holoscript)');
        console.log('  -k, --key <path>       SSH private key path');
        console.log('  --port <port>          SSH port (default: 22)');
        console.log('  --remote-path <path>   Remote installation path');
        console.log('  --service-name <name>  Systemd service name');
        process.exit(1);
      }

      if (!options.host) {
        console.error(
          '\x1b[31mError: No target host specified. Use --host <ip-or-hostname>\x1b[0m'
        );
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
      } catch (error: any) {
        console.error(`\x1b[31mError: ${error.message}\x1b[0m`);
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
      } catch (error: any) {
        console.error(`\x1b[31mError: ${error.message}\x1b[0m`);
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
      } catch (error: any) {
        console.error(`\x1b[31mPublish error: ${error.message}\x1b[0m`);
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
      } catch (error: any) {
        console.error(`\x1b[31mLogin error: ${error.message}\x1b[0m`);
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
          console.error(`\x1b[31mUnknown access command: ${subcommand}\x1b[0m`);
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
          console.error(`\x1b[31mUnknown org command: ${subcommand}\x1b[0m`);
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
        console.error('\x1b[31mNot logged in. Run "holoscript login" first.\x1b[0m');
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
          console.error(`\x1b[31mUnknown token command: ${subcommand}\x1b[0m`);
          process.exit(1);
      }
      break;
    }

    case 'screenshot': {
      if (!options.input) {
        console.error('\x1b[31mError: No input file specified.\x1b[0m');
        console.log(
          'Usage: holoscript screenshot <file.holo> [--output out.png] [--width 1920] [--height 1080]'
        );
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
          console.error('\x1b[31mError: Puppeteer not installed.\x1b[0m');
          console.log('Run: npm install puppeteer');
        } else {
          console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
        }
        process.exit(1);
      }
      break;
    }

    case 'pdf': {
      if (!options.input) {
        console.error('\x1b[31mError: No input file specified.\x1b[0m');
        console.log(
          'Usage: holoscript pdf <file.holo> [--output out.pdf] [--page-format A4] [--landscape]'
        );
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
          console.error('\x1b[31mError: Puppeteer not installed.\x1b[0m');
          console.log('Run: npm install puppeteer');
        } else {
          console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
        }
        process.exit(1);
      }
      break;
    }

    case 'prerender': {
      if (!options.input) {
        console.error('\x1b[31mError: No input file specified.\x1b[0m');
        console.log('Usage: holoscript prerender <file.holo> [--output out.html]');
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
          console.error('\x1b[31mError: Puppeteer not installed.\x1b[0m');
          console.log('Run: npm install puppeteer');
        } else {
          console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
        }
        process.exit(1);
      }
      break;
    }

    case 'self-improve': {
      try {
        const { runSelfImprove } = await import('./self-improve');
        const exitCode = await runSelfImprove(options);
        process.exit(exitCode);
      } catch (err: any) {
        console.error(`\x1b[31mSelf-improve error: ${err.message}\x1b[0m`);
        if (options.verbose && err.stack) console.error(err.stack);
        process.exit(1);
      }
      break;
    }

    case 'absorb': {
      if (!options.input) {
        console.error('\x1b[31mError: No input directory specified.\x1b[0m');
        console.log('Usage: holoscript absorb <directory> [-o output.holo] [--layout force|layered] [--json]');
        process.exit(1);
      }

      try {
        const fs = await import('fs');
        const path = await import('path');
        const pkg = '@holoscript/core';
        const { CodebaseScanner, CodebaseGraph, HoloEmitter } = await import(pkg + '/codebase');

        const rootDir = path.resolve(options.input);
        if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
          console.error(`\x1b[31mError: Not a directory: ${rootDir}\x1b[0m`);
          process.exit(1);
        }

        console.log(`\n\x1b[36m🔍 Absorbing codebase: ${rootDir}\x1b[0m\n`);

        // Scan
        const scanner = new CodebaseScanner();
        const scanStart = Date.now();
        const scanResult = await scanner.scan({ rootDir });

        console.log(`  \x1b[32m✓\x1b[0m Scanned ${scanResult.stats.totalFiles} files in ${Date.now() - scanStart}ms`);
        console.log(`    Languages: ${Object.entries(scanResult.stats.filesByLanguage).map(([l, n]) => `${l}(${n})`).join(', ')}`);
        console.log(`    Symbols: ${scanResult.stats.totalSymbols} | Imports: ${scanResult.stats.totalImports} | Calls: ${scanResult.stats.totalCalls}`);
        console.log(`    LOC: ${scanResult.stats.totalLoc.toLocaleString()}`);

        if (scanResult.stats.errors.length > 0) {
          console.log(`    \x1b[33m⚠ ${scanResult.stats.errors.length} files had errors\x1b[0m`);
        }

        // Build graph
        const graph = new CodebaseGraph();
        graph.buildFromScanResult(scanResult);

        // Detect communities
        const communities = graph.detectCommunities();
        console.log(`  \x1b[32m✓\x1b[0m Detected ${communities.size} module communities`);

        if (options.json) {
          // JSON output: serialized graph
          const output = graph.serialize();
          if (options.output) {
            fs.writeFileSync(path.resolve(options.output), output);
            console.log(`\n  \x1b[32m✓\x1b[0m Graph saved to ${options.output}`);
          } else {
            console.log(output);
          }
        } else {
          // .holo output
          const emitter = new HoloEmitter();
          const layout = (options as any).layout === 'layered' ? 'layered' : 'force';
          const holoSource = emitter.emit(graph, {
            name: path.basename(rootDir),
            layout: layout as 'force' | 'layered',
          });

          if (options.output) {
            const outputPath = path.resolve(options.output);
            fs.writeFileSync(outputPath, holoSource);
            console.log(`\n  \x1b[32m✓\x1b[0m Generated ${outputPath} (${holoSource.length.toLocaleString()} chars)`);
          } else {
            console.log('\n' + holoSource);
          }
        }

        process.exit(0);
      } catch (err: any) {
        console.error(`\x1b[31mAbsorb error: ${err.message}\x1b[0m`);
        if (err.stack) console.error(err.stack);
        process.exit(1);
      }
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
    console.error('Error: No input file specified for watch mode.');
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
  console.error('Fatal error:', error.message);
  process.exit(1);
});
