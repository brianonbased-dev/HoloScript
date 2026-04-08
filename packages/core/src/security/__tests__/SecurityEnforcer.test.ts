/**
 * Security Enforcer Tests
 *
 * Comprehensive tests for Sprint 9 Security Hardening:
 * - Policy validation (object count, trait depth, disallowed traits)
 * - Vulnerability scanning (eval detection, script injection)
 * - Package signing and verification roundtrip
 * - Sandbox creation and limits
 *
 * @version 9.0.0
 * @Sprint Sprint 9: Security Hardening
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createDefaultPolicy, createStrictPolicy, mergePolicy } from '../SecurityPolicy';
import type { SecurityPolicy } from '../SecurityPolicy';
import { validateComposition, validateImports, scanForVulnerabilities } from '../SecurityEnforcer';
import type { ASTNode, ImportDeclaration } from '../SecurityEnforcer';
import {
  generateKeyPair,
  signPackage,
  verifySignature,
  createPackageManifest,
  canonicalizeManifest,
} from '../PackageSigner';
import { createSandbox, execute, destroy } from '../SandboxExecutor';

// =============================================================================
// SECURITY POLICY TESTS
// =============================================================================

describe('SecurityPolicy', () => {
  describe('createDefaultPolicy', () => {
    it('should create a valid default policy', () => {
      const policy = createDefaultPolicy();

      expect(policy.sandbox.enabled).toBe(true);
      expect(policy.sandbox.memoryLimit).toBe(256);
      expect(policy.sandbox.cpuTimeLimit).toBe(30);
      expect(policy.sandbox.fileSystemAccess).toBe('workspace');
      expect(policy.sandbox.syscallAllowlist.length).toBeGreaterThan(0);

      expect(policy.network.allowedHosts).toContain('*');
      expect(policy.network.maxConnections).toBe(10);
      expect(policy.network.rateLimitPerSecond).toBe(100);

      expect(policy.code.maxObjectCount).toBe(1000);
      expect(policy.code.maxTraitDepth).toBe(16);
      expect(policy.code.disallowedTraits).toEqual([]);
      expect(policy.code.requireSignedPackages).toBe(false);
    });

    it('should return a new object each time', () => {
      const p1 = createDefaultPolicy();
      const p2 = createDefaultPolicy();
      expect(p1).not.toBe(p2);
      expect(p1).toEqual(p2);
    });
  });

  describe('createStrictPolicy', () => {
    it('should create a strict policy with tighter limits', () => {
      const policy = createStrictPolicy();

      expect(policy.sandbox.enabled).toBe(true);
      expect(policy.sandbox.memoryLimit).toBe(64);
      expect(policy.sandbox.cpuTimeLimit).toBe(5);
      expect(policy.sandbox.fileSystemAccess).toBe('none');

      expect(policy.network.allowedHosts).toEqual([]);
      expect(policy.network.maxConnections).toBe(0);

      expect(policy.code.maxObjectCount).toBe(100);
      expect(policy.code.maxTraitDepth).toBe(8);
      expect(policy.code.disallowedTraits.length).toBeGreaterThan(0);
      expect(policy.code.disallowedTraits).toContain('@unsafe');
      expect(policy.code.disallowedTraits).toContain('@eval');
      expect(policy.code.requireSignedPackages).toBe(true);
    });
  });

  describe('mergePolicy', () => {
    it('should override specific fields while keeping defaults', () => {
      const base = createDefaultPolicy();
      const merged = mergePolicy(base, {
        sandbox: { memoryLimit: 128 },
      });

      expect(merged.sandbox.memoryLimit).toBe(128);
      expect(merged.sandbox.enabled).toBe(true); // Unchanged
      expect(merged.sandbox.cpuTimeLimit).toBe(30); // Unchanged
      expect(merged.network.maxConnections).toBe(10); // Unchanged
    });

    it('should override network settings', () => {
      const base = createDefaultPolicy();
      const merged = mergePolicy(base, {
        network: {
          allowedHosts: ['api.holoscript.net'],
          maxConnections: 5,
        },
      });

      expect(merged.network.allowedHosts).toEqual(['api.holoscript.net']);
      expect(merged.network.maxConnections).toBe(5);
      expect(merged.network.rateLimitPerSecond).toBe(100); // Unchanged
    });

    it('should override code settings', () => {
      const base = createDefaultPolicy();
      const merged = mergePolicy(base, {
        code: {
          maxObjectCount: 500,
          disallowedTraits: ['@dangerous'],
        },
      });

      expect(merged.code.maxObjectCount).toBe(500);
      expect(merged.code.disallowedTraits).toEqual(['@dangerous']);
    });

    it('should handle empty overrides', () => {
      const base = createDefaultPolicy();
      const merged = mergePolicy(base, {});

      expect(merged).toEqual(base);
    });

    it('should not mutate the base policy', () => {
      const base = createDefaultPolicy();
      const originalMemory = base.sandbox.memoryLimit;

      mergePolicy(base, { sandbox: { memoryLimit: 32 } });

      expect(base.sandbox.memoryLimit).toBe(originalMemory);
    });
  });
});

// =============================================================================
// COMPOSITION VALIDATION TESTS
// =============================================================================

describe('validateComposition', () => {
  let strictPolicy: SecurityPolicy;

  beforeEach(() => {
    strictPolicy = createStrictPolicy();
  });

  describe('object count validation', () => {
    it('should pass when object count is within limits', () => {
      const ast: ASTNode[] = Array.from({ length: 50 }, (_, i) => ({
        type: 'object',
        name: `Object${i}`,
      }));

      const result = validateComposition(ast, strictPolicy);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should fail when object count exceeds maximum', () => {
      const ast: ASTNode[] = Array.from({ length: 150 }, (_, i) => ({
        type: 'object',
        name: `Object${i}`,
      }));

      const result = validateComposition(ast, strictPolicy);
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.category === 'object_count')).toBe(true);
    });

    it('should count nested children', () => {
      const ast: ASTNode = {
        type: 'object',
        name: 'Root',
        children: Array.from({ length: 150 }, (_, i) => ({
          type: 'object',
          name: `Child${i}`,
        })),
      };

      // 1 root + 150 children = 151 > 100 (strict limit)
      const result = validateComposition(ast, strictPolicy);
      expect(result.passed).toBe(false);
    });

    it('should pass with exact maximum', () => {
      const policy = mergePolicy(createDefaultPolicy(), {
        code: { maxObjectCount: 5 },
      });

      const ast: ASTNode[] = Array.from({ length: 5 }, (_, i) => ({
        type: 'object',
        name: `Obj${i}`,
      }));

      const result = validateComposition(ast, policy);
      expect(result.passed).toBe(true);
    });
  });

  describe('trait depth validation', () => {
    it('should pass when trait depth is within limits', () => {
      const ast: ASTNode[] = [
        {
          type: 'object',
          name: 'MyObject',
          traits: ['@grabbable', '@glowing'],
        },
      ];

      const result = validateComposition(ast, strictPolicy);
      expect(result.passed).toBe(true);
    });

    it('should fail when trait depth exceeds maximum', () => {
      // Create deeply nested nodes with multiple traits each
      const deepNode: ASTNode = {
        type: 'object',
        name: 'Deep',
        traits: ['@a', '@b', '@c'],
        children: [
          {
            type: 'object',
            name: 'Deeper',
            traits: ['@d', '@e', '@f'],
            children: [
              {
                type: 'object',
                name: 'Deepest',
                traits: ['@g', '@h', '@i'],
              },
            ],
          },
        ],
      };

      // Total depth: 3 + 3 + 3 = 9 > 8 (strict limit)
      const result = validateComposition(deepNode, strictPolicy);
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.category === 'trait_depth')).toBe(true);
    });

    it('should handle nodes without traits', () => {
      const ast: ASTNode[] = [
        { type: 'object', name: 'NoTraits' },
        { type: 'object', name: 'AlsoNoTraits', children: [] },
      ];

      const result = validateComposition(ast, strictPolicy);
      expect(result.passed).toBe(true);
    });
  });

  describe('disallowed trait validation', () => {
    it('should detect disallowed traits', () => {
      const ast: ASTNode[] = [
        {
          type: 'object',
          name: 'DangerousObj',
          traits: ['@grabbable', '@unsafe'],
        },
      ];

      const result = validateComposition(ast, strictPolicy);
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.category === 'disallowed_trait')).toBe(true);
    });

    it('should be case-insensitive for disallowed traits', () => {
      const ast: ASTNode[] = [
        {
          type: 'object',
          name: 'CaseTest',
          traits: ['@UNSAFE'],
        },
      ];

      const result = validateComposition(ast, strictPolicy);
      expect(result.passed).toBe(false);
    });

    it('should detect disallowed traits in nested children', () => {
      const ast: ASTNode = {
        type: 'object',
        name: 'Parent',
        traits: ['@visible'],
        children: [
          {
            type: 'object',
            name: 'Child',
            traits: ['@eval'],
          },
        ],
      };

      const result = validateComposition(ast, strictPolicy);
      expect(result.passed).toBe(false);
      expect(
        result.violations.some(
          (v) => v.category === 'disallowed_trait' && v.message.includes('@eval')
        )
      ).toBe(true);
    });

    it('should pass when no disallowed traits are present', () => {
      const ast: ASTNode[] = [
        {
          type: 'object',
          name: 'SafeObj',
          traits: ['@grabbable', '@glowing', '@visible'],
        },
      ];

      const result = validateComposition(ast, strictPolicy);
      // May still fail for other reasons (object count, etc.) but no disallowed_trait violations
      const traitViolations = result.violations.filter((v) => v.category === 'disallowed_trait');
      expect(traitViolations).toHaveLength(0);
    });

    it('should report multiple disallowed traits', () => {
      const ast: ASTNode[] = [
        {
          type: 'object',
          name: 'MultiDanger',
          traits: ['@unsafe', '@eval', '@native_call'],
        },
      ];

      const result = validateComposition(ast, strictPolicy);
      const traitViolations = result.violations.filter((v) => v.category === 'disallowed_trait');
      expect(traitViolations.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('combined validation', () => {
    it('should report multiple violation types simultaneously', () => {
      // Create AST that violates multiple rules
      const ast: ASTNode[] = Array.from({ length: 150 }, (_, i) => ({
        type: 'object',
        name: `Obj${i}`,
        traits: ['@unsafe'],
      }));

      const result = validateComposition(ast, strictPolicy);
      expect(result.passed).toBe(false);

      const categories = new Set(result.violations.map((v) => v.category));
      expect(categories.has('object_count')).toBe(true);
      expect(categories.has('disallowed_trait')).toBe(true);
    });
  });
});

// =============================================================================
// IMPORT VALIDATION TESTS
// =============================================================================

describe('validateImports', () => {
  it('should pass all imports when wildcard is in allowed hosts', () => {
    const policy = createDefaultPolicy(); // has '*' in allowedHosts
    const imports: ImportDeclaration[] = [
      { source: 'https://evil.com/malware.js' },
      { source: 'https://unknown.example.org/lib.js' },
    ];

    const result = validateImports(imports, policy);
    expect(result.passed).toBe(true);
  });

  it('should block imports from disallowed hosts', () => {
    const policy = mergePolicy(createDefaultPolicy(), {
      network: { allowedHosts: ['api.holoscript.net', 'cdn.holoscript.net'] },
    });

    const imports: ImportDeclaration[] = [
      { source: 'https://api.holoscript.net/v1/lib.js' },
      { source: 'https://evil.com/malware.js' },
    ];

    const result = validateImports(imports, policy);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.message.includes('evil.com'))).toBe(true);
  });

  it('should allow imports from permitted hosts', () => {
    const policy = mergePolicy(createDefaultPolicy(), {
      network: { allowedHosts: ['api.holoscript.net'] },
    });

    const imports: ImportDeclaration[] = [{ source: 'https://api.holoscript.net/v1/lib.js' }];

    const result = validateImports(imports, policy);
    expect(result.passed).toBe(true);
  });

  it('should ignore non-URL imports', () => {
    const policy = createStrictPolicy(); // no allowed hosts

    const imports: ImportDeclaration[] = [
      { source: './local-module' },
      { source: '../utils/helpers' },
      { source: '@holoscript/core' },
    ];

    const result = validateImports(imports, policy);
    expect(result.passed).toBe(true);
  });

  it('should handle empty imports array', () => {
    const policy = createStrictPolicy();

    const result = validateImports([], policy);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

// =============================================================================
// VULNERABILITY SCANNING TESTS
// =============================================================================

describe('scanForVulnerabilities', () => {
  describe('eval detection', () => {
    it('should detect eval() usage', () => {
      const code = `
        const x = 10;
        const result = eval("x + 5");
      `;

      const result = scanForVulnerabilities(code);
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.category === 'code_injection')).toBe(true);
    });

    it('should detect new Function() usage', () => {
      const code = `
        const fn = new Function("a", "b", "return a + b");
      `;

      const result = scanForVulnerabilities(code);
      expect(result.passed).toBe(false);
      expect(
        result.violations.some(
          (v) => v.category === 'code_injection' && v.message.includes('Function')
        )
      ).toBe(true);
    });
  });

  describe('script injection detection', () => {
    it('should detect innerHTML assignment', () => {
      const code = `
        element.innerHTML = userInput;
      `;

      const result = scanForVulnerabilities(code);
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.category === 'script_injection')).toBe(true);
    });

    it('should detect script tags', () => {
      const code = `
        const html = '<script>alert("xss")</script>';
      `;

      const result = scanForVulnerabilities(code);
      expect(result.passed).toBe(false);
      expect(
        result.violations.some(
          (v) => v.category === 'script_injection' && v.message.includes('Script tag')
        )
      ).toBe(true);
    });

    it('should detect document.write', () => {
      const code = `
        document.write("<h1>Hello</h1>");
      `;

      const result = scanForVulnerabilities(code);
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.message.includes('document.write'))).toBe(true);
    });
  });

  describe('prototype pollution detection', () => {
    it('should detect __proto__ access', () => {
      const code = `
        obj.__proto__.polluted = true;
      `;

      const result = scanForVulnerabilities(code);
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.category === 'prototype_pollution')).toBe(true);
    });
  });

  describe('safe code', () => {
    it('should pass clean code with no vulnerabilities', () => {
      const code = `
        const x = 10;
        const y = 20;
        const sum = x + y;
        console.log(sum);

        function add(a, b) {
          return a + b;
        }

        const arr = [1, 2, 3].map(n => n * 2);
      `;

      const result = scanForVulnerabilities(code);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass empty code', () => {
      const result = scanForVulnerabilities('');
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('line number reporting', () => {
    it('should report correct line numbers for violations', () => {
      const code = `const safe = 1;
const alsoSafe = 2;
const bad = eval("1+1");`;

      const result = scanForVulnerabilities(code);
      expect(result.passed).toBe(false);

      const evalViolation = result.violations.find((v) => v.message.includes('eval'));
      expect(evalViolation).toBeDefined();
      expect(evalViolation!.line).toBe(3);
    });
  });

  describe('multiple vulnerabilities', () => {
    it('should detect multiple vulnerability types', () => {
      const code = `
        eval("dangerous");
        element.innerHTML = data;
        obj.__proto__.x = 1;
      `;

      const result = scanForVulnerabilities(code);
      expect(result.passed).toBe(false);

      const categories = new Set(result.violations.map((v) => v.category));
      expect(categories.has('code_injection')).toBe(true);
      expect(categories.has('script_injection')).toBe(true);
      expect(categories.has('prototype_pollution')).toBe(true);
    });
  });
});

// =============================================================================
// PACKAGE SIGNING TESTS
// =============================================================================

describe('PackageSigner', () => {
  describe('generateKeyPair', () => {
    it('should generate a valid ed25519 key pair', () => {
      const keyPair = generateKeyPair();

      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(typeof keyPair.publicKey).toBe('string');
      expect(typeof keyPair.privateKey).toBe('string');
      expect(keyPair.publicKey.length).toBeGreaterThan(0);
      expect(keyPair.privateKey.length).toBeGreaterThan(0);
    });

    it('should generate unique key pairs', () => {
      const kp1 = generateKeyPair();
      const kp2 = generateKeyPair();

      expect(kp1.publicKey).not.toBe(kp2.publicKey);
      expect(kp1.privateKey).not.toBe(kp2.privateKey);
    });
  });

  describe('signPackage and verifySignature', () => {
    it('should sign and verify content successfully', () => {
      const keyPair = generateKeyPair();
      const content = 'Hello, HoloScript package!';

      const signature = signPackage(content, keyPair.privateKey);
      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(0);

      const isValid = verifySignature(content, signature, keyPair.publicKey);
      expect(isValid).toBe(true);
    });

    it('should reject tampered content', () => {
      const keyPair = generateKeyPair();
      const content = 'Original content';

      const signature = signPackage(content, keyPair.privateKey);
      const isValid = verifySignature('Tampered content', signature, keyPair.publicKey);
      expect(isValid).toBe(false);
    });

    it('should reject wrong public key', () => {
      const keyPair1 = generateKeyPair();
      const keyPair2 = generateKeyPair();
      const content = 'Test content';

      const signature = signPackage(content, keyPair1.privateKey);
      const isValid = verifySignature(content, signature, keyPair2.publicKey);
      expect(isValid).toBe(false);
    });

    it('should reject invalid signature', () => {
      const keyPair = generateKeyPair();
      const content = 'Test content';

      // Use a base64 string that is definitely not a valid signature
      const invalidSig = btoa('this-is-not-a-valid-signature-at-all');
      const isValid = verifySignature(content, invalidSig, keyPair.publicKey);
      expect(isValid).toBe(false);
    });

    it('should handle empty content', () => {
      const keyPair = generateKeyPair();
      const content = '';

      const signature = signPackage(content, keyPair.privateKey);
      const isValid = verifySignature(content, signature, keyPair.publicKey);
      expect(isValid).toBe(true);
    });

    it('should handle large content', () => {
      const keyPair = generateKeyPair();
      const content = 'x'.repeat(100000);

      const signature = signPackage(content, keyPair.privateKey);
      const isValid = verifySignature(content, signature, keyPair.publicKey);
      expect(isValid).toBe(true);
    });

    it('should handle unicode content', () => {
      const keyPair = generateKeyPair();
      const content =
        'object "Orbe Brillante" @grabbable @glowing {\n  geometry: "sphere"\n  position: [0, 1, -3]\n}';

      const signature = signPackage(content, keyPair.privateKey);
      const isValid = verifySignature(content, signature, keyPair.publicKey);
      expect(isValid).toBe(true);
    });
  });

  describe('createPackageManifest', () => {
    it('should create a valid manifest', async () => {
      const manifest = await createPackageManifest('@holoscript/my-package', '1.0.0', [
        'src/index.hs',
        'src/scene.holo',
        'README.md',
      ]);

      expect(manifest.name).toBe('@holoscript/my-package');
      expect(manifest.version).toBe('1.0.0');
      expect(manifest.files).toHaveLength(3);
      expect(manifest.contentHash).toBeDefined();
      expect(manifest.contentHash.length).toBe(64); // SHA-256 hex
      expect(manifest.createdAt).toBeDefined();
    });

    it('should sort files alphabetically', async () => {
      const manifest = await createPackageManifest('test-pkg', '2.0.0', [
        'z-file.ts',
        'a-file.ts',
        'm-file.ts',
      ]);

      expect(manifest.files).toEqual(['a-file.ts', 'm-file.ts', 'z-file.ts']);
    });
  });

  describe('canonicalizeManifest', () => {
    it('should produce deterministic JSON', async () => {
      const manifest = await createPackageManifest('test-pkg', '1.0.0', ['file1.hs', 'file2.hs']);

      const json1 = canonicalizeManifest(manifest);
      const json2 = canonicalizeManifest(manifest);

      expect(json1).toBe(json2);
      expect(() => JSON.parse(json1)).not.toThrow();
    });
  });

  describe('full signing roundtrip', () => {
    it('should sign and verify a complete package manifest', async () => {
      const keyPair = generateKeyPair();
      const manifest = await createPackageManifest('@holoscript/vr-scene', '3.1.0', [
        'scene.holo',
        'assets/orb.hs',
        'assets/portal.hsplus',
      ]);

      const canonical = canonicalizeManifest(manifest);
      const signature = signPackage(canonical, keyPair.privateKey);
      const isValid = verifySignature(canonical, signature, keyPair.publicKey);

      expect(isValid).toBe(true);
    });
  });
});

// =============================================================================
// SANDBOX EXECUTOR TESTS
// =============================================================================

describe('SandboxExecutor', () => {
  describe('createSandbox', () => {
    it('should create a sandbox in idle state', () => {
      const policy = createDefaultPolicy();
      const sandbox = createSandbox(policy);

      expect(sandbox.id).toBeDefined();
      expect(sandbox.state).toBe('idle');
      expect(sandbox.policy).toBe(policy);
      expect(sandbox.memoryUsed).toBe(0);
      expect(sandbox.cpuTimeUsed).toBe(0);
      expect(sandbox.createdAt).toBeGreaterThan(0);
    });

    it('should create sandboxes with unique IDs', () => {
      const policy = createDefaultPolicy();
      const s1 = createSandbox(policy);
      const s2 = createSandbox(policy);

      expect(s1.id).not.toBe(s2.id);
    });
  });

  describe('execute', () => {
    it('should execute simple code and return result', async () => {
      const policy = createDefaultPolicy();
      const sandbox = createSandbox(policy);

      const result = await execute('return 2 + 3;', sandbox);

      expect(result.success).toBe(true);
      expect(result.result).toBe(5);
      expect(result.memoryUsed).toBeGreaterThan(0);
      expect(result.cpuTimeUsed).toBeGreaterThanOrEqual(0);

      destroy(sandbox);
    });

    it('should execute code with Math operations', async () => {
      const policy = createDefaultPolicy();
      const sandbox = createSandbox(policy);

      const result = await execute('return Math.max(10, 20, 5);', sandbox);

      expect(result.success).toBe(true);
      expect(result.result).toBe(20);

      destroy(sandbox);
    });

    it('should execute code with JSON operations', async () => {
      const policy = createDefaultPolicy();
      const sandbox = createSandbox(policy);

      const result = await execute('return JSON.stringify({ name: "test", value: 42 });', sandbox);

      expect(result.success).toBe(true);
      expect(result.result).toBe('{"name":"test","value":42}');

      destroy(sandbox);
    });

    it('should block access to process', async () => {
      const policy = createDefaultPolicy();
      const sandbox = createSandbox(policy);

      const result = await execute('return typeof process;', sandbox);

      expect(result.success).toBe(true);
      expect(result.result).toBe('undefined');

      destroy(sandbox);
    });

    it('should block access to require', async () => {
      const policy = createDefaultPolicy();
      const sandbox = createSandbox(policy);

      const result = await execute('return typeof require;', sandbox);

      expect(result.success).toBe(true);
      expect(result.result).toBe('undefined');

      destroy(sandbox);
    });

    it('should catch runtime errors', async () => {
      const policy = createDefaultPolicy();
      const sandbox = createSandbox(policy);

      const result = await execute('throw new Error("test error");', sandbox);

      expect(result.success).toBe(false);
      expect(result.error).toContain('test error');

      destroy(sandbox);
    });

    it('should refuse execution on destroyed sandbox', async () => {
      const policy = createDefaultPolicy();
      const sandbox = createSandbox(policy);

      destroy(sandbox);

      const result = await execute('return 1;', sandbox);
      expect(result.success).toBe(false);
      expect(result.error).toContain('destroyed');
    });

    it('should reject code that exceeds memory limit', async () => {
      const policy = mergePolicy(createDefaultPolicy(), {
        sandbox: { memoryLimit: 0 }, // 0 MB - nothing can fit
      });
      const sandbox = createSandbox(policy);

      const result = await execute('return 1;', sandbox);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Memory limit exceeded');

      destroy(sandbox);
    });

    it('should track cumulative memory usage', async () => {
      const policy = createDefaultPolicy();
      const sandbox = createSandbox(policy);

      await execute('return 1;', sandbox);
      const mem1 = sandbox.memoryUsed;

      await execute('return 2;', sandbox);
      const mem2 = sandbox.memoryUsed;

      expect(mem2).toBeGreaterThan(mem1);

      destroy(sandbox);
    });
  });

  describe('destroy', () => {
    it('should set sandbox state to destroyed', () => {
      const policy = createDefaultPolicy();
      const sandbox = createSandbox(policy);

      destroy(sandbox);

      expect(sandbox.state).toBe('destroyed');
      expect(sandbox.memoryUsed).toBe(0);
      expect(sandbox.cpuTimeUsed).toBe(0);
    });

    it('should be safe to call multiple times', () => {
      const policy = createDefaultPolicy();
      const sandbox = createSandbox(policy);

      destroy(sandbox);
      destroy(sandbox);

      expect(sandbox.state).toBe('destroyed');
    });
  });
});
