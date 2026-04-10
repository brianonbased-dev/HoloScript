/**
 * HoloScript CLI main class
 */

import {
  HoloScriptParser,
  HoloScriptRuntime,
  enableConsoleLogging,
  parseHolo,
} from '@holoscript/core';
import type { CLIOptions } from './args';
import { formatAST, formatResult, formatError } from './formatters';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { exec } from 'child_process';
import { ConfigLoader } from './config/loader';
import { HoloScriptConfig } from './config/schema';
import { importUnity } from './importers/unity-importer';
import { importGodot } from './importers/godot-importer';
import { importGltfToFile } from './importers/gltf-importer';

export class HoloScriptCLI {
  private parser: HoloScriptParser;
  private runtime: HoloScriptRuntime;
  private options: CLIOptions;
  private config: HoloScriptConfig | null = null;

  constructor(options: CLIOptions) {
    this.options = options;
    this.parser = new HoloScriptParser();
    this.runtime = new HoloScriptRuntime();

    if (options.verbose) {
      enableConsoleLogging();
    }
  }

  async run(): Promise<number> {
    try {
      // Load configuration from file if it exists
      this.config = await ConfigLoader.findAndLoad();

      if (this.options.verbose && this.config) {
        console.log(`\x1b[2m[TRACE] Loaded configuration from holoscript.config.json\x1b[0m`);
        if (this.config.extends) {
          console.log(
            `\x1b[2m[TRACE] Configuration extends: ${JSON.stringify(this.config.extends)}\x1b[0m`
          );
        }
      }

      switch (this.options.command) {
        case 'parse':
          return this.parseCommand();
        case 'run':
          return this.runCommand();
        case 'ast':
          return this.astCommand();
        case 'repl':
          return this.replCommand();
        case 'import':
          return this.importCommand();
        case 'visualize':
          return this.visualizeCommand();
        default:
          return 0;
      }
    } catch (error) {
      console.error(formatError(error as Error));
      return 1;
    }
  }

  private parseCommand(): number {
    const content = this.readInput();
    if (!content) return 1;

    const voiceCommand = {
      command: content,
      confidence: 1.0,
      timestamp: Date.now(),
    };

    const ast = this.parser.parseVoiceCommand(voiceCommand);

    if (ast.length === 0) {
      console.log('No valid AST nodes generated from input.');
      return 1;
    }

    console.log(`Parsed ${ast.length} node(s) successfully.`);

    if (this.options.verbose) {
      console.log('\n' + formatAST(ast, { json: this.options.json }));
    }

    return 0;
  }

  private async runCommand(): Promise<number> {
    const content = this.readInput();
    if (!content) return 1;

    let ast: any[];

    // Use composition parser for .holo files
    if (this.options.input?.endsWith('.holo')) {
      const result = parseHolo(content);
      if (result.errors.length > 0) {
        console.error('Parse errors:');
        for (const error of result.errors) {
          console.error(`  ${error.message} at line ${error.line}:${error.column}`);
        }
        return 1;
      }
      ast = result.ast ? [result.ast] : [];
    } else {
      const voiceCommand = {
        command: content,
        confidence: 1.0,
        timestamp: Date.now(),
      };
      ast = this.parser.parseVoiceCommand(voiceCommand);
    }

    if (ast.length === 0) {
      console.log('No valid AST nodes to execute.');
      return 1;
    }

    const results = await this.runtime.executeProgram(ast);
    const allSuccessful = results.every((r) => r.success);
    const lastResult = results[results.length - 1];

    if (this.options.json) {
      const output = JSON.stringify({ results, success: allSuccessful }, null, 2);
      if (this.options.output) {
        this.writeOutput(output);
      } else {
        console.log(output);
      }
    } else {
      console.log(`Executed ${results.length} node(s)`);
      console.log(`Status: ${allSuccessful ? 'SUCCESS' : 'FAILED'}`);
      if (lastResult) {
        console.log('\n' + formatResult(lastResult, { json: false }));
      }
    }

    return allSuccessful ? 0 : 1;
  }

  private astCommand(): number {
    const content = this.readInput();
    if (!content) return 1;

    const voiceCommand = {
      command: content,
      confidence: 1.0,
      timestamp: Date.now(),
    };

    const ast = this.parser.parseVoiceCommand(voiceCommand);
    const output = formatAST(ast, { json: true });

    if (this.options.output) {
      this.writeOutput(output);
      console.log(`AST written to ${this.options.output}`);
    } else {
      console.log(output);
    }

    return 0;
  }

  private readInput(): string | null {
    if (!this.options.input) {
      console.error('Error: No input file specified.');
      return null;
    }

    const filePath = path.resolve(this.options.input);

    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      return null;
    }

    return fs.readFileSync(filePath, 'utf-8');
  }

  private writeOutput(content: string): void {
    if (!this.options.output) return;

    const outputPath = path.resolve(this.options.output);
    const dir = path.dirname(outputPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, content, 'utf-8');
  }

  private async replCommand(): Promise<number> {
    console.log('HoloScript REPL v2.5.0');
    console.log('Type HoloScript commands to execute. Type "exit" or Ctrl+C to quit.\n');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'holoscript> ',
    });

    rl.prompt();

    return new Promise((resolve) => {
      rl.on('line', async (line) => {
        const input = line.trim();

        if (input === 'exit' || input === 'quit') {
          console.log('Goodbye!');
          rl.close();
          resolve(0);
          return;
        }

        if (!input) {
          rl.prompt();
          return;
        }

        try {
          const voiceCommand = {
            command: input,
            confidence: 1.0,
            timestamp: Date.now(),
          };

          const ast = this.parser.parseVoiceCommand(voiceCommand);

          if (ast.length === 0) {
            console.log('No valid nodes parsed.');
          } else {
            if (this.options.showAST) {
              console.log(formatAST(ast, { json: this.options.json }));
            }

            const results = await this.runtime.executeProgram(ast);
            for (const result of results) {
              if (result.success) {
                console.log(`✓ ${result.output || 'OK'}`);
              } else {
                console.log(`✗ ${result.error || 'Error'}`);
              }
            }
          }
        } catch (error) {
          console.error(formatError(error as Error));
        }

        rl.prompt();
      });

      rl.on('close', () => {
        resolve(0);
      });
    });
  }

  private async importCommand(): Promise<number> {
    if (!this.options.input) {
      console.error('Error: No input file specified.');
      console.error('Usage: holo import <file> --from <unity|godot|gltf> [--output <file>]');
      return 1;
    }

    const inputPath = path.resolve(this.options.input);
    if (!fs.existsSync(inputPath)) {
      console.error(`Error: File not found: ${inputPath}`);
      return 1;
    }

    // Auto-detect source from file extension if not specified
    let source = this.options.importSource;
    if (!source) {
      const ext = path.extname(inputPath).toLowerCase();
      if (ext === '.unity' || ext === '.prefab') {
        source = 'unity';
      } else if (ext === '.tscn' || ext === '.escn') {
        source = 'godot';
      } else if (ext === '.gltf' || ext === '.glb') {
        source = 'gltf';
      } else {
        console.error(
          `Error: Cannot detect import source for ${ext}. Use --from <unity|godot|gltf>`
        );
        return 1;
      }
    }

    // Determine output path
    const outputPath = this.options.output
      ? path.resolve(this.options.output)
      : inputPath.replace(/\.[^.]+$/, '.holo');

    console.log(`Importing ${source} file: ${inputPath}`);

    try {
      let result: {
        success: boolean;
        sceneName: string;
        objectCount: number;
        errors: string[];
        warnings: string[];
      };
      switch (source) {
        case 'unity':
          result = await importUnity({
            inputPath,
            outputPath,
            sceneName: this.options.sceneName,
          });
          break;
        case 'godot':
          result = await importGodot({
            inputPath,
            outputPath,
            sceneName: this.options.sceneName,
          });
          break;
        case 'gltf':
          try {
            importGltfToFile(inputPath, outputPath);
            const sceneName =
              this.options.sceneName || path.basename(inputPath, path.extname(inputPath));
            result = {
              success: true,
              sceneName,
              objectCount: -1, // Unknown count
              errors: [],
              warnings: [],
            };
          } catch (err) {
            result = {
              success: false,
              sceneName: '',
              objectCount: 0,
              errors: [err instanceof Error ? err.message : String(err)],
              warnings: [],
            };
          }
          break;
        default:
          console.error(`Error: Unknown import source: ${source}`);
          return 1;
      }

      if (result.success) {
        console.log(`✓ Successfully imported to: ${outputPath}`);
        console.log(`  Scene: ${result.sceneName}`);
        console.log(`  Objects: ${result.objectCount}`);
        if (result.warnings.length > 0) {
          console.log(`  Warnings: ${result.warnings.length}`);
          for (const warning of result.warnings) {
            console.log(`    - ${warning}`);
          }
        }
        return 0;
      } else {
        console.error(`✗ Import failed:`);
        for (const error of result.errors) {
          console.error(`  - ${error}`);
        }
        return 1;
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
  }

  private async visualizeCommand(): Promise<number> {
    const content = this.readInput();
    if (!content) return 1;

    console.log('🚀 HoloScript Visualizer');
    console.log('========================');
    console.log('');

    let ast: any[];

    // Use composition parser for .holo files
    if (this.options.input?.endsWith('.holo')) {
      const result = parseHolo(content);
      if (result.errors.length > 0) {
        console.error('Parse errors:');
        for (const error of result.errors) {
          console.error(`  ${error.message} at line ${error.line}:${error.column}`);
        }
        return 1;
      }
      ast = result.ast ? [result.ast] : [];
    } else {
      const voiceCommand = {
        command: content,
        confidence: 1.0,
        timestamp: Date.now(),
      };
      ast = this.parser.parseVoiceCommand(voiceCommand);
    }

    if (ast.length === 0) {
      console.log('No valid AST nodes to visualize.');
      return 1;
    }

    console.log(`✓ Parsed ${ast.length} node(s)`);

    // Start the WebSocket server
    this.runtime.startVisualizationServer(8080);
    console.log(`✓ WebSocket server started on port 8080`);

    // Execute the script to populate the runtime
    console.log(`✓ Executing script...`);
    const results = await this.runtime.executeProgram(ast);
    const allSuccessful = results.every((r) => r.success);

    if (!allSuccessful) {
      console.log('⚠️  Some nodes failed to execute');
    } else {
      console.log(`✓ Execution complete`);
    }

    // Determine visualizer client path
    const visualizerPath = path.join(__dirname, '../../visualizer-client');

    console.log('');
    console.log('Starting visualizer client...');
    console.log('');
    console.log('  WebSocket: ws://localhost:8080');
    console.log('  Visualizer: http://localhost:5173');
    console.log('');
    console.log('Press Ctrl+C to stop.');

    // Open browser after a delay
    setTimeout(() => {
      const url = 'http://localhost:5173';
      const start =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'start'
            : 'xdg-open';
      exec(`${start} ${url}`);
    }, 2000);

    // Start the Vite dev server for the visualizer client
    return new Promise((resolve) => {
      const server = exec('npm run dev', {
        cwd: visualizerPath,
      });

      server.stdout?.on('data', (data) => {
        process.stdout.write(data);
      });

      server.stderr?.on('data', (data) => {
        process.stderr.write(data);
      });

      server.on('exit', (code) => {
        resolve(code || 0);
      });

      // Handle Ctrl+C
      process.on('SIGINT', () => {
        console.log('\n\nShutting down visualizer...');
        server.kill();
        process.exit(0);
      });
    });
  }
}
