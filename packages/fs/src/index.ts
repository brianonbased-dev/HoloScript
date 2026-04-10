/**
 * @holoscript/fs - File System Library for HoloScript Plus
 *
 * Provides file I/O, directory operations, path manipulation,
 * and file watching for HoloScript Plus programs.
 *
 * @example
 * ```hsplus
 * import { readText, writeText, watch } from "@holoscript/fs";
 * import { join } from "@holoscript/fs/path";
 *
 * async fn main() {
 *   // Read a config file
 *   let config = await readJson("config.json");
 *
 *   // Watch for changes
 *   let watcher = watch("./src", { debounce: 100 });
 *   watcher.on("change", fn(event) {
 *     print("File changed:", event.path);
 *   });
 * }
 * ```
 */

// File operations
export {
  // Types
  type Encoding,
  type FileStats,
  type DirEntry,
  type ReadOptions,
  type WriteOptions,
  type CopyOptions,

  // Reading
  readText,
  readTextSync,
  readBytes,
  readBytesSync,
  readJson,
  readJsonSync,
  readLines,
  readLinesSync,

  // Writing
  writeText,
  writeTextSync,
  writeBytes,
  writeBytesSync,
  writeJson,
  writeJsonSync,
  appendText,
  appendTextSync,
  appendLine,
  appendLineSync,

  // File/Directory operations
  exists,
  existsSync,
  isFile,
  isFileSync,
  isDirectory,
  isDirectorySync,
  stat,
  statSync,
  mkdir,
  mkdirSync,
  ensureDir,
  ensureDirSync,
  ensureFile,
  ensureFileSync,
  remove,
  removeSync,
  copy,
  copySync,
  move,
  moveSync,

  // Directory reading
  readDir,
  readDirSync,
  listFiles,
  listFilesSync,
  listDirs,
  listDirsSync,
  walk,
  glob,
  globSync,

  // Temp files
  tempDir,
  createTempFile,
  createTempDir,

  // Size utilities
  fileSize,
  fileSizeSync,
  dirSize,
  formatSize,
} from './fs.js';

// Path utilities
export {
  sep,
  delimiter,
  join,
  resolve,
  relative,
  normalize,
  isAbsolute,
  dirname,
  basename,
  extname,
  type ParsedPath,
  parse,
  format,
  toPosix,
  toWindows,
  parent,
  segments,
  hasExtension,
  changeExtension,
  removeExtension,
  addSuffix,
  isChildOf,
  commonBase,
  expandHome,
  sanitize,
  matchesPattern,
  PathBuilder,
  path,
} from './path.js';

// Watch utilities
export {
  type WatchEventType,
  type WatchEvent,
  type WatchOptions,
  type WatchCallback,
  FileWatcher,
  watch,
  watchCallback,
  watchFileTypes,
  watchFile,
  watchDebounced,
  watchOnce,
  watchBatched,
  watchFiltered,
  watchEvents,
  watchFiles,
  watchDirs,
} from './watch.js';

/**
 * Convenience: Get current working directory
 */
export function cwd(): string {
  return process.cwd();
}

/**
 * Convenience: Change current working directory
 */
export function chdir(path: string): void {
  process.chdir(path);
}

/**
 * Convenience: Get home directory
 */
export function homeDir(): string {
  return require('os').homedir();
}

/**
 * Convenience: Check if running on Windows
 */
export function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Convenience: Check if running on macOS
 */
export function isMacOS(): boolean {
  return process.platform === 'darwin';
}

/**
 * Convenience: Check if running on Linux
 */
export function isLinux(): boolean {
  return process.platform === 'linux';
}
