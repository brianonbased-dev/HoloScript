/**
 * VFSSandbox.test.ts — Tests for the Virtual File System Sandbox
 *
 * Covers: allowlist, denylist, traversal detection, audit logging,
 * dry-run mode, factory function, and edge cases.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import {
  VFSSandbox,
  VFSAccessDenied,
  createProjectSandbox,
  type VFSSandboxOptions,
} from '../VFSSandbox';

// ── Helpers ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve('/project/holoscript');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const TEMP_DIR = path.join(PROJECT_ROOT, 'temp');

function makeSandbox(overrides?: Partial<VFSSandboxOptions>): VFSSandbox {
  return new VFSSandbox({
    allowedRoots: [SRC_DIR, TEMP_DIR],
    ...overrides,
  });
}

// ── Allowlist ────────────────────────────────────────────────────────────────

describe('VFSSandbox — allowlist', () => {
  let sandbox: VFSSandbox;
  beforeEach(() => { sandbox = makeSandbox(); });

  it('allows paths inside an allowed root', () => {
    const result = sandbox.validate(path.join(SRC_DIR, 'scene.holo'));
    expect(result.allowed).toBe(true);
  });

  it('allows paths in nested subdirectories', () => {
    const result = sandbox.validate(path.join(SRC_DIR, 'components', 'deep', 'file.ts'));
    expect(result.allowed).toBe(true);
  });

  it('blocks paths outside all allowed roots', () => {
    const result = sandbox.validate('/etc/passwd');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toContain('outside all allowed roots');
    }
  });

  it('blocks sibling directories of allowed roots', () => {
    const result = sandbox.validate(path.join(PROJECT_ROOT, 'node_modules', 'pkg.js'));
    expect(result.allowed).toBe(false);
  });

  it('blocks the parent of an allowed root', () => {
    const result = sandbox.validate(path.join(PROJECT_ROOT, 'danger.sh'));
    expect(result.allowed).toBe(false);
  });
});

// ── Denylist ─────────────────────────────────────────────────────────────────

describe('VFSSandbox — denylist', () => {
  let sandbox: VFSSandbox;
  beforeEach(() => { sandbox = makeSandbox(); });

  it('blocks .env files by default', () => {
    const result = sandbox.validate(path.join(SRC_DIR, '.env'));
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain('.env');
  });

  it('blocks .env.local variant', () => {
    const result = sandbox.validate(path.join(SRC_DIR, '.env.local'));
    expect(result.allowed).toBe(false);
  });

  it('blocks *.pem certificates', () => {
    const result = sandbox.validate(path.join(SRC_DIR, 'cert.pem'));
    expect(result.allowed).toBe(false);
  });

  it('blocks *.key private keys', () => {
    const result = sandbox.validate(path.join(SRC_DIR, 'server.key'));
    expect(result.allowed).toBe(false);
  });

  it('blocks package-lock.json', () => {
    const result = sandbox.validate(path.join(SRC_DIR, 'package-lock.json'));
    expect(result.allowed).toBe(false);
  });

  it('allows custom deny patterns', () => {
    const sb = makeSandbox({ deniedPatterns: ['*.secret'] });
    const result = sb.validate(path.join(SRC_DIR, 'db.secret'));
    expect(result.allowed).toBe(false);
  });

  it('allows normal files not matching deny patterns', () => {
    const result = sandbox.validate(path.join(SRC_DIR, 'scene.holo'));
    expect(result.allowed).toBe(true);
  });
});

// ── Traversal Detection ─────────────────────────────────────────────────────

describe('VFSSandbox — traversal detection', () => {
  let sandbox: VFSSandbox;
  beforeEach(() => { sandbox = makeSandbox(); });

  it('blocks ../ path traversal', () => {
    // Use string concat — path.join resolves ../ away on Windows
    const result = sandbox.validate(SRC_DIR + '/../../../etc/passwd');
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toContain('traversal');
  });

  it('blocks paths ending with /..', () => {
    const result = sandbox.validate(SRC_DIR + '/..');
    expect(result.allowed).toBe(false);
  });

  it('allows legitimate paths without traversal', () => {
    const result = sandbox.validate(path.join(SRC_DIR, 'sub', 'file.ts'));
    expect(result.allowed).toBe(true);
  });
});

// ── Assert Methods ───────────────────────────────────────────────────────────

describe('VFSSandbox — assert methods', () => {
  let sandbox: VFSSandbox;
  beforeEach(() => { sandbox = makeSandbox(); });

  it('assertWritable returns resolved path for allowed file', () => {
    const resolved = sandbox.assertWritable(path.join(SRC_DIR, 'test.ts'));
    expect(resolved).toBe(path.resolve(SRC_DIR, 'test.ts'));
  });

  it('assertWritable throws VFSAccessDenied for blocked file', () => {
    expect(() => sandbox.assertWritable('/etc/passwd')).toThrow(VFSAccessDenied);
  });

  it('VFSAccessDenied has correct code and filePath', () => {
    try {
      sandbox.assertWritable('/etc/passwd');
    } catch (e) {
      expect(e).toBeInstanceOf(VFSAccessDenied);
      expect((e as VFSAccessDenied).code).toBe('VFS_ACCESS_DENIED');
      expect((e as VFSAccessDenied).filePath).toBe(path.resolve('/etc/passwd'));
    }
  });

  it('assertReadable works for allowed paths', () => {
    const resolved = sandbox.assertReadable(path.join(SRC_DIR, 'data.json'));
    expect(typeof resolved).toBe('string');
  });

  it('assertDeletable throws for denied paths', () => {
    expect(() => sandbox.assertDeletable(path.join(SRC_DIR, '.env'))).toThrow(VFSAccessDenied);
  });
});

// ── Audit Log ────────────────────────────────────────────────────────────────

describe('VFSSandbox — audit logging', () => {
  it('records all operations', () => {
    const sandbox = makeSandbox();
    sandbox.validate(path.join(SRC_DIR, 'a.ts'));
    sandbox.validate('/bad/path');
    sandbox.validate(path.join(SRC_DIR, '.env'));

    const log = sandbox.getAuditLog();
    expect(log).toHaveLength(3);
    expect(log[0].allowed).toBe(true);
    expect(log[1].allowed).toBe(false);
    expect(log[2].allowed).toBe(false);
  });

  it('getDeniedOperations filters correctly', () => {
    const sandbox = makeSandbox();
    sandbox.validate(path.join(SRC_DIR, 'ok.ts'));
    sandbox.validate('/blocked');

    const denied = sandbox.getDeniedOperations();
    expect(denied).toHaveLength(1);
    expect(denied[0].path).toBe(path.resolve('/blocked'));
  });

  it('getStats returns correct counts', () => {
    const sandbox = makeSandbox();
    sandbox.validate(path.join(SRC_DIR, 'a.ts'));
    sandbox.validate(path.join(SRC_DIR, 'b.ts'));
    sandbox.validate('/blocked');

    const stats = sandbox.getStats();
    expect(stats.total).toBe(3);
    expect(stats.allowed).toBe(2);
    expect(stats.denied).toBe(1);
  });

  it('clearAuditLog empties the log', () => {
    const sandbox = makeSandbox();
    sandbox.validate(path.join(SRC_DIR, 'x.ts'));
    sandbox.clearAuditLog();

    expect(sandbox.getAuditLog()).toHaveLength(0);
  });

  it('disables audit when enableAudit is false', () => {
    const sandbox = makeSandbox({ enableAudit: false });
    sandbox.validate(path.join(SRC_DIR, 'x.ts'));
    sandbox.validate('/bad');

    expect(sandbox.getAuditLog()).toHaveLength(0);
  });
});

// ── Audit-Only (Dry Run) ────────────────────────────────────────────────────

describe('VFSSandbox — audit-only mode', () => {
  it('does not throw even for blocked paths', () => {
    const sandbox = makeSandbox({ auditOnly: true });
    expect(() => sandbox.assertWritable('/etc/passwd')).not.toThrow();
  });

  it('still records the denied operation', () => {
    const sandbox = makeSandbox({ auditOnly: true });
    sandbox.assertWritable('/etc/passwd');

    const denied = sandbox.getDeniedOperations();
    expect(denied).toHaveLength(1);
  });
});

// ── Factory ──────────────────────────────────────────────────────────────────

describe('createProjectSandbox', () => {
  it('creates a sandbox with standard project directories', () => {
    const sandbox = createProjectSandbox('/myproject');
    const roots = sandbox.getAllowedRoots();

    expect(roots).toContain(path.resolve('/myproject', 'src'));
    expect(roots).toContain(path.resolve('/myproject', 'dist'));
    expect(roots).toContain(path.resolve('/myproject', 'temp'));
    expect(roots).toContain(path.resolve('/myproject', 'packages'));
    expect(roots).toContain(path.resolve('/myproject', 'docs'));
  });

  it('blocks node_modules writes', () => {
    const sandbox = createProjectSandbox('/myproject');
    // node_modules is not in allowedRoots AND is in deniedPatterns
    const result = sandbox.validate(path.resolve('/myproject', 'src', 'node_modules', 'pkg', 'i.js'));
    expect(result.allowed).toBe(false);
  });

  it('allows src writes', () => {
    const sandbox = createProjectSandbox('/myproject');
    const result = sandbox.validate(path.resolve('/myproject', 'src', 'scene.holo'));
    expect(result.allowed).toBe(true);
  });
});
