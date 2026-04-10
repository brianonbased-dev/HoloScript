#!/usr/bin/env node
/**
 * HoloScript Linter CLI
 *
 * Command-line interface for linting HoloScript files.
 *
 * Usage:
 *   holoscript-lint [options] <files...>
 *   holoscript-lint src/
 *   holoscript-lint --fix "src/*.holo"
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, resolve } from 'path';
import { HoloScriptLinter, LinterConfig, LintResult } from './index.js';

interface CliOptions {
  fix: boolean;
  config?: string;
  quiet: boolean;
  format: 'stylish' | 'json' | 'compact';
  maxWarnings: number;
  help: boolean;
  version: boolean;
}

const VERSION = '2.0.0';

function printHelp(): void {
  console.log(`
HoloScript Linter v${VERSION}

Usage:
  holoscript-lint [options] <files...>

Options:
  --fix             Automatically fix problems
  --config <path>   Path to config file
  --format <type>   Output format: stylish (default), json, compact
  --max-warnings N  Maximum warnings allowed (default: unlimited)
  --quiet, -q       Suppress output
  --help, -h        Show this help message
  --version, -v     Show version

Examples:
  holoscript-lint src/                       # Lint all files in src/
  holoscript-lint --fix *.holo               # Lint and fix files
  holoscript-lint --format json src/         # JSON output
`);
}

function parseArgs(args: string[]): { options: CliOptions; files: string[] } {
  const options: CliOptions = {
    fix: false,
    quiet: false,
    format: 'stylish',
    maxWarnings: -1,
    help: false,
    version: false,
  };
  const files: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--fix':
        options.fix = true;
        break;
      case '--config':
        options.config = args[++i];
        break;
      case '--format':
        options.format = args[++i] as 'stylish' | 'json' | 'compact';
        break;
      case '--max-warnings':
        options.maxWarnings = parseInt(args[++i], 10);
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

function loadConfig(configPath?: string): Partial<LinterConfig> {
  if (!configPath) {
    const defaultPaths = [
      '.holoscriptlintrc',
      '.holoscriptlintrc.json',
      'holoscript-lint.config.json',
    ];
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

function formatStylish(results: LintResult[]): string {
  const lines: string[] = [];

  for (const result of results) {
    if (result.diagnostics.length === 0) continue;

    lines.push(`\n${result.filePath}`);

    for (const d of result.diagnostics) {
      const severity = d.severity === 'error' ? '\x1b[31merror\x1b[0m' : '\x1b[33mwarning\x1b[0m';
      lines.push(`  ${d.line}:${d.column}  ${severity}  ${d.message}  ${d.ruleId}`);
    }
  }

  const totalErrors = results.reduce((sum, r) => sum + r.errorCount, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warningCount, 0);

  if (totalErrors > 0 || totalWarnings > 0) {
    lines.push(
      `\n\x1b[1m✖ ${totalErrors + totalWarnings} problems (${totalErrors} errors, ${totalWarnings} warnings)\x1b[0m`
    );
  }

  return lines.join('\n');
}

function formatJson(results: LintResult[]): string {
  return JSON.stringify(results, null, 2);
}

function formatCompact(results: LintResult[]): string {
  const lines: string[] = [];

  for (const result of results) {
    for (const d of result.diagnostics) {
      lines.push(
        `${result.filePath}:${d.line}:${d.column}: ${d.severity} - ${d.message} (${d.ruleId})`
      );
    }
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { options, files: inputFiles } = parseArgs(args);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.version) {
    console.log(`holoscript-lint v${VERSION}`);
    process.exit(0);
  }

  if (inputFiles.length === 0) {
    console.error('No files specified. Use --help for usage.');
    process.exit(1);
  }

  const config = loadConfig(options.config);
  const linter = new HoloScriptLinter(config);
  const files = collectFiles(inputFiles);

  if (files.length === 0) {
    console.error('No .holo or .hsplus files found.');
    process.exit(1);
  }

  const results: LintResult[] = [];

  for (const file of files) {
    try {
      const source = readFileSync(file, 'utf-8');
      const result = linter.lint(source, file);
      results.push(result);
    } catch (error) {
      console.error(`${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Format output
  if (!options.quiet) {
    let output: string;
    switch (options.format) {
      case 'json':
        output = formatJson(results);
        break;
      case 'compact':
        output = formatCompact(results);
        break;
      default:
        output = formatStylish(results);
    }
    console.log(output);
  }

  // Determine exit code
  const totalErrors = results.reduce((sum, r) => sum + r.errorCount, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warningCount, 0);

  if (totalErrors > 0) {
    process.exit(1);
  }

  if (options.maxWarnings >= 0 && totalWarnings > options.maxWarnings) {
    console.error(`\nToo many warnings: ${totalWarnings} (max: ${options.maxWarnings})`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
