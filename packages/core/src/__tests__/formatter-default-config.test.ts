/**
 * Formatter, FS Utilities, Runtime EventBus & Storage, Benchmarks
 *
 * Tests cover:
 *   - Feature 1:  HoloScript Formatter (format, check, config, indentation,
 *                 blank lines, trailing commas, import sorting, range formatting)
 *   - Feature 2:  FS â€” path utilities (join, dirname, basename, extname, toPosix,
 *                 isAbsolute, normalize, parse)
 *   - Feature 3:  FS â€” file operations (readText/writeText, readJson/writeJson,
 *                 readLines, appendText, exists, stat, formatSize, tempDir ops)
 *   - Feature 4:  Runtime EventBus (on, off, once, emit, clear, listenerCount)
 *   - Feature 5:  Runtime MemoryStorageAdapter (get/set/remove/has/keys/clear)
 *   - Feature 6:  (Comparative Benchmarks skipped â€” tinybench not in core deps)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';

// ============================================================================
// Feature 1: Formatter
// ============================================================================

import {
  HoloScriptFormatter,
  DEFAULT_CONFIG,
  format,
  check,
  createFormatter,
  formatRange,
} from '../../../formatter/src/index.js';

// ============================================================================
// Feature 2 & 3: FS
// ============================================================================

import {
  join as pathJoin,
  dirname,
  basename,
  extname,
  isAbsolute,
  normalize,
  parse as parsePath,
  toPosix,
  toWindows,
  sep,
} from '../../../fs/src/path.js';

import {
  readText,
  writeText,
  readJson,
  writeJson,
  readLines,
  appendText,
  exists,
  existsSync,
  isFile,
  isDirectory,
  stat,
  mkdir,
  remove,
  formatSize,
  ensureDir,
  ensureFile,
  move,
  copy,
} from '../../../fs/src/fs.js';

// ============================================================================
// Feature 4 & 5: Runtime
// ============================================================================

import { EventBus, eventBus } from '../../../runtime/src/events.js';

import { createMemoryStorage, StorageAdapter } from '../../../runtime/src/storage.js';

// Feature 6 (Comparative Benchmarks) omitted â€” tinybench is not a dependency
// of @holoscript/core; that package has its own test suite.

// ============================================================================
// Helpers
// ============================================================================

const TEMP_DIR = os.tmpdir();
const uid = () => Math.random().toString(36).slice(2, 8);
const tmpPath = (name: string) => pathJoin(TEMP_DIR, `Sprint11-${name}-${uid()}`);

// ============================================================================
// Feature 1A: Formatter â€” DEFAULT_CONFIG & construction
// ============================================================================

describe('Feature 1A: Formatter â€” DEFAULT_CONFIG', () => {
  it('DEFAULT_CONFIG has expected defaults', () => {
    expect(DEFAULT_CONFIG.indentSize).toBe(2);
    expect(DEFAULT_CONFIG.useTabs).toBe(false);
    expect(DEFAULT_CONFIG.maxLineLength).toBe(100);
    expect(DEFAULT_CONFIG.braceStyle).toBe('same-line');
    expect(DEFAULT_CONFIG.semicolons).toBe(false);
    expect(DEFAULT_CONFIG.sortImports).toBe(true);
    expect(DEFAULT_CONFIG.maxBlankLines).toBe(1);
  });

  it('createFormatter() merges config with defaults', () => {
    const f = createFormatter({ indentSize: 4, useTabs: true });
    const cfg = f.getConfig();
    expect(cfg.indentSize).toBe(4);
    expect(cfg.useTabs).toBe(true);
    expect(cfg.maxLineLength).toBe(DEFAULT_CONFIG.maxLineLength);
  });

  it('setConfig() updates config at runtime', () => {
    const f = createFormatter();
    f.setConfig({ indentSize: 4 });
    expect(f.getConfig().indentSize).toBe(4);
  });
});

// ============================================================================
// Feature 1B: Formatter â€” format() basics
// ============================================================================

describe('Feature 1B: Formatter â€” format()', () => {
  it('format() returns FormatResult with formatted, changed, errors fields', () => {
    const result = format('sphere {\n}\n');
    expect(typeof result.formatted).toBe('string');
    expect(typeof result.changed).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('format() with empty string returns empty result', () => {
    const result = format('');
    expect(result.formatted).toBe('\n');
    expect(result.errors).toHaveLength(0);
  });

  it('format() normalises CRLF to LF', () => {
    const result = format('sphere {\r\n  @color(red)\r\n}\r\n');
    expect(result.formatted).not.toContain('\r');
  });

  it('format() ensures single trailing newline', () => {
    const result = format('sphere {}');
    expect(result.formatted.endsWith('\n')).toBe(true);
  });

  it('format() strips trailing whitespace from lines', () => {
    const result = format('sphere {   \n}\n');
    for (const line of result.formatted.split('\n')) {
      expect(line).toBe(line.trimEnd());
    }
  });

  it('format() collapses multiple blank lines to maxBlankLines', () => {
    const input = 'sphere {}\n\n\n\ncube {}\n';
    const result = format(input);
    expect(result.formatted).not.toMatch(/\n{3,}/);
  });

  it('format() normalises indentation with 2 spaces', () => {
    const input = 'sphere {\n@color(red)\n}\n';
    const result = format(input);
    const innerLines = result.formatted.split('\n').filter((l) => l.trim().startsWith('@'));
    expect(innerLines.every((l) => l.startsWith('  '))).toBe(true);
  });

  it('changed is false when code is already formatted', () => {
    const source = 'sphere {}\n';
    const result = format(source);
    // Format twice â€” second pass should have changed=false
    const result2 = format(result.formatted);
    expect(result2.changed).toBe(false);
  });
});

// ============================================================================
// Feature 1C: Formatter â€” check() and formatRange()
// ============================================================================

describe('Feature 1C: Formatter â€” check() and formatRange()', () => {
  it('check() returns false when code needs formatting', () => {
    expect(check('sphere {   \n}')).toBe(false);
  });

  it('check() returns true for already-formatted code', () => {
    const src = format('sphere {}\n').formatted;
    expect(check(src)).toBe(true);
  });

  it('formatRange() returns FormatResult for a valid range', () => {
    const src = 'sphere {}\n\ncube {}\n';
    const result = formatRange(src, { startLine: 0, endLine: 0 });
    expect(typeof result.formatted).toBe('string');
  });

  it('formatRange() returns empty string for inverted range', () => {
    const src = 'sphere {}\n';
    const result = formatRange(src, { startLine: 5, endLine: 2 });
    expect(result.formatted).toBe('');
    expect(result.changed).toBe(false);
  });

  it('format() works for .hsplus file type', () => {
    const src = 'import "fs"\nconst x = 1\n';
    const result = format(src, 'hsplus');
    expect(result.errors).toHaveLength(0);
    expect(typeof result.formatted).toBe('string');
  });
});

// ============================================================================
// Feature 2: FS â€” path utilities
// ============================================================================

describe('Feature 2: FS path utilities', () => {
  it('join() combines path segments', () => {
    const p = pathJoin('/foo', 'bar', 'baz.txt');
    expect(p).toContain('foo');
    expect(p).toContain('bar');
    expect(p).toContain('baz.txt');
  });

  it('dirname() returns parent directory', () => {
    const d = dirname('/foo/bar/baz.txt');
    expect(d.endsWith('bar') || d.endsWith('/foo/bar')).toBe(true);
  });

  it('basename() returns file name', () => {
    expect(basename('/foo/bar/baz.txt')).toBe('baz.txt');
  });

  it('basename() strips extension when provided', () => {
    expect(basename('/foo/bar/baz.txt', '.txt')).toBe('baz');
  });

  it('extname() returns extension with dot', () => {
    expect(extname('/foo/bar/baz.txt')).toBe('.txt');
    expect(extname('/foo/bar/baz')).toBe('');
  });

  it('isAbsolute() detects absolute paths', () => {
    expect(isAbsolute('/absolute/path')).toBe(true);
    expect(isAbsolute('relative/path')).toBe(false);
  });

  it('normalize() resolves . and .. segments', () => {
    const result = normalize('/foo/bar/../baz');
    expect(result).not.toContain('..');
    expect(result).toContain('baz');
  });

  it('parsePath() returns root, dir, base, ext, name', () => {
    const p = parsePath('/foo/bar/baz.txt');
    expect(p.base).toBe('baz.txt');
    expect(p.ext).toBe('.txt');
    expect(p.name).toBe('baz');
    expect(typeof p.dir).toBe('string');
  });

  it('toPosix() converts backslashes to forward slashes', () => {
    expect(toPosix('foo\\bar\\baz')).toBe('foo/bar/baz');
  });

  it('sep is a string', () => {
    expect(typeof sep).toBe('string');
    expect(sep.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Feature 3: FS â€” file I/O operations
// ============================================================================

describe('Feature 3A: FS file read/write', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0)) {
      try {
        await fn();
      } catch {
        /* ignore */
      }
    }
  });

  it('writeText() + readText() round-trip', async () => {
    const p = tmpPath('rw');
    cleanups.push(() => remove(p));
    await writeText(p, 'hello world');
    const content = await readText(p);
    expect(content).toBe('hello world');
  });

  it('writeJson() + readJson() round-trip', async () => {
    const p = tmpPath('json');
    cleanups.push(() => remove(p));
    await writeJson(p, { a: 1, b: 'test' });
    const data = await readJson<{ a: number; b: string }>(p);
    expect(data.a).toBe(1);
    expect(data.b).toBe('test');
  });

  it('readLines() splits content by newline', async () => {
    const p = tmpPath('lines');
    cleanups.push(() => remove(p));
    await writeText(p, 'line1\nline2\nline3');
    const lines = await readLines(p);
    expect(lines).toContain('line1');
    expect(lines).toContain('line3');
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('appendText() appends to existing file', async () => {
    const p = tmpPath('append');
    cleanups.push(() => remove(p));
    await writeText(p, 'hello ');
    await appendText(p, 'world');
    const content = await readText(p);
    expect(content).toBe('hello world');
  });

  it('exists() returns true for existing file', async () => {
    const p = tmpPath('exists');
    cleanups.push(() => remove(p));
    await writeText(p, '');
    expect(await exists(p)).toBe(true);
  });

  it('exists() returns false for missing file', async () => {
    expect(await exists(tmpPath('missing-xyz'))).toBe(false);
  });

  it('existsSync() matches async exists()', async () => {
    const p = tmpPath('existsync');
    cleanups.push(() => remove(p));
    await writeText(p, '');
    expect(existsSync(p)).toBe(true);
    expect(existsSync(tmpPath('no-such-file'))).toBe(false);
  });

  it('stat() returns FileStats with size and type', async () => {
    const p = tmpPath('stat');
    cleanups.push(() => remove(p));
    await writeText(p, 'hello');
    const s = await stat(p);
    expect(s.isFile).toBe(true);
    expect(s.isDirectory).toBe(false);
    expect(s.size).toBeGreaterThan(0);
    expect(s.modifiedAt).toBeInstanceOf(Date);
  });

  it('isFile() and isDirectory() correctly classify paths', async () => {
    const p = tmpPath('classify');
    cleanups.push(() => remove(p));
    await writeText(p, '');
    expect(await isFile(p)).toBe(true);
    expect(await isDirectory(p)).toBe(false);
  });
});

describe('Feature 3B: FS directory operations', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0)) {
      try {
        await fn();
      } catch {
        /* ignore */
      }
    }
  });

  it('mkdir() creates directory', async () => {
    const d = tmpPath('mkdir');
    cleanups.push(() => remove(d, true));
    await mkdir(d);
    expect(await isDirectory(d)).toBe(true);
  });

  it('ensureDir() is idempotent', async () => {
    const d = tmpPath('ensuredir');
    cleanups.push(() => remove(d, true));
    await ensureDir(d);
    await ensureDir(d); // second call should not throw
    expect(await isDirectory(d)).toBe(true);
  });

  it('ensureFile() creates empty file and parent dir', async () => {
    const p = tmpPath('nested') + '/sub/file.txt';
    cleanups.push(() => remove(tmpPath('nested'), true));
    await ensureFile(p);
    expect(await isFile(p)).toBe(true);
  });

  it('remove() deletes a file', async () => {
    const p = tmpPath('del');
    await writeText(p, '');
    await remove(p);
    expect(await exists(p)).toBe(false);
  });

  it('copy() duplicates a file', async () => {
    const src = tmpPath('cpsrc');
    const dst = tmpPath('cpdst');
    cleanups.push(
      () => remove(src),
      () => remove(dst)
    );
    await writeText(src, 'copy-me');
    await copy(src, dst);
    expect(await readText(dst)).toBe('copy-me');
  });

  it('move() renames a file', async () => {
    const src = tmpPath('mvsrc');
    const dst = tmpPath('mvdst');
    cleanups.push(() => remove(dst));
    await writeText(src, 'move-me');
    await move(src, dst);
    expect(await exists(src)).toBe(false);
    expect(await readText(dst)).toBe('move-me');
  });
});

// ============================================================================
// Feature 3C: FS â€” formatSize utility
// ============================================================================

describe('Feature 3C: FS formatSize()', () => {
  it('formatSize(0) returns "0 B"', () => {
    expect(formatSize(0)).toBe('0 B');
  });

  it('formatSize returns bytes for small values', () => {
    expect(formatSize(512)).toContain('B');
  });

  it('formatSize returns KB for kilobyte values', () => {
    expect(formatSize(2048)).toContain('KB');
  });

  it('formatSize returns MB for megabyte values', () => {
    expect(formatSize(2 * 1024 * 1024)).toContain('MB');
  });
});

// ============================================================================
// Feature 4: Runtime â€” EventBus
// ============================================================================

describe('Feature 4: Runtime EventBus', () => {
  let bus: EventBus;
  beforeEach(() => {
    bus = new EventBus();
  });

  it('on() + emit() calls the listener with data', () => {
    const received: number[] = [];
    bus.on('test', (data: number) => received.push(data));
    bus.emit('test', 42);
    expect(received).toEqual([42]);
  });

  it('on() returns an unsubscribe function', () => {
    const received: number[] = [];
    const unsub = bus.on<number>('evt', (d) => received.push(d));
    bus.emit('evt', 1);
    unsub();
    bus.emit('evt', 2);
    expect(received).toEqual([1]);
  });

  it('once() fires only one time', () => {
    const received: number[] = [];
    bus.once<number>('evt', (d) => received.push(d));
    bus.emit('evt', 1);
    bus.emit('evt', 2);
    expect(received).toEqual([1]);
  });

  it('once() returns an unsubscribe function', () => {
    const received: number[] = [];
    const unsub = bus.once<number>('evt', (d) => received.push(d));
    unsub();
    bus.emit('evt', 1);
    expect(received).toHaveLength(0);
  });

  it('off() with callback removes specific listener', () => {
    const received: number[] = [];
    const cb = (d: number) => received.push(d);
    bus.on<number>('evt', cb);
    bus.emit('evt', 1);
    bus.off('evt', cb);
    bus.emit('evt', 2);
    expect(received).toEqual([1]);
  });

  it('off() without callback clears all listeners for event', () => {
    const received: number[] = [];
    bus.on<number>('evt', (d) => received.push(d));
    bus.on<number>('evt', (d) => received.push(d * 10));
    bus.off('evt');
    bus.emit('evt', 5);
    expect(received).toHaveLength(0);
  });

  it('multiple listeners for same event all fire', () => {
    const log: string[] = [];
    bus.on('x', () => log.push('a'));
    bus.on('x', () => log.push('b'));
    bus.emit('x');
    expect(log).toContain('a');
    expect(log).toContain('b');
  });

  it('listenerCount() returns 0 for event with no listeners', () => {
    expect(bus.listenerCount('nope')).toBe(0);
  });

  it('listenerCount() counts regular + once listeners', () => {
    bus.on('e', () => {});
    bus.once('e', () => {});
    expect(bus.listenerCount('e')).toBe(2);
  });

  it('hasListeners() returns true/false correctly', () => {
    expect(bus.hasListeners('e')).toBe(false);
    bus.on('e', () => {});
    expect(bus.hasListeners('e')).toBe(true);
  });

  it('clear() removes all listeners', () => {
    bus.on('a', () => {});
    bus.on('b', () => {});
    bus.clear();
    expect(bus.listenerCount('a')).toBe(0);
    expect(bus.listenerCount('b')).toBe(0);
  });

  it('error in handler does not prevent other handlers from running', () => {
    const log: string[] = [];
    bus.on('e', () => {
      throw new Error('boom');
    });
    bus.on('e', () => log.push('ok'));
    bus.emit('e');
    expect(log).toContain('ok');
  });

  it('emit() with no data calls listeners with undefined', () => {
    let received: unknown = 'sentinel';
    bus.on('e', (d) => {
      received = d;
    });
    bus.emit('e');
    expect(received).toBeUndefined();
  });

  it('global eventBus singleton is an EventBus instance', () => {
    expect(eventBus).toBeInstanceOf(EventBus);
  });
});

// ============================================================================
// Feature 5: Runtime â€” MemoryStorageAdapter
// ============================================================================

describe('Feature 5: Runtime MemoryStorageAdapter', () => {
  let store: StorageAdapter;
  beforeEach(() => {
    store = createMemoryStorage();
  });

  it('get() returns null for missing key', async () => {
    const val = await store.get('missing');
    expect(val).toBeNull();
  });

  it('set() + get() round-trip', async () => {
    await store.set('key1', { hello: 'world' });
    const val = await store.get<{ hello: string }>('key1');
    expect(val?.hello).toBe('world');
  });

  it('has() returns false for missing key', async () => {
    expect(await store.has('absent')).toBe(false);
  });

  it('has() returns true after set()', async () => {
    await store.set('x', 42);
    expect(await store.has('x')).toBe(true);
  });

  it('remove() deletes an entry', async () => {
    await store.set('k', 'v');
    await store.remove('k');
    expect(await store.has('k')).toBe(false);
    expect(await store.get('k')).toBeNull();
  });

  it('keys() returns all stored keys', async () => {
    await store.set('a', 1);
    await store.set('b', 2);
    const k = await store.keys();
    expect(k).toContain('a');
    expect(k).toContain('b');
    expect(k.length).toBe(2);
  });

  it('clear() wipes all entries', async () => {
    await store.set('a', 1);
    await store.set('b', 2);
    await store.clear();
    expect((await store.keys()).length).toBe(0);
    expect(await store.get('a')).toBeNull();
  });

  it('set() overwrites existing value', async () => {
    await store.set('k', 'first');
    await store.set('k', 'second');
    const v = await store.get<string>('k');
    expect(v).toBe('second');
  });
});

// Feature 6 tests omitted â€” see packages/comparative-benchmarks for dedicated coverage.
