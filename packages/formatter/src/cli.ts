#!/usr/bin/env node
/**
 * HoloScript Formatter CLI
 *
 * Command-line interface for formatting HoloScript files.
 *
 * Usage:
 *   holoscript-format [options] <files...>
 *   holoscript-format --check src/
 *   holoscript-format --write "src/*.holo"
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, resolve } from 'path';
import { HoloScriptFormatter, FormatterConfig } from './index.js';

interface CliOptions {
  check: boolean;
  write: boolean;
  config?: string;
  quiet: boolean;
  help: boolean;
  version: boolean;
}

const VERSION = '2.0.0';

function printHelp(): void {
  console.log(`
HoloScript Formatter v${VERSION}

Usage:
  holoscript-format [options] <files...>

Options:
  --check, -c       Check if files are formatted (exit 1 if not)
  --write, -w       Write formatted output to files
  --config <path>   Path to config file
  --quiet, -q       Suppress output
  --help, -h        Show this help message
  --version, -v     Show version

Examples:
  holoscript-format src/                     # Format all files in src/
  holoscript-format --check *.holo           # Check formatting
  holoscript-format --write src/**/*.hsplus  # Format and write files
`);
}

function parseArgs(args: string[]): { options: CliOptions; files: string[] } {
  const options: CliOptions = {
    check: false,
    write: false,
    quiet: false,
    help: false,
    version: false,
  };
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--check':
      case '-c':
        options.check = true;
        break;
      case '--write':
      case '-w':
        options.write = true;
        break;
      case '--config':
        options.config = args[++i];
        break;
      case '--quiet':
      case '-q':
        options.quiet = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--version':
      case '-v':
        options.version = true;
        break;
      default:
        if (!arg.startsWith('-')) {
          files.push(arg);
        }
    }
  }

  return { options, files };
}

function loadConfig(configPath?: string): Partial<FormatterConfig> {
  if (!configPath) {
    // Try to find config in current directory
    const defaultPaths = ['.holoscriptrc', '.holoscriptrc.json', 'holoscript.config.json'];
    for (const p of defaultPaths) {
      if (existsSync(p)) {
        configPath = p;
        break;
      }
    }
  }

  if (configPath && existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Error loading config from ${configPath}:`, error);
    }
  }

  return {};
}

function getFileType(filePath: string): 'holo' | 'hsplus' {
  const ext = extname(filePath).toLowerCase();
  return ext === '.hsplus' ? 'hsplus' : 'holo';
}

function collectFiles(paths: string[]): string[] {
  const files: string[] = [];
  const validExtensions = ['.holo', '.hsplus'];

  function walk(dir: string): void {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
        walk(fullPath);
      } else if (stat.isFile() && validExtensions.includes(extname(entry).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }

  for (const p of paths) {
    const resolved = resolve(p);
    if (!existsSync(resolved)) {
      console.error(`Path not found: ${p}`);
      continue;
    }

    const stat = statSync(resolved);
    if (stat.isDirectory()) {
      walk(resolved);
    } else if (validExtensions.includes(extname(resolved).toLowerCase())) {
      files.push(resolved);
    }
  }

  return files;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { options, files: inputFiles } = parseArgs(args);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.version) {
    console.log(`holoscript-format v${VERSION}`);
    process.exit(0);
  }

  if (inputFiles.length === 0) {
    console.error('No files specified. Use --help for usage.');
    process.exit(1);
  }

  const config = loadConfig(options.config);
  const formatter = new HoloScriptFormatter(config);
  const files = collectFiles(inputFiles);

  if (files.length === 0) {
    console.error('No .holo or .hsplus files found.');
    process.exit(1);
  }

  let hasErrors = false;
  let formattedCount = 0;
  let unchangedCount = 0;

  for (const file of files) {
    try {
      const source = readFileSync(file, 'utf-8');
      const fileType = getFileType(file);
      const result = formatter.format(source, fileType);

      if (result.errors.length > 0) {
        console.error(`${file}: ${result.errors.length} error(s)`);
        for (const error of result.errors) {
          console.error(`  Line ${error.line}: ${error.message}`);
        }
        hasErrors = true;
        continue;
      }

      if (result.changed) {
        if (options.check) {
          if (!options.quiet) {
            console.log(`${file}: needs formatting`);
          }
          hasErrors = true;
        } else if (options.write) {
          writeFileSync(file, result.formatted, 'utf-8');
          if (!options.quiet) {
            console.log(`${file}: formatted`);
          }
        } else {
          // Print to stdout
          process.stdout.write(result.formatted);
        }
        formattedCount++;
      } else {
        unchangedCount++;
        if (!options.quiet && !options.check) {
          console.log(`${file}: already formatted`);
        }
      }
    } catch (error) {
      console.error(`${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      hasErrors = true;
    }
  }

  if (!options.quiet) {
    console.log(
      `\nProcessed ${files.length} file(s): ${formattedCount} formatted, ${unchangedCount} unchanged`
    );
  }

  process.exit(hasErrors ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
