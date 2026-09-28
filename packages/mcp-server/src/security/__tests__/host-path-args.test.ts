/**
 * Table tests for the host-path rule (task_1790214096204_56rj): what counts as "a plain relative path", which
 * argument names carry a location on the server's disk, and who is exempt.
 */
import { describe, it, expect } from 'vitest';
import {
  assertNoHostPathArgs,
  callerMayNameHostPaths,
  findHostPathViolation,
  hostPathViolation,
} from '../host-path-args';

describe('hostPathViolation: what is not a plain relative path', () => {
  it.each([
    ['/etc/passwd', /absolute or UNC/],
    ['/app/packages/mcp-server/dist/http-server.js', /absolute or UNC/],
    ['\\Windows\\System32', /absolute or UNC/],
    ['\\\\server\\share\\x', /absolute or UNC/],
    ['\\\\?\\C:\\x', /absolute or UNC/],
    ['//host/share', /absolute or UNC/],
    ['C:\\Windows\\System32\\drivers\\etc\\hosts', /drive/],
    ['C:/Windows/x', /drive/],
    ['c:relative-on-drive', /drive/],
    ['~', /~ expansion/],
    ['~/.ssh/id_ed25519', /~ expansion/],
    ['file:///etc/passwd', /file: URL/],
    ['FILE:///C:/x', /file: URL/],
    ['a/../b', /"\.\." segment/],
    ['..', /"\.\." segment/],
    ['../x', /"\.\." segment/],
    ['x/..', /"\.\." segment/],
    ['a\\..\\b', /"\.\." segment/],
    ['a/./../b', /"\.\." segment/],
    ['ok.txt\0.png', /NUL/],
  ])('refuses %j', (value, why) => {
    expect(hostPathViolation(value)).toMatch(why);
  });

  it.each([
    'a.holo',
    'src/a.holo',
    './a.holo',
    'compositions/x/y.hsplus',
    'dir with spaces/x y.txt',
    'a..b',
    'v1.2..3/file',
    '.hidden/file',
    '...',
    '',
  ])('accepts %j', (value) => {
    expect(hostPathViolation(value)).toBeNull();
  });
});

describe('findHostPathViolation: which arguments are looked at', () => {
  it('finds a path-typed key whatever its spelling', () => {
    for (const key of [
      'filePath',
      'FilePath',
      'file_path',
      'file-path',
      'outpath',
      'OUT_PATH',
      'rootDir',
      'root_dir',
    ]) {
      expect(findHostPathViolation({ [key]: '/etc/passwd' })?.key).toBe(key);
    }
  });

  it('looks inside arrays of paths', () => {
    expect(findHostPathViolation({ files: ['a.ts', 'b/c.ts'] })).toBeNull();
    expect(findHostPathViolation({ files: ['a.ts', '/etc/x'] })).toEqual({
      key: 'files',
      reason: expect.stringMatching(/absolute/),
    });
    expect(findHostPathViolation({ research_files: ['ok.md', '../secret'] })?.key).toBe(
      'research_files'
    );
  });

  it('ignores keys that are not locations, even when the value looks like one', () => {
    expect(findHostPathViolation({ code: '/etc/passwd', target: 'C:\\x', name: '/x' })).toBeNull();
  });

  // claude3-x402's review of #396: videoUrl read any file: URL, and it was not on the path-key list because
  // nobody had thought of it as a path. A file: URL names the server's own disk whatever the key is called.
  it('refuses a file: URL under ANY key, the way a URL parser would read it', () => {
    for (const args of [
      { url: 'file:///x' },
      { videoUrl: 'file:///etc/passwd' },
      { source: 'FILE:///C:/x' },
      { src: '  file:///etc/passwd' },
      { src: '\u0001file:///etc/passwd' },
      { src: 'fi\tle:///etc/passwd' },
      { assets: ['https://cdn.example.com/a.glb', ['file:///etc/passwd']] },
    ]) {
      expect(findHostPathViolation(args)).toEqual({
        key: Object.keys(args)[0],
        reason: expect.stringMatching(/file: URL/),
      });
    }
  });

  it('lets free text begin with file: (it is prose for the tool, not a location it opens)', () => {
    expect(
      findHostPathViolation({ content: 'file: notes.md', code: 'file:///x', prompt: 'file: a' })
    ).toBeNull();
  });

  it('videoUrl is a location: https passes, an absolute path does not', () => {
    expect(
      findHostPathViolation({ videoUrl: 'https://cdn.example.com/walkthrough.mp4' })
    ).toBeNull();
    expect(findHostPathViolation({ videoUrl: '/etc/passwd' })?.reason).toMatch(/absolute/);
  });

  it('looks inside nested arrays under a path-typed key', () => {
    expect(findHostPathViolation({ paths: [['..']] })?.reason).toMatch(/"\.\." segment/);
    expect(findHostPathViolation({ files: [['a.ts'], ['/etc/x']] })?.reason).toMatch(/absolute/);
    expect(findHostPathViolation({ files: [['a.ts'], ['b/c.ts']] })).toBeNull();
  });

  it('is not recursive into objects: a nested field called path is a route, not a file', () => {
    expect(
      findHostPathViolation({ routes: [{ path: '/api/users' }], scene: { path: '/x' } })
    ).toBeNull();
  });

  it('ignores non-string values and empty input', () => {
    expect(findHostPathViolation({ path: 3, filePath: null, dir: {} })).toBeNull();
    expect(findHostPathViolation(undefined)).toBeNull();
    expect(findHostPathViolation({})).toBeNull();
  });

  it('reports the first offending key', () => {
    expect(findHostPathViolation({ dir: 'ok', outPath: '/x', path: '/y' })?.key).toBe('outPath');
  });
});

describe('who may name a host path', () => {
  it('only admin:* or tools:admin', () => {
    expect(callerMayNameHostPaths(['admin:*'])).toBe(true);
    expect(callerMayNameHostPaths(['tools:admin'])).toBe(true);
    expect(
      callerMayNameHostPaths(['tools:read', 'tools:write', 'tools:codebase', 'tools:browser'])
    ).toBe(false);
    expect(callerMayNameHostPaths([])).toBe(false);
    expect(callerMayNameHostPaths(undefined)).toBe(false);
  });

  it('assertNoHostPathArgs throws for a non-admin and names the tool and the key', () => {
    expect(() =>
      assertNoHostPathArgs('holo_scaffold_code', { targetDir: '/x' }, ['tools:write'])
    ).toThrow(/Host path argument refused for "holo_scaffold_code": "targetDir"/);
    expect(() => assertNoHostPathArgs('t', { path: 'a/b' }, ['tools:write'])).not.toThrow();
    expect(() => assertNoHostPathArgs('t', { path: '/x' }, ['admin:*'])).not.toThrow();
    expect(() => assertNoHostPathArgs('t', { path: '/x' }, ['tools:admin'])).not.toThrow();
  });

  it('an absent scope list is treated as non-admin, not trusted', () => {
    expect(() => assertNoHostPathArgs('t', { path: '/x' }, undefined)).toThrow(
      /Host path argument refused/
    );
  });
});
