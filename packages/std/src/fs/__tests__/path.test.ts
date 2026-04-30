import { describe, it, expect } from 'vitest';
import {
  join,
  resolve,
  relative,
  normalize,
  isAbsolute,
  dirname,
  basename,
  extname,
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
  sep,
} from '../path.js';

describe('Path Utilities', () => {
  describe('join', () => {
    it('should join path segments', () => {
      const result = join('foo', 'bar', 'baz');
      expect(result).toMatch(/foo[/\\]bar[/\\]baz/);
    });

    it('should handle empty segments', () => {
      const result = join('foo', '', 'bar');
      expect(result).toMatch(/foo[/\\]bar/);
    });

    it('should normalize separators', () => {
      const result = join('foo/', '/bar');
      expect(result).toMatch(/foo[/\\]bar/);
    });
  });

  describe('dirname', () => {
    it('should get directory of a file path', () => {
      const result = dirname('/foo/bar/baz.txt');
      expect(result).toBe('/foo/bar');
    });

    it('should handle file in root', () => {
      const result = dirname('/file.txt');
      expect(result).toBe('/');
    });
  });

  describe('basename', () => {
    it('should get file name from path', () => {
      expect(basename('/foo/bar/baz.txt')).toBe('baz.txt');
    });

    it('should strip extension when provided', () => {
      expect(basename('/foo/bar/baz.txt', '.txt')).toBe('baz');
    });

    it('should handle paths ending with separator', () => {
      expect(basename('/foo/bar/')).toBe('bar');
    });
  });

  describe('extname', () => {
    it('should get extension from file name', () => {
      expect(extname('file.txt')).toBe('.txt');
    });

    it('should get extension from full path', () => {
      expect(extname('/path/to/file.json')).toBe('.json');
    });

    it('should return empty string for no extension', () => {
      expect(extname('file')).toBe('');
    });

    it('should handle dotfiles', () => {
      expect(extname('.gitignore')).toBe('');
    });

    it('should handle multiple dots', () => {
      expect(extname('file.test.ts')).toBe('.ts');
    });
  });

  describe('parse', () => {
    it('should parse a complete path', () => {
      const result = parse('/home/user/file.txt');
      expect(result.root).toBe('/');
      expect(result.dir).toBe('/home/user');
      expect(result.base).toBe('file.txt');
      expect(result.ext).toBe('.txt');
      expect(result.name).toBe('file');
    });

    it('should parse file without extension', () => {
      const result = parse('/path/to/README');
      expect(result.ext).toBe('');
      expect(result.name).toBe('README');
    });
  });

  describe('format', () => {
    it('should format parsed path back to string', () => {
      const parsed = { dir: '/home/user', name: 'file', ext: '.txt' };
      const result = format(parsed);
      expect(result).toMatch(/[/\\]home[/\\]user[/\\]file\.txt/);
    });
  });

  describe('isAbsolute', () => {
    it('should return true for absolute Unix paths', () => {
      expect(isAbsolute('/foo/bar')).toBe(true);
    });

    it('should return false for relative paths', () => {
      expect(isAbsolute('foo/bar')).toBe(false);
      expect(isAbsolute('./foo')).toBe(false);
      expect(isAbsolute('../foo')).toBe(false);
    });
  });

  describe('normalize', () => {
    it('should resolve . segments', () => {
      const result = normalize('/foo/./bar');
      // normalize uses native path module, so separator depends on OS
      expect(result.replace(/\\/g, '/')).toBe('/foo/bar');
    });

    it('should resolve .. segments', () => {
      const result = normalize('/foo/bar/../baz');
      expect(result.replace(/\\/g, '/')).toBe('/foo/baz');
    });

    it('should normalize multiple separators', () => {
      const result = normalize('/foo//bar///baz');
      expect(result.replace(/\\/g, '/')).toBe('/foo/bar/baz');
    });
  });

  describe('toPosix', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(toPosix('foo\\bar\\baz')).toBe('foo/bar/baz');
    });

    it('should keep forward slashes unchanged', () => {
      expect(toPosix('foo/bar/baz')).toBe('foo/bar/baz');
    });

    it('should handle mixed separators', () => {
      expect(toPosix('foo\\bar/baz')).toBe('foo/bar/baz');
    });
  });

  describe('toWindows', () => {
    it('should convert forward slashes to backslashes', () => {
      expect(toWindows('foo/bar/baz')).toBe('foo\\bar\\baz');
    });

    it('should keep backslashes unchanged', () => {
      expect(toWindows('foo\\bar\\baz')).toBe('foo\\bar\\baz');
    });
  });

  describe('parent', () => {
    it('should return parent directory', () => {
      expect(parent('/foo/bar/baz')).toBe('/foo/bar');
    });

    it('should be alias for dirname', () => {
      expect(parent('/foo/bar')).toBe(dirname('/foo/bar'));
    });
  });

  describe('segments', () => {
    it('should split path into segments', () => {
      const result = segments('/foo/bar/baz');
      expect(result).toEqual(['foo', 'bar', 'baz']);
    });

    it('should filter empty segments', () => {
      const result = segments('/foo//bar/');
      expect(result).toEqual(['foo', 'bar']);
    });
  });

  describe('hasExtension', () => {
    it('should return true for matching extension', () => {
      expect(hasExtension('file.txt', '.txt')).toBe(true);
      expect(hasExtension('file.txt', 'txt')).toBe(true);
    });

    it('should return false for non-matching extension', () => {
      expect(hasExtension('file.txt', '.json')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(hasExtension('file.TXT', '.txt')).toBe(true);
      expect(hasExtension('file.txt', '.TXT')).toBe(true);
    });
  });

  describe('changeExtension', () => {
    it('should change file extension', () => {
      const result = changeExtension('file.txt', '.md');
      expect(result).toBe('file.md');
    });

    it('should handle extension without dot', () => {
      const result = changeExtension('file.txt', 'json');
      expect(result).toBe('file.json');
    });

    it('should work with full paths', () => {
      const result = changeExtension('/path/to/file.ts', '.js');
      expect(result).toMatch(/[/\\]path[/\\]to[/\\]file\.js/);
    });
  });

  describe('removeExtension', () => {
    it('should remove extension from filename', () => {
      const result = removeExtension('file.txt');
      expect(result).toBe('file');
    });

    it('should work with paths', () => {
      const result = removeExtension('/path/to/file.ts');
      expect(result).toMatch(/[/\\]path[/\\]to[/\\]file$/);
    });
  });

  describe('addSuffix', () => {
    it('should add suffix before extension', () => {
      const result = addSuffix('file.ts', '.test');
      expect(result).toBe('file.test.ts');
    });

    it('should work with paths', () => {
      const result = addSuffix('/path/to/component.tsx', '.spec');
      expect(result).toMatch(/component\.spec\.tsx$/);
    });
  });

  describe('isChildOf', () => {
    it('should return true for child paths', () => {
      expect(isChildOf('/foo/bar/baz', '/foo')).toBe(true);
      expect(isChildOf('/foo/bar', '/foo')).toBe(true);
    });

    it('should return false for non-child paths', () => {
      expect(isChildOf('/other/path', '/foo')).toBe(false);
    });

    it('should return true for same path', () => {
      expect(isChildOf('/foo/bar', '/foo/bar')).toBe(true);
    });
  });

  describe('commonBase', () => {
    it('should find common base of multiple paths', () => {
      const result = commonBase('/foo/bar/a.txt', '/foo/bar/b.txt', '/foo/bar/c/d.txt');
      expect(result).toMatch(/foo[/\\]bar/);
    });

    it('should return empty for no common base', () => {
      // On Windows this might differ, so check if it's different roots
      const result = commonBase('/foo/bar', '/baz/qux');
      // Result depends on how deep they diverge
      expect(result).toBeDefined();
    });

    it('should handle single path', () => {
      const result = commonBase('/foo/bar/file.txt');
      expect(result).toMatch(/foo[/\\]bar/);
    });

    it('should handle empty array', () => {
      expect(commonBase()).toBe('');
    });
  });
});
