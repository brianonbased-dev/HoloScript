import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { extname, join, relative, resolve } from 'path';
import {
  ConfigLoader,
  HoloScriptFormatter,
  getHoloScriptFileType,
  type HoloScriptFileType,
} from '@holoscript/formatter';
import type { CLIOptions } from '../args';

const VALID_EXTENSIONS = new Set(['.hs', '.holo', '.hsplus']);
const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'coverage']);

export function getFormatterFileType(filePath: string): HoloScriptFileType {
  return getHoloScriptFileType(filePath);
}

export function collectHoloScriptFormatFiles(paths: string[]): {
  files: string[];
  missing: string[];
} {
  const files = new Set<string>();
  const missing: string[] = [];

  const walk = (dir: string): void => {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (!entry.startsWith('.') && !SKIP_DIRECTORIES.has(entry)) {
          walk(fullPath);
        }
        continue;
      }

      if (stat.isFile() && VALID_EXTENSIONS.has(extname(entry).toLowerCase())) {
        files.add(fullPath);
      }
    }
  };

  for (const inputPath of paths) {
    const resolved = resolve(inputPath);
    if (!existsSync(resolved)) {
      missing.push(inputPath);
      continue;
    }

    const stat = statSync(resolved);
    if (stat.isDirectory()) {
      walk(resolved);
    } else if (stat.isFile() && VALID_EXTENSIONS.has(extname(resolved).toLowerCase())) {
      files.add(resolved);
    }
  }

  return { files: [...files].sort(), missing };
}

export async function fmtCommand(options: CLIOptions): Promise<number> {
  const paths = options.args?.length ? options.args : options.input ? [options.input] : [];

  if (paths.length === 0) {
    console.error('fmt requires at least one file or directory.');
    console.error('Usage: holo fmt <file-or-dir...> [--check|--write] [--config <path>]');
    return 1;
  }

  const { files, missing } = collectHoloScriptFormatFiles(paths);
  for (const missingPath of missing) {
    console.error(`Path not found: ${missingPath}`);
  }

  if (files.length === 0) {
    console.error('No .hs, .holo, or .hsplus files found.');
    return 1;
  }

  const configLoader = new ConfigLoader();
  const config = options.configPath
    ? configLoader.loadConfigFromFile(resolve(options.configPath))
    : configLoader.loadConfig(files[0] ?? process.cwd());
  const formatter = new HoloScriptFormatter(config);
  let hasErrors = missing.length > 0;
  let changed = 0;
  let unchanged = 0;

  for (const file of files) {
    try {
      const source = readFileSync(file, 'utf-8');
      const result = formatter.format(source, getFormatterFileType(file));
      const displayPath = relative(process.cwd(), file) || file;

      if (result.errors.length > 0) {
        hasErrors = true;
        console.error(`${displayPath}: ${result.errors.length} formatter error(s)`);
        for (const error of result.errors) {
          console.error(`  Line ${error.line}:${error.column}: ${error.message}`);
        }
        continue;
      }

      if (result.changed) {
        changed++;
        if (options.check) {
          hasErrors = true;
          if (!options.quiet) {
            console.log(`${displayPath}: needs formatting`);
          }
        } else if (options.write) {
          writeFileSync(file, result.formatted, 'utf-8');
          if (!options.quiet) {
            console.log(`${displayPath}: formatted`);
          }
        } else {
          process.stdout.write(result.formatted);
        }
      } else {
        unchanged++;
        if (!options.check && !options.write) {
          process.stdout.write(result.formatted);
        } else if (options.write && !options.quiet) {
          console.log(`${displayPath}: already formatted`);
        }
      }
    } catch (error) {
      hasErrors = true;
      console.error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!options.quiet && (options.check || options.write)) {
    const action = options.check ? 'Checked' : 'Processed';
    console.log(`${action} ${files.length} file(s): ${changed} changed, ${unchanged} unchanged`);
  }

  return hasErrors ? 1 : 0;
}
