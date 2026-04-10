/**
 * @holoscript/fs - File System Module
 *
 * File and directory operations for HoloScript Plus programs.
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as nodePath from 'path';
import { glob as globAsync } from 'glob';

export type Encoding = BufferEncoding;

/**
 * File stats information
 */
export interface FileStats {
  size: number;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  createdAt: Date;
  modifiedAt: Date;
  accessedAt: Date;
  mode: number;
}

/**
 * Directory entry
 */
export interface DirEntry {
  name: string;
  path: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

/**
 * Read options
 */
export interface ReadOptions {
  encoding?: Encoding;
}

/**
 * Write options
 */
export interface WriteOptions {
  encoding?: Encoding;
  mode?: number;
  flag?: string;
  append?: boolean;
}

/**
 * Copy options
 */
export interface CopyOptions {
  overwrite?: boolean;
  recursive?: boolean;
  filter?: (src: string) => boolean;
}

// ============================================================================
// File Reading
// ============================================================================

/**
 * Read a file as text
 */
export async function readText(path: string, encoding: Encoding = 'utf-8'): Promise<string> {
  return fsPromises.readFile(path, { encoding });
}

/**
 * Read a file as text (sync)
 */
export function readTextSync(path: string, encoding: Encoding = 'utf-8'): string {
  return fs.readFileSync(path, { encoding });
}

/**
 * Read a file as bytes
 */
export async function readBytes(path: string): Promise<Buffer> {
  return fsPromises.readFile(path);
}

/**
 * Read a file as bytes (sync)
 */
export function readBytesSync(path: string): Buffer {
  return fs.readFileSync(path);
}

/**
 * Read a JSON file
 */
export async function readJson<T = unknown>(path: string): Promise<T> {
  const text = await readText(path);
  return JSON.parse(text);
}

/**
 * Read a JSON file (sync)
 */
export function readJsonSync<T = unknown>(path: string): T {
  const text = readTextSync(path);
  return JSON.parse(text);
}

/**
 * Read file lines as an array
 */
export async function readLines(path: string, encoding: Encoding = 'utf-8'): Promise<string[]> {
  const text = await readText(path, encoding);
  return text.split(/\r?\n/);
}

/**
 * Read file lines as an array (sync)
 */
export function readLinesSync(path: string, encoding: Encoding = 'utf-8'): string[] {
  const text = readTextSync(path, encoding);
  return text.split(/\r?\n/);
}

// ============================================================================
// File Writing
// ============================================================================

/**
 * Write text to a file
 */
export async function writeText(
  path: string,
  content: string,
  options: WriteOptions = {}
): Promise<void> {
  const { encoding = 'utf-8', mode, flag = options.append ? 'a' : 'w' } = options;
  await ensureDir(nodePath.dirname(path));
  await fsPromises.writeFile(path, content, { encoding, mode, flag });
}

/**
 * Write text to a file (sync)
 */
export function writeTextSync(path: string, content: string, options: WriteOptions = {}): void {
  const { encoding = 'utf-8', mode, flag = options.append ? 'a' : 'w' } = options;
  ensureDirSync(nodePath.dirname(path));
  fs.writeFileSync(path, content, { encoding, mode, flag });
}

/**
 * Write bytes to a file
 */
export async function writeBytes(
  path: string,
  content: Buffer,
  options: WriteOptions = {}
): Promise<void> {
  const { mode, flag = options.append ? 'a' : 'w' } = options;
  await ensureDir(nodePath.dirname(path));
  await fsPromises.writeFile(path, content, { mode, flag });
}

/**
 * Write bytes to a file (sync)
 */
export function writeBytesSync(path: string, content: Buffer, options: WriteOptions = {}): void {
  const { mode, flag = options.append ? 'a' : 'w' } = options;
  ensureDirSync(nodePath.dirname(path));
  fs.writeFileSync(path, content, { mode, flag });
}

/**
 * Write JSON to a file
 */
export async function writeJson(
  path: string,
  data: unknown,
  options: WriteOptions & { pretty?: boolean } = {}
): Promise<void> {
  const { pretty = true, ...writeOpts } = options;
  const text = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  await writeText(path, text, writeOpts);
}

/**
 * Write JSON to a file (sync)
 */
export function writeJsonSync(
  path: string,
  data: unknown,
  options: WriteOptions & { pretty?: boolean } = {}
): void {
  const { pretty = true, ...writeOpts } = options;
  const text = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  writeTextSync(path, text, writeOpts);
}

/**
 * Append text to a file
 */
export async function appendText(
  path: string,
  content: string,
  encoding: Encoding = 'utf-8'
): Promise<void> {
  await writeText(path, content, { encoding, append: true });
}

/**
 * Append text to a file (sync)
 */
export function appendTextSync(path: string, content: string, encoding: Encoding = 'utf-8'): void {
  writeTextSync(path, content, { encoding, append: true });
}

/**
 * Append a line to a file
 */
export async function appendLine(
  path: string,
  line: string,
  encoding: Encoding = 'utf-8'
): Promise<void> {
  await appendText(path, line + '\n', encoding);
}

/**
 * Append a line to a file (sync)
 */
export function appendLineSync(path: string, line: string, encoding: Encoding = 'utf-8'): void {
  appendTextSync(path, line + '\n', encoding);
}

// ============================================================================
// File/Directory Operations
// ============================================================================

/**
 * Check if a path exists
 */
export async function exists(path: string): Promise<boolean> {
  try {
    await fsPromises.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path exists (sync)
 */
export function existsSync(path: string): boolean {
  return fs.existsSync(path);
}

/**
 * Check if path is a file
 */
export async function isFile(path: string): Promise<boolean> {
  try {
    const stats = await fsPromises.stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Check if path is a file (sync)
 */
export function isFileSync(path: string): boolean {
  try {
    return fs.statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Check if path is a directory
 */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await fsPromises.stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if path is a directory (sync)
 */
export function isDirectorySync(path: string): boolean {
  try {
    return fs.statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get file/directory stats
 */
export async function stat(path: string): Promise<FileStats> {
  const stats = await fsPromises.stat(path);
  return {
    size: stats.size,
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
    isSymlink: stats.isSymbolicLink(),
    createdAt: stats.birthtime,
    modifiedAt: stats.mtime,
    accessedAt: stats.atime,
    mode: stats.mode,
  };
}

/**
 * Get file/directory stats (sync)
 */
export function statSync(path: string): FileStats {
  const stats = fs.statSync(path);
  return {
    size: stats.size,
    isFile: stats.isFile(),
    isDirectory: stats.isDirectory(),
    isSymlink: stats.isSymbolicLink(),
    createdAt: stats.birthtime,
    modifiedAt: stats.mtime,
    accessedAt: stats.atime,
    mode: stats.mode,
  };
}

/**
 * Create a directory (and parents if needed)
 */
export async function mkdir(path: string, recursive = true): Promise<void> {
  await fsPromises.mkdir(path, { recursive });
}

/**
 * Create a directory (sync)
 */
export function mkdirSync(path: string, recursive = true): void {
  fs.mkdirSync(path, { recursive });
}

/**
 * Ensure a directory exists
 */
export async function ensureDir(path: string): Promise<void> {
  if (!(await exists(path))) {
    await mkdir(path, true);
  }
}

/**
 * Ensure a directory exists (sync)
 */
export function ensureDirSync(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, true);
  }
}

/**
 * Ensure a file exists (create empty if not)
 */
export async function ensureFile(path: string): Promise<void> {
  if (!(await exists(path))) {
    await ensureDir(nodePath.dirname(path));
    await writeText(path, '');
  }
}

/**
 * Ensure a file exists (sync)
 */
export function ensureFileSync(path: string): void {
  if (!existsSync(path)) {
    ensureDirSync(nodePath.dirname(path));
    writeTextSync(path, '');
  }
}

/**
 * Remove a file or directory
 */
export async function remove(path: string, recursive = true): Promise<void> {
  await fsPromises.rm(path, { recursive, force: true });
}

/**
 * Remove a file or directory (sync)
 */
export function removeSync(path: string, recursive = true): void {
  fs.rmSync(path, { recursive, force: true });
}

/**
 * Copy a file or directory
 */
export async function copy(src: string, dest: string, options: CopyOptions = {}): Promise<void> {
  const { overwrite = true, recursive = true, filter } = options;

  if (filter && !filter(src)) return;

  const srcStat = await stat(src);

  if (srcStat.isDirectory) {
    await ensureDir(dest);

    if (recursive) {
      const entries = await readDir(src);
      for (const entry of entries) {
        await copy(entry.path, nodePath.join(dest, entry.name), options);
      }
    }
  } else {
    if (!overwrite && (await exists(dest))) {
      return;
    }
    await ensureDir(nodePath.dirname(dest));
    await fsPromises.copyFile(src, dest);
  }
}

/**
 * Copy a file or directory (sync)
 */
export function copySync(src: string, dest: string, options: CopyOptions = {}): void {
  const { overwrite = true, recursive = true, filter } = options;

  if (filter && !filter(src)) return;

  const srcStat = statSync(src);

  if (srcStat.isDirectory) {
    ensureDirSync(dest);

    if (recursive) {
      const entries = readDirSync(src);
      for (const entry of entries) {
        copySync(entry.path, nodePath.join(dest, entry.name), options);
      }
    }
  } else {
    if (!overwrite && existsSync(dest)) {
      return;
    }
    ensureDirSync(nodePath.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

/**
 * Move/rename a file or directory
 */
export async function move(src: string, dest: string, overwrite = true): Promise<void> {
  if (!overwrite && (await exists(dest))) {
    throw new Error(`Destination already exists: ${dest}`);
  }
  await ensureDir(nodePath.dirname(dest));
  await fsPromises.rename(src, dest);
}

/**
 * Move/rename a file or directory (sync)
 */
export function moveSync(src: string, dest: string, overwrite = true): void {
  if (!overwrite && existsSync(dest)) {
    throw new Error(`Destination already exists: ${dest}`);
  }
  ensureDirSync(nodePath.dirname(dest));
  fs.renameSync(src, dest);
}

// ============================================================================
// Directory Reading
// ============================================================================

/**
 * Read directory entries
 */
export async function readDir(path: string): Promise<DirEntry[]> {
  const entries = await fsPromises.readdir(path, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    path: nodePath.join(path, entry.name),
    isFile: entry.isFile(),
    isDirectory: entry.isDirectory(),
    isSymlink: entry.isSymbolicLink(),
  }));
}

/**
 * Read directory entries (sync)
 */
export function readDirSync(path: string): DirEntry[] {
  const entries = fs.readdirSync(path, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    path: nodePath.join(path, entry.name),
    isFile: entry.isFile(),
    isDirectory: entry.isDirectory(),
    isSymlink: entry.isSymbolicLink(),
  }));
}

/**
 * List files in a directory (names only)
 */
export async function listFiles(path: string): Promise<string[]> {
  const entries = await readDir(path);
  return entries.filter((e) => e.isFile).map((e) => e.name);
}

/**
 * List files in a directory (sync)
 */
export function listFilesSync(path: string): string[] {
  const entries = readDirSync(path);
  return entries.filter((e) => e.isFile).map((e) => e.name);
}

/**
 * List directories in a directory (names only)
 */
export async function listDirs(path: string): Promise<string[]> {
  const entries = await readDir(path);
  return entries.filter((e) => e.isDirectory).map((e) => e.name);
}

/**
 * List directories in a directory (sync)
 */
export function listDirsSync(path: string): string[] {
  const entries = readDirSync(path);
  return entries.filter((e) => e.isDirectory).map((e) => e.name);
}

/**
 * Walk directory recursively
 */
export async function* walk(
  path: string,
  options: { depth?: number; followSymlinks?: boolean } = {}
): AsyncGenerator<DirEntry> {
  const { depth = Infinity, followSymlinks = false } = options;

  async function* walkDir(dir: string, currentDepth: number): AsyncGenerator<DirEntry> {
    if (currentDepth > depth) return;

    const entries = await readDir(dir);
    for (const entry of entries) {
      yield entry;

      if (entry.isDirectory || (followSymlinks && entry.isSymlink)) {
        yield* walkDir(entry.path, currentDepth + 1);
      }
    }
  }

  yield* walkDir(path, 0);
}

/**
 * Find files matching a glob pattern
 */
export async function glob(
  pattern: string,
  options: { cwd?: string; ignore?: string[] } = {}
): Promise<string[]> {
  const { cwd = process.cwd(), ignore = [] } = options;
  return globAsync(pattern, { cwd, ignore, absolute: true });
}

/**
 * Find files matching a glob pattern (sync)
 */
export function globSync(
  pattern: string,
  options: { cwd?: string; ignore?: string[] } = {}
): string[] {
  const { cwd = process.cwd(), ignore = [] } = options;
  return globAsync.sync(pattern, { cwd, ignore, absolute: true });
}

// ============================================================================
// Temp Files
// ============================================================================

/**
 * Get the system temp directory
 */
export function tempDir(): string {
  return require('os').tmpdir();
}

/**
 * Create a temporary file
 */
export async function createTempFile(
  prefix = 'tmp-',
  suffix = '',
  dir?: string
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const tempDirectory = dir || tempDir();
  const filename = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`;
  const filePath = nodePath.join(tempDirectory, filename);

  await writeText(filePath, '');

  return {
    path: filePath,
    cleanup: async () => {
      await remove(filePath);
    },
  };
}

/**
 * Create a temporary directory
 */
export async function createTempDir(
  prefix = 'tmp-'
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const tempDirectory = tempDir();
  const dirname = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const dirPath = nodePath.join(tempDirectory, dirname);

  await mkdir(dirPath);

  return {
    path: dirPath,
    cleanup: async () => {
      await remove(dirPath, true);
    },
  };
}

// ============================================================================
// File Size Utilities
// ============================================================================

/**
 * Get file size in bytes
 */
export async function fileSize(path: string): Promise<number> {
  const stats = await stat(path);
  return stats.size;
}

/**
 * Get file size in bytes (sync)
 */
export function fileSizeSync(path: string): number {
  const stats = statSync(path);
  return stats.size;
}

/**
 * Get directory size (recursive)
 */
export async function dirSize(path: string): Promise<number> {
  let total = 0;
  for await (const entry of walk(path)) {
    if (entry.isFile) {
      total += await fileSize(entry.path);
    }
  }
  return total;
}

/**
 * Format bytes as human-readable string
 */
export function formatSize(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}
