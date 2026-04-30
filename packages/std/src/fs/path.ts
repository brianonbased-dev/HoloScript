/**
 * @holoscript/fs - Path Module
 *
 * Cross-platform path manipulation utilities for HoloScript Plus.
 */

import * as nodePath from 'path';

/**
 * Path separator for the current platform
 */
export const sep = nodePath.sep;

/**
 * Path delimiter for environment variables
 */
export const delimiter = nodePath.delimiter;

/**
 * Join path segments
 */
export function join(...paths: string[]): string {
  return nodePath.join(...paths);
}

/**
 * Resolve path segments to an absolute path
 */
export function resolve(...paths: string[]): string {
  return nodePath.resolve(...paths);
}

/**
 * Get the relative path from one path to another
 */
export function relative(from: string, to: string): string {
  return nodePath.relative(from, to);
}

/**
 * Normalize a path (resolve . and .. segments)
 */
export function normalize(p: string): string {
  return nodePath.normalize(p);
}

/**
 * Check if a path is absolute
 */
export function isAbsolute(p: string): boolean {
  return nodePath.isAbsolute(p);
}

/**
 * Get the directory name of a path
 */
export function dirname(p: string): string {
  return nodePath.dirname(p);
}

/**
 * Get the base name of a path
 */
export function basename(p: string, ext?: string): string {
  return nodePath.basename(p, ext);
}

/**
 * Get the extension of a path
 */
export function extname(p: string): string {
  return nodePath.extname(p);
}

/**
 * Parse a path into components
 */
export interface ParsedPath {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
}

export function parse(p: string): ParsedPath {
  return nodePath.parse(p);
}

/**
 * Format a parsed path back into a string
 */
export function format(pathObject: Partial<ParsedPath>): string {
  return nodePath.format(pathObject);
}

/**
 * Convert path to POSIX format (forward slashes)
 */
export function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Convert path to Windows format (backslashes)
 */
export function toWindows(p: string): string {
  return p.replace(/\//g, '\\');
}

/**
 * Get the parent directory
 */
export function parent(p: string): string {
  return dirname(p);
}

/**
 * Get path segments as an array
 */
export function segments(p: string): string[] {
  const normalized = normalize(p);
  return normalized.split(sep).filter((s) => s.length > 0);
}

/**
 * Check if a path has a specific extension
 */
export function hasExtension(p: string, ext: string): boolean {
  const pathExt = extname(p).toLowerCase();
  const checkExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  return pathExt === checkExt;
}

/**
 * Change the extension of a path
 */
export function changeExtension(p: string, newExt: string): string {
  const parsed = parse(p);
  const ext = newExt.startsWith('.') ? newExt : `.${newExt}`;
  return join(parsed.dir, `${parsed.name}${ext}`);
}

/**
 * Remove the extension from a path
 */
export function removeExtension(p: string): string {
  const parsed = parse(p);
  return join(parsed.dir, parsed.name);
}

/**
 * Add a suffix before the extension
 */
export function addSuffix(p: string, suffix: string): string {
  const parsed = parse(p);
  return join(parsed.dir, `${parsed.name}${suffix}${parsed.ext}`);
}

/**
 * Check if a path is a child of another path
 */
export function isChildOf(child: string, parent: string): boolean {
  const childResolved = resolve(child);
  const parentResolved = resolve(parent);
  const rel = relative(parentResolved, childResolved);
  return !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Get the common base path of multiple paths
 */
export function commonBase(...paths: string[]): string {
  if (paths.length === 0) return '';
  if (paths.length === 1) return dirname(paths[0]);

  const resolvedPaths = paths.map((p) => resolve(p));
  const segmentsList = resolvedPaths.map((p) => segments(p));
  const minLength = Math.min(...segmentsList.map((s) => s.length));

  const common: string[] = [];
  for (let i = 0; i < minLength; i++) {
    const segment = segmentsList[0][i];
    if (segmentsList.every((s) => s[i] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }

  if (common.length === 0) return '';

  // Handle root on Unix vs Windows
  if (resolvedPaths[0].startsWith('/')) {
    return '/' + common.join('/');
  }

  return common.join(sep);
}

/**
 * Expand tilde (~) to home directory
 */
export function expandHome(p: string): string {
  if (p.startsWith('~')) {
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return join(home, p.slice(1));
  }
  return p;
}

/**
 * Make a path safe for use as a filename
 */
export function sanitize(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/^\.+/, '_')
    .replace(/\.+$/, '_')
    .slice(0, 255);
}

/**
 * Check if a filename matches a glob pattern
 */
export function matchesPattern(filename: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regexPattern}$`).test(filename);
}

/**
 * Path builder for fluent API
 */
export class PathBuilder {
  private path: string;

  constructor(base: string = process.cwd()) {
    this.path = resolve(base);
  }

  static from(base: string): PathBuilder {
    return new PathBuilder(base);
  }

  static cwd(): PathBuilder {
    return new PathBuilder(process.cwd());
  }

  join(...segments: string[]): PathBuilder {
    this.path = join(this.path, ...segments);
    return this;
  }

  parent(): PathBuilder {
    this.path = dirname(this.path);
    return this;
  }

  sibling(name: string): PathBuilder {
    this.path = join(dirname(this.path), name);
    return this;
  }

  withExtension(ext: string): PathBuilder {
    this.path = changeExtension(this.path, ext);
    return this;
  }

  withSuffix(suffix: string): PathBuilder {
    this.path = addSuffix(this.path, suffix);
    return this;
  }

  normalize(): PathBuilder {
    this.path = normalize(this.path);
    return this;
  }

  toString(): string {
    return this.path;
  }

  get value(): string {
    return this.path;
  }

  get dirname(): string {
    return dirname(this.path);
  }

  get basename(): string {
    return basename(this.path);
  }

  get extname(): string {
    return extname(this.path);
  }

  get name(): string {
    return parse(this.path).name;
  }
}

// Convenience function
export function path(base?: string): PathBuilder {
  return new PathBuilder(base);
}
