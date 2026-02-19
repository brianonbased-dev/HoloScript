/**
 * Sprint 53 — @holoscript/fs acceptance tests
 * Covers: sanitize(), matchesPattern(), expandHome(), PathBuilder,
 *         formatSize(), and the uncovered path utilities
 *         (relative, resolve, addSuffix, isChildOf, commonBase)
 */
import { describe, it, expect } from 'vitest';
import {
  sanitize,
  matchesPattern,
  expandHome,
  PathBuilder,
  path,
  relative,
  resolve,
  addSuffix,
  isChildOf,
  commonBase,
} from '../path.js';
import { formatSize } from '../fs.js';

// ═══════════════════════════════════════════════
// sanitize
// ═══════════════════════════════════════════════
describe('sanitize', () => {
  it('is a function', () => {
    expect(typeof sanitize).toBe('function');
  });

  it('returns the input unchanged when safe', () => {
    expect(sanitize('hello-world')).toBe('hello-world');
  });

  it('replaces forward slash', () => {
    expect(sanitize('foo/bar')).toBe('foo_bar');
  });

  it('replaces backslash', () => {
    expect(sanitize('foo\\bar')).toBe('foo_bar');
  });

  it('replaces colon', () => {
    expect(sanitize('C:file')).toBe('C_file');
  });

  it('replaces angle brackets', () => {
    expect(sanitize('a<b>c')).toBe('a_b_c');
  });

  it('replaces quotes and pipe', () => {
    expect(sanitize('file"name|pipe')).toBe('file_name_pipe');
  });

  it('replaces question mark and asterisk', () => {
    expect(sanitize('what?ever*.ts')).toBe('what_ever_.ts');
  });

  it('replaces leading dots', () => {
    expect(sanitize('...hidden')).toBe('_hidden');
  });

  it('replaces trailing dots', () => {
    expect(sanitize('file...')).toBe('file_');
  });

  it('truncates to 255 characters', () => {
    const long = 'a'.repeat(300);
    expect(sanitize(long).length).toBe(255);
  });

  it('handles empty string', () => {
    expect(sanitize('')).toBe('');
  });
});

// ═══════════════════════════════════════════════
// matchesPattern
// ═══════════════════════════════════════════════
describe('matchesPattern', () => {
  it('is a function', () => {
    expect(typeof matchesPattern).toBe('function');
  });

  it('matches exact filename', () => {
    expect(matchesPattern('file.ts', 'file.ts')).toBe(true);
  });

  it('* wildcard matches any characters', () => {
    expect(matchesPattern('file.ts', '*.ts')).toBe(true);
  });

  it('* wildcard does not match a different extension', () => {
    expect(matchesPattern('file.js', '*.ts')).toBe(false);
  });

  it('? matches single character', () => {
    expect(matchesPattern('file.ts', 'file.t?')).toBe(true);
  });

  it('? does not match zero characters', () => {
    expect(matchesPattern('file.t', 'file.t?')).toBe(false);
  });

  it('* matches empty prefix', () => {
    expect(matchesPattern('index.ts', '*.ts')).toBe(true);
  });

  it('returns false for complete mismatch', () => {
    expect(matchesPattern('image.png', '*.ts')).toBe(false);
  });

  it('matches *.test.ts pattern', () => {
    expect(matchesPattern('Sprint53.test.ts', '*.test.ts')).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// expandHome
// ═══════════════════════════════════════════════
describe('expandHome', () => {
  it('is a function', () => {
    expect(typeof expandHome).toBe('function');
  });

  it('returns non-tilde paths unchanged', () => {
    expect(expandHome('/absolute/path')).toBe('/absolute/path');
    expect(expandHome('relative/path')).toBe('relative/path');
  });

  it('expands ~ to the home directory', () => {
    const result = expandHome('~/docs');
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    expect(result.includes('docs')).toBe(true);
    if (home) {
      expect(result.startsWith(home)).toBe(true);
    }
  });

  it('expands ~ alone', () => {
    const result = expandHome('~');
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    if (home) {
      expect(result).toContain(home.replace(/\\/g, '/').split('/').pop()!);
    } else {
      expect(typeof result).toBe('string');
    }
  });
});

// ═══════════════════════════════════════════════
// PathBuilder
// ═══════════════════════════════════════════════
describe('PathBuilder', () => {
  it('PathBuilder.from creates an instance', () => {
    const pb = PathBuilder.from('/home/user');
    expect(pb).toBeInstanceOf(PathBuilder);
  });

  it('PathBuilder.cwd creates an instance rooted at cwd', () => {
    const pb = PathBuilder.cwd();
    expect(pb).toBeInstanceOf(PathBuilder);
    expect(pb.toString()).toBe(resolve(process.cwd()));
  });

  it('join appends segments', () => {
    const pb = PathBuilder.from('/home/user').join('projects', 'holo');
    expect(pb.toString().replace(/\\/g, '/')).toContain('home/user/projects/holo');
  });

  it('parent navigates up', () => {
    const pb = PathBuilder.from('/home/user/file.ts').parent();
    expect(pb.toString().replace(/\\/g, '/')).toContain('/home/user');
  });

  it('sibling replaces last segment', () => {
    const pb = PathBuilder.from('/home/user/a.ts').sibling('b.ts');
    expect(pb.toString().replace(/\\/g, '/')).toContain('/home/user/b.ts');
  });

  it('withExtension changes extension', () => {
    const pb = PathBuilder.from('/path/to/file.ts').withExtension('.js');
    expect(pb.toString()).toMatch(/file\.js$/);
  });

  it('withSuffix adds suffix before extension', () => {
    const pb = PathBuilder.from('/path/to/file.ts').withSuffix('.test');
    expect(pb.toString()).toMatch(/file\.test\.ts$/);
  });

  it('normalize resolves dot segments', () => {
    const pb = PathBuilder.from('/path/to/../to/file.ts').normalize();
    expect(pb.toString().replace(/\\/g, '/')).toContain('/path/to/file.ts');
  });

  it('value getter returns the path string', () => {
    const pb = PathBuilder.from('/home/user');
    expect(pb.value).toBe(pb.toString());
  });

  it('dirname getter returns parent directory', () => {
    const pb = PathBuilder.from('/home/user/file.ts');
    expect(pb.dirname.replace(/\\/g, '/')).toContain('/home/user');
  });

  it('basename getter returns filename', () => {
    const pb = PathBuilder.from('/home/user/file.ts');
    expect(pb.basename).toBe('file.ts');
  });

  it('extname getter returns extension', () => {
    const pb = PathBuilder.from('/home/user/file.ts');
    expect(pb.extname).toBe('.ts');
  });

  it('name getter returns stem without extension', () => {
    const pb = PathBuilder.from('/home/user/file.ts');
    expect(pb.name).toBe('file');
  });

  it('fluent API chains work together', () => {
    const result = PathBuilder.from('/root')
      .join('src')
      .join('index.ts')
      .withSuffix('.test')
      .toString();
    expect(result).toMatch(/index\.test\.ts$/);
  });

  it('path() convenience function returns PathBuilder', () => {
    const pb = path('/home/user');
    expect(pb).toBeInstanceOf(PathBuilder);
  });
});

// ═══════════════════════════════════════════════
// relative
// ═══════════════════════════════════════════════
describe('relative', () => {
  it('is a function', () => {
    expect(typeof relative).toBe('function');
  });

  it('returns relative path between two absolute paths', () => {
    const rel = relative('/foo/bar', '/foo/bar/baz/file.ts');
    expect(rel.replace(/\\/g, '/')).toBe('baz/file.ts');
  });

  it('returns .. for parent navigation', () => {
    const rel = relative('/foo/bar/baz', '/foo/bar');
    expect(rel).toBe('..');
  });

  it('returns empty string for same path', () => {
    const rel = relative('/foo/bar', '/foo/bar');
    expect(rel).toBe('');
  });
});

// ═══════════════════════════════════════════════
// addSuffix
// ═══════════════════════════════════════════════
describe('addSuffix', () => {
  it('is a function', () => {
    expect(typeof addSuffix).toBe('function');
  });

  it('adds suffix before extension', () => {
    expect(addSuffix('component.tsx', '.test')).toBe('component.test.tsx');
  });

  it('works with full paths', () => {
    const result = addSuffix('/src/app.ts', '.spec');
    expect(result.replace(/\\/g, '/')).toMatch(/\/src\/app\.spec\.ts$/);
  });

  it('works with multiple dots in name', () => {
    const result = addSuffix('file.min.js', '.bundle');
    expect(result).toMatch(/file\.min\.bundle\.js$/);
  });
});

// ═══════════════════════════════════════════════
// isChildOf
// ═══════════════════════════════════════════════
describe('isChildOf', () => {
  it('is a function', () => {
    expect(typeof isChildOf).toBe('function');
  });

  it('returns true for a child path', () => {
    expect(isChildOf('/foo/bar/baz', '/foo/bar')).toBe(true);
  });

  it('returns true for direct child', () => {
    expect(isChildOf('/foo/bar', '/foo')).toBe(true);
  });

  it('returns false for unrelated path', () => {
    expect(isChildOf('/other/path', '/foo')).toBe(false);
  });

  it('returns true for same path', () => {
    expect(isChildOf('/foo/bar', '/foo/bar')).toBe(true);
  });

  it('returns false for parent of parent', () => {
    expect(isChildOf('/foo', '/foo/bar')).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// commonBase
// ═══════════════════════════════════════════════
describe('commonBase', () => {
  it('is a function', () => {
    expect(typeof commonBase).toBe('function');
  });

  it('returns empty string for zero paths', () => {
    expect(commonBase()).toBe('');
  });

  it('returns dirname of single path', () => {
    const result = commonBase('/foo/bar/file.ts');
    expect(result.replace(/\\/g, '/')).toContain('foo/bar');
  });

  it('finds common directory for siblings', () => {
    const result = commonBase('/foo/bar/a.ts', '/foo/bar/b.ts');
    expect(result.replace(/\\/g, '/')).toContain('foo/bar');
  });
});

// ═══════════════════════════════════════════════
// formatSize (from fs.ts)
// ═══════════════════════════════════════════════
describe('formatSize', () => {
  it('is a function', () => {
    expect(typeof formatSize).toBe('function');
  });

  it('returns "0 B" for 0 bytes', () => {
    expect(formatSize(0)).toBe('0 B');
  });

  it('formats bytes', () => {
    expect(formatSize(512)).toContain('B');
  });

  it('formats kilobytes', () => {
    expect(formatSize(1024)).toContain('KB');
  });

  it('formats megabytes', () => {
    expect(formatSize(1024 * 1024)).toContain('MB');
  });

  it('formats gigabytes', () => {
    expect(formatSize(1024 * 1024 * 1024)).toContain('GB');
  });

  it('respects decimal places', () => {
    const result = formatSize(1536, 1); // 1.5 KB
    expect(result).toBe('1.5 KB');
  });

  it('default decimals is 2', () => {
    const result = formatSize(1536); // 1.50 KB
    expect(result).toBe('1.5 KB');
  });

  it('1 KB formats correctly', () => {
    expect(formatSize(1024, 0)).toBe('1 KB');
  });
});
