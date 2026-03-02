/**
 * @fileoverview Comprehensive tests for HoloScript Plugin Marketplace Backend
 *
 * Tests cover:
 *   - Plugin package format spec (types)
 *   - Digital signature service (keygen, sign, verify)
 *   - Plugin marketplace service (CRUD, search, ratings)
 *   - Install pipeline (download, verify, extract, enable)
 *   - Marketplace UI data types
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// =============================================================================
// PLUGIN SIGNATURE SERVICE TESTS
// =============================================================================

describe('PluginSignatureService', () => {
  let sigService: any;

  beforeEach(async () => {
    const { PluginSignatureService } = await import('../PluginSignatureService.js');
    sigService = new PluginSignatureService();
  });

  describe('key management', () => {
    it('should generate a valid Ed25519 keypair', async () => {
      const { PluginSignatureService } = await import('../PluginSignatureService.js');
      const keypair = PluginSignatureService.generateKeypair();

      expect(keypair.privateKeyPem).toContain('PRIVATE KEY');
      expect(keypair.publicKeyBase64).toBeDefined();
      expect(keypair.fingerprint).toHaveLength(16);

      // Raw public key should be 32 bytes
      const pubKeyBuffer = Buffer.from(keypair.publicKeyBase64, 'base64');
      expect(pubKeyBuffer.length).toBe(32);
    });

    it('should register a signing key', async () => {
      const { PluginSignatureService } = await import('../PluginSignatureService.js');
      const keypair = PluginSignatureService.generateKeypair();

      const result = await sigService.registerKey('author-1', keypair.publicKeyBase64, 'test-key');

      expect(result.keyId).toMatch(/^key_/);
      expect(result.fingerprint).toBe(keypair.fingerprint);
    });

    it('should reject duplicate key registration', async () => {
      const { PluginSignatureService } = await import('../PluginSignatureService.js');
      const keypair = PluginSignatureService.generateKeypair();

      await sigService.registerKey('author-1', keypair.publicKeyBase64);

      await expect(
        sigService.registerKey('author-2', keypair.publicKeyBase64),
      ).rejects.toThrow('already registered');
    });

    it('should reject invalid key length', async () => {
      await expect(
        sigService.registerKey('author-1', Buffer.from('too-short').toString('base64')),
      ).rejects.toThrow('expected 32 bytes');
    });

    it('should revoke a key', async () => {
      const { PluginSignatureService } = await import('../PluginSignatureService.js');
      const keypair = PluginSignatureService.generateKeypair();
      const { keyId } = await sigService.registerKey('author-1', keypair.publicKeyBase64);

      await sigService.revokeKey(keyId, 'author-1', 'compromised');

      const key = await sigService.getKey(keyId);
      expect(key?.revoked).toBe(true);
      expect(key?.revokedReason).toBe('compromised');
    });

    it('should reject revocation by non-owner', async () => {
      const { PluginSignatureService } = await import('../PluginSignatureService.js');
      const keypair = PluginSignatureService.generateKeypair();
      const { keyId } = await sigService.registerKey('author-1', keypair.publicKeyBase64);

      await expect(
        sigService.revokeKey(keyId, 'author-2'),
      ).rejects.toThrow('Only the key owner');
    });

    it('should list keys for an author', async () => {
      const { PluginSignatureService } = await import('../PluginSignatureService.js');
      const keypair1 = PluginSignatureService.generateKeypair();
      const keypair2 = PluginSignatureService.generateKeypair();

      await sigService.registerKey('author-1', keypair1.publicKeyBase64, 'key-1');
      await sigService.registerKey('author-1', keypair2.publicKeyBase64, 'key-2');

      const keys = await sigService.getKeysForAuthor('author-1');
      expect(keys).toHaveLength(2);
    });
  });

  describe('content hashing', () => {
    it('should compute deterministic SHA-256 hash', () => {
      const hash1 = sigService.computeContentHash('hello world');
      const hash2 = sigService.computeContentHash('hello world');
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('should produce different hashes for different content', () => {
      const hash1 = sigService.computeContentHash('content A');
      const hash2 = sigService.computeContentHash('content B');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('signature creation and verification', () => {
    it('should create and verify a valid signature', async () => {
      const { PluginSignatureService } = await import('../PluginSignatureService.js');
      const keypair = PluginSignatureService.generateKeypair();

      // Register the key
      await sigService.registerKey('author-1', keypair.publicKeyBase64);

      // Create a signature
      const contentHash = sigService.computeContentHash('test package content');
      const signature = sigService.createSignature(
        contentHash,
        keypair.privateKeyPem,
        keypair.publicKeyBase64,
      );

      expect(signature.algorithm).toBe('Ed25519');
      expect(signature.signature).toBeDefined();
      expect(signature.publicKey).toBe(keypair.publicKeyBase64);
      expect(signature.keyFingerprint).toBe(keypair.fingerprint);

      // Verify the signature
      const result = await sigService.verifySignature(contentHash, signature);
      expect(result.valid).toBe(true);
      expect(result.trusted).toBe(true);
      expect(result.author).toBe('author-1');
      expect(result.errors).toHaveLength(0);
    });

    it('should detect tampered content', async () => {
      const { PluginSignatureService } = await import('../PluginSignatureService.js');
      const keypair = PluginSignatureService.generateKeypair();

      await sigService.registerKey('author-1', keypair.publicKeyBase64);

      const originalHash = sigService.computeContentHash('original content');
      const signature = sigService.createSignature(
        originalHash,
        keypair.privateKeyPem,
        keypair.publicKeyBase64,
      );

      // Verify against different content hash (tampered)
      const tamperedHash = sigService.computeContentHash('tampered content');
      const result = await sigService.verifySignature(tamperedHash, signature);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('verification failed'))).toBe(true);
    });

    it('should flag revoked keys', async () => {
      const { PluginSignatureService } = await import('../PluginSignatureService.js');
      const keypair = PluginSignatureService.generateKeypair();

      const { keyId } = await sigService.registerKey('author-1', keypair.publicKeyBase64);

      const contentHash = sigService.computeContentHash('test content');
      const signature = sigService.createSignature(
        contentHash,
        keypair.privateKeyPem,
        keypair.publicKeyBase64,
      );

      // Revoke the key
      await sigService.revokeKey(keyId, 'author-1');

      // Verify -- should fail due to revoked key
      const result = await sigService.verifySignature(contentHash, signature);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('revoked'))).toBe(true);
    });

    it('should warn about unregistered keys', async () => {
      const { PluginSignatureService } = await import('../PluginSignatureService.js');
      const keypair = PluginSignatureService.generateKeypair();

      // Do NOT register the key
      const contentHash = sigService.computeContentHash('test content');
      const signature = sigService.createSignature(
        contentHash,
        keypair.privateKeyPem,
        keypair.publicKeyBase64,
      );

      const result = await sigService.verifySignature(contentHash, signature);
      expect(result.valid).toBe(true); // Crypto is valid
      expect(result.trusted).toBe(false); // But not trusted (unregistered)
      expect(result.warnings.some((w: string) => w.includes('not registered'))).toBe(true);
    });
  });

  describe('package integrity', () => {
    it('should verify package with matching hash', async () => {
      const content = Buffer.from('package content here');
      const hash = sigService.computeContentHash(content);

      const result = await sigService.verifyPackageIntegrity(content, hash);
      expect(result.valid).toBe(true);
      expect(result.warnings.some((w: string) => w.includes('not signed'))).toBe(true);
    });

    it('should reject package with mismatched hash', async () => {
      const content = Buffer.from('real content');
      const wrongHash = 'deadbeef0000000000000000000000000000000000000000000000000000dead';

      const result = await sigService.verifyPackageIntegrity(content, wrongHash);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('mismatch'))).toBe(true);
    });
  });
});

// =============================================================================
// PLUGIN MARKETPLACE SERVICE TESTS
// =============================================================================

describe('PluginMarketplaceService', () => {
  let marketplace: any;

  const sampleManifest = {
    id: '@test/analytics-dashboard',
    name: 'Analytics Dashboard',
    version: '1.0.0',
    description: 'Real-time analytics for your HoloScript projects',
    author: { name: 'testuser', verified: false },
    license: 'MIT',
    category: 'analytics',
    keywords: ['analytics', 'dashboard', 'metrics'],
    entrypoint: { main: 'dist/index.js' },
    security: {
      permissions: ['scene:read', 'ui:panel', 'storage:local'] as any[],
      trustLevel: 'sandboxed' as const,
    },
    compatibility: {
      studioVersion: '>=3.40.0',
      platforms: ['web', 'nodejs'],
    },
  };

  beforeEach(async () => {
    const { PluginMarketplaceService } = await import('../PluginMarketplaceService.js');
    marketplace = new PluginMarketplaceService();
    marketplace.registerSession('test-token', 'testuser', 'authenticated', 'testuser');
  });

  describe('publish', () => {
    it('should publish a valid plugin', async () => {
      const result = await marketplace.publishPlugin(
        {
          manifest: sampleManifest,
          bundle: Buffer.from('console.log("plugin")').toString('base64'),
        },
        'test-token',
      );

      expect(result.success).toBe(true);
      expect(result.pluginId).toBe('@test/analytics-dashboard');
      expect(result.version).toBe('1.0.0');
      expect(result.shasum).toHaveLength(64);
      expect(result.packageUrl).toContain('/api/plugins/');
    });

    it('should reject publish without authentication', async () => {
      const result = await marketplace.publishPlugin(
        {
          manifest: sampleManifest,
          bundle: 'dGVzdA==',
        },
        'invalid-token',
      );

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('Authentication');
    });

    it('should reject duplicate version', async () => {
      await marketplace.publishPlugin(
        { manifest: sampleManifest, bundle: 'dGVzdA==' },
        'test-token',
      );

      const result = await marketplace.publishPlugin(
        { manifest: sampleManifest, bundle: 'dGVzdA==' },
        'test-token',
      );

      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('already exists');
    });

    it('should reject invalid manifest (missing fields)', async () => {
      const result = await marketplace.publishPlugin(
        {
          manifest: {
            id: 'x',
            name: '',
            version: 'bad',
            description: 'short',
            author: {},
            category: '',
            keywords: [],
            entrypoint: {},
            security: {},
            compatibility: {},
          },
          bundle: 'dGVzdA==',
        },
        'test-token',
      );

      expect(result.success).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should warn about missing optional fields', async () => {
      const result = await marketplace.publishPlugin(
        { manifest: sampleManifest, bundle: 'dGVzdA==' },
        'test-token',
      );

      expect(result.success).toBe(true);
      expect(result.warnings?.some((w: string) => w.includes('README'))).toBe(true);
      expect(result.warnings?.some((w: string) => w.includes('screenshots'))).toBe(true);
    });

    it('should publish with README and changelog', async () => {
      const result = await marketplace.publishPlugin(
        {
          manifest: {
            ...sampleManifest,
            version: '1.1.0',
            screenshots: [{ path: 'assets/ss.png', alt: 'Screenshot' }],
          },
          bundle: 'dGVzdA==',
          readme: '# My Plugin\nGreat plugin!',
          changelog: '## 1.1.0\n- Initial release',
        },
        'test-token',
      );

      expect(result.success).toBe(true);
      // No README or screenshot warnings
      expect(result.warnings?.some((w: string) => w.includes('README'))).toBeFalsy();
      expect(result.warnings?.some((w: string) => w.includes('screenshots'))).toBeFalsy();
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      // Publish multiple plugins
      await marketplace.publishPlugin(
        {
          manifest: sampleManifest,
          bundle: 'dGVzdA==',
        },
        'test-token',
      );

      await marketplace.publishPlugin(
        {
          manifest: {
            ...sampleManifest,
            id: '@test/ui-toolkit',
            name: 'UI Toolkit',
            version: '2.0.0',
            description: 'Comprehensive UI toolkit for Studio plugins',
            category: 'ui',
            keywords: ['ui', 'toolkit', 'components'],
            security: {
              permissions: ['ui:panel', 'ui:toolbar'],
              trustLevel: 'sandboxed',
            },
          },
          bundle: 'dGVzdB==',
        },
        'test-token',
      );

      await marketplace.publishPlugin(
        {
          manifest: {
            ...sampleManifest,
            id: '@test/network-inspector',
            name: 'Network Inspector',
            version: '1.5.0',
            description: 'Inspect and debug network requests in real-time',
            category: 'debug',
            keywords: ['network', 'debug', 'inspector'],
            pricing: { model: 'paid', price: 999 },
            security: {
              permissions: ['network:fetch', 'ui:panel'],
              trustLevel: 'sandboxed',
            },
          },
          bundle: 'dGVzdC==',
        },
        'test-token',
      );
    });

    it('should search by query string', async () => {
      const result = await marketplace.searchPlugins({ q: 'analytics' });
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].name).toBe('Analytics Dashboard');
    });

    it('should search by category', async () => {
      const result = await marketplace.searchPlugins({ category: 'ui' });
      expect(result.results.length).toBe(1);
      expect(result.results[0].name).toBe('UI Toolkit');
    });

    it('should search by keyword', async () => {
      const result = await marketplace.searchPlugins({ keywords: ['debug'] });
      expect(result.results.length).toBe(1);
      expect(result.results[0].name).toBe('Network Inspector');
    });

    it('should paginate results', async () => {
      const result = await marketplace.searchPlugins({ limit: 2, page: 1 });
      expect(result.results.length).toBeLessThanOrEqual(2);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(true);
    });

    it('should sort by name ascending', async () => {
      const result = await marketplace.searchPlugins({ sortBy: 'name', sortOrder: 'asc' });
      expect(result.results[0].name).toBe('Analytics Dashboard');
    });

    it('should return permissions in summary', async () => {
      const result = await marketplace.searchPlugins({ q: 'analytics' });
      expect(result.results[0].permissions).toContain('scene:read');
    });
  });

  describe('getPlugin', () => {
    beforeEach(async () => {
      await marketplace.publishPlugin(
        {
          manifest: sampleManifest,
          bundle: 'dGVzdA==',
          readme: '# Analytics Dashboard',
        },
        'test-token',
      );
    });

    it('should get plugin detail data', async () => {
      const detail = await marketplace.getPlugin('@test/analytics-dashboard');

      expect(detail.manifest.name).toBe('Analytics Dashboard');
      expect(detail.versions).toBeDefined();
      expect(detail.stats).toBeDefined();
      expect(detail.ratings).toBeDefined();
      expect(detail.readmeHtml).toContain('Analytics Dashboard');
    });

    it('should throw for non-existent plugin', async () => {
      await expect(
        marketplace.getPlugin('@test/nonexistent'),
      ).rejects.toThrow('not found');
    });
  });

  describe('unpublish and deprecate', () => {
    beforeEach(async () => {
      await marketplace.publishPlugin(
        { manifest: sampleManifest, bundle: 'dGVzdA==' },
        'test-token',
      );
    });

    it('should unpublish a plugin', async () => {
      await marketplace.unpublishPlugin('@test/analytics-dashboard', undefined, 'test-token');
      await expect(
        marketplace.getPlugin('@test/analytics-dashboard'),
      ).rejects.toThrow('not found');
    });

    it('should deprecate a plugin', async () => {
      await marketplace.deprecatePlugin(
        '@test/analytics-dashboard',
        'No longer maintained',
        '@test/better-analytics',
        'test-token',
      );

      const detail = await marketplace.getPlugin('@test/analytics-dashboard');
      expect(detail.manifest.deprecated).toBe(true);
      expect(detail.manifest.deprecationMessage).toContain('No longer maintained');
      expect(detail.manifest.deprecationMessage).toContain('better-analytics');
    });
  });

  describe('ratings', () => {
    beforeEach(async () => {
      await marketplace.publishPlugin(
        { manifest: sampleManifest, bundle: 'dGVzdA==' },
        'test-token',
      );

      marketplace.registerSession('user2-token', 'user2', 'authenticated', 'user2');
      marketplace.registerSession('user3-token', 'user3', 'authenticated', 'user3');
    });

    it('should rate a plugin', async () => {
      await marketplace.ratePlugin(
        '@test/analytics-dashboard',
        5,
        { title: 'Amazing!', body: 'Best analytics plugin ever!' },
        'user2-token',
      );

      const ratings = await marketplace.getPluginRatings('@test/analytics-dashboard');
      expect(ratings.average).toBe(5);
      expect(ratings.count).toBe(1);
      expect(ratings.reviews[0].title).toBe('Amazing!');
    });

    it('should calculate average rating', async () => {
      await marketplace.ratePlugin('@test/analytics-dashboard', 5, undefined, 'user2-token');
      await marketplace.ratePlugin('@test/analytics-dashboard', 3, undefined, 'user3-token');

      const ratings = await marketplace.getPluginRatings('@test/analytics-dashboard');
      expect(ratings.average).toBe(4);
      expect(ratings.count).toBe(2);
    });

    it('should show rating distribution', async () => {
      await marketplace.ratePlugin('@test/analytics-dashboard', 5, undefined, 'user2-token');
      await marketplace.ratePlugin('@test/analytics-dashboard', 3, undefined, 'user3-token');

      const ratings = await marketplace.getPluginRatings('@test/analytics-dashboard');
      expect(ratings.distribution[5]).toBe(1);
      expect(ratings.distribution[3]).toBe(1);
      expect(ratings.distribution[1]).toBe(0);
    });

    it('should reject invalid rating', async () => {
      await expect(
        marketplace.ratePlugin('@test/analytics-dashboard', 6, undefined, 'user2-token'),
      ).rejects.toThrow('1 and 5');
    });
  });

  describe('download stats', () => {
    beforeEach(async () => {
      await marketplace.publishPlugin(
        { manifest: sampleManifest, bundle: 'dGVzdA==' },
        'test-token',
      );
    });

    it('should track downloads', async () => {
      await marketplace.recordPluginDownload('@test/analytics-dashboard', '1.0.0');
      await marketplace.recordPluginDownload('@test/analytics-dashboard', '1.0.0');

      const stats = await marketplace.getPluginStats('@test/analytics-dashboard');
      expect(stats.total).toBe(2);
      expect(stats.lastDay).toBe(2);
    });

    it('should return empty stats for unknown plugin', async () => {
      const stats = await marketplace.getPluginStats('unknown-plugin');
      expect(stats.total).toBe(0);
    });
  });

  describe('marketplace home', () => {
    beforeEach(async () => {
      await marketplace.publishPlugin(
        { manifest: sampleManifest, bundle: 'dGVzdA==' },
        'test-token',
      );
    });

    it('should return marketplace home data', async () => {
      const home = await marketplace.getMarketplaceHome();

      expect(home.popular).toBeDefined();
      expect(home.recent).toBeDefined();
      expect(home.trending).toBeDefined();
      expect(home.categories).toBeDefined();
      expect(home.totalPlugins).toBeGreaterThanOrEqual(1);
    });
  });

  describe('author profiles', () => {
    beforeEach(async () => {
      await marketplace.publishPlugin(
        { manifest: sampleManifest, bundle: 'dGVzdA==' },
        'test-token',
      );
    });

    it('should return author profile', async () => {
      const profile = await marketplace.getAuthorProfile('testuser');

      expect(profile.author.name).toBe('testuser');
      expect(profile.plugins.length).toBeGreaterThanOrEqual(1);
      expect(profile.totalDownloads).toBeDefined();
    });
  });

  describe('signing key management', () => {
    it('should register and revoke signing keys', async () => {
      const { PluginSignatureService } = await import('../PluginSignatureService.js');
      const keypair = PluginSignatureService.generateKeypair();

      const result = await marketplace.registerSigningKey(keypair.publicKeyBase64, 'test-token');
      expect(result.keyId).toBeDefined();
      expect(result.fingerprint).toHaveLength(16);

      // Revoke
      await marketplace.revokeSigningKey(result.keyId, 'test-token');

      // Verify the key is revoked
      const sigService = marketplace.getSignatureService();
      const key = await sigService.getKey(result.keyId);
      expect(key?.revoked).toBe(true);
    });
  });

  describe('dependency resolution', () => {
    it('should resolve plugin dependencies', async () => {
      // Publish a base plugin
      await marketplace.publishPlugin(
        {
          manifest: {
            ...sampleManifest,
            id: '@test/base-lib',
            name: 'Base Library',
            version: '1.0.0',
            description: 'Base library with no dependencies',
            keywords: ['base', 'library'],
          },
          bundle: 'dGVzdA==',
        },
        'test-token',
      );

      // Publish a plugin that depends on it
      await marketplace.publishPlugin(
        {
          manifest: {
            ...sampleManifest,
            id: '@test/derived-plugin',
            name: 'Derived Plugin',
            version: '1.0.0',
            description: 'Plugin depending on base library',
            keywords: ['derived'],
            dependencies: { '@test/base-lib': '^1.0.0' },
          },
          bundle: 'dGVzdA==',
        },
        'test-token',
      );

      const result = await marketplace.resolvePluginDependencies('@test/derived-plugin');
      expect(result.resolved).toHaveLength(1);
      expect(result.resolved[0].pluginId).toBe('@test/base-lib');
    });

    it('should report missing dependencies', async () => {
      await marketplace.publishPlugin(
        {
          manifest: {
            ...sampleManifest,
            id: '@test/orphan-plugin',
            name: 'Orphan Plugin',
            version: '1.0.0',
            description: 'Plugin with missing dependency',
            keywords: ['orphan'],
            dependencies: { '@test/nonexistent': '^1.0.0' },
          },
          bundle: 'dGVzdA==',
        },
        'test-token',
      );

      const result = await marketplace.resolvePluginDependencies('@test/orphan-plugin');
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0]).toContain('nonexistent');
    });
  });

  describe('health', () => {
    it('should return health status', async () => {
      const health = await marketplace.getHealth();
      expect(health.status).toBe('ok');
      expect(health.components.pluginRegistry).toBe('ok');
      expect(health.components.signatureService).toBe('ok');
    });
  });
});

// =============================================================================
// PLUGIN INSTALL PIPELINE TESTS
// =============================================================================

describe('PluginInstallPipeline', () => {
  let pipeline: any;
  const events: any[] = [];

  const mockManifest = {
    $schema: 'https://holoscript.dev/schemas/plugin-manifest/v1',
    id: '@test/mock-plugin',
    name: 'Mock Plugin',
    version: '1.0.0',
    description: 'A mock plugin for testing the install pipeline',
    author: { name: 'testauthor', verified: false },
    license: 'MIT',
    category: 'utility',
    keywords: ['test', 'mock'],
    entrypoint: { main: 'dist/index.js' },
    security: { permissions: ['scene:read'], trustLevel: 'sandboxed' },
    compatibility: { studioVersion: '>=3.40.0' },
  };

  beforeEach(async () => {
    events.length = 0;

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/download')) {
        return {
          ok: true,
          text: async () => 'mock-bundle-content',
          headers: new Map([['x-shasum', '']]),
        };
      }
      // Metadata endpoint
      return {
        ok: true,
        json: async () => ({ data: { manifest: mockManifest } }),
        headers: new Map(),
      };
    });

    // Override the headers.get to work with mock
    mockFetch.mockImplementation(async (url: string) => {
      const isDownload = url.includes('/download');
      const content = isDownload ? 'mock-bundle-content' : JSON.stringify({ data: { manifest: mockManifest } });

      // Compute actual SHA for integrity check
      const { createHash } = await import('crypto');
      const hash = createHash('sha256').update(content).digest('hex');

      return {
        ok: true,
        text: async () => content,
        json: async () => ({ data: { manifest: mockManifest } }),
        headers: {
          get: (name: string) => {
            if (name === 'x-shasum') return hash;
            return null;
          },
        },
      };
    });

    const { PluginInstallPipeline } = await import('../PluginInstallPipeline.js');
    pipeline = new PluginInstallPipeline({
      marketplaceUrl: 'https://marketplace.holoscript.dev/api',
      installDir: '/tmp/holoscript-plugins',
      verifySignatures: false, // Skip for unit tests
      autoGrantPermissions: true,
      fetchFn: mockFetch as any,
      onEvent: (event: any) => events.push(event),
    });
  });

  describe('install', () => {
    it('should install a plugin through the full pipeline', async () => {
      const result = await pipeline.install({
        pluginId: '@test/mock-plugin',
      });

      expect(result.success).toBe(true);
      expect(result.plugin).toBeDefined();
      expect(result.plugin?.pluginId).toBe('@test/mock-plugin');
      expect(result.plugin?.version).toBe('1.0.0');
      expect(result.plugin?.enabled).toBe(true);
      expect(result.plugin?.state).toBe('enabled');
      expect(result.plugin?.grantedPermissions).toContain('scene:read');
    });

    it('should emit progress events', async () => {
      await pipeline.install({ pluginId: '@test/mock-plugin' });

      const stateEvents = events.filter((e) => e.type === 'state_change');
      expect(stateEvents.length).toBeGreaterThan(0);

      const progressEvents = events.filter((e) => e.type === 'progress');
      expect(progressEvents.length).toBeGreaterThan(0);

      const completeEvents = events.filter((e) => e.type === 'complete');
      expect(completeEvents).toHaveLength(1);
    });

    it('should install as disabled when autoEnable is false', async () => {
      const result = await pipeline.install({
        pluginId: '@test/mock-plugin',
        autoEnable: false,
      });

      expect(result.success).toBe(true);
      expect(result.plugin?.enabled).toBe(false);
      expect(result.plugin?.state).toBe('installed');
    });

    it('should pre-grant specific permissions', async () => {
      const result = await pipeline.install({
        pluginId: '@test/mock-plugin',
        preGrantPermissions: ['scene:read'] as any,
      });

      expect(result.success).toBe(true);
      expect(result.plugin?.grantedPermissions).toEqual(['scene:read']);
    });
  });

  describe('uninstall', () => {
    it('should uninstall a plugin', async () => {
      await pipeline.install({ pluginId: '@test/mock-plugin' });
      const result = await pipeline.uninstall('@test/mock-plugin');

      expect(result.success).toBe(true);
      expect(pipeline.getInstalledPlugin('@test/mock-plugin')).toBeNull();
    });

    it('should fail to uninstall non-installed plugin', async () => {
      const result = await pipeline.uninstall('@test/nonexistent');
      expect(result.success).toBe(false);
    });
  });

  describe('enable/disable', () => {
    beforeEach(async () => {
      await pipeline.install({ pluginId: '@test/mock-plugin', autoEnable: false });
    });

    it('should enable a plugin', async () => {
      const result = await pipeline.enablePlugin('@test/mock-plugin');
      expect(result).toBe(true);

      const installed = pipeline.getInstalledPlugin('@test/mock-plugin');
      expect(installed?.enabled).toBe(true);
      expect(installed?.state).toBe('enabled');
    });

    it('should disable a plugin', async () => {
      await pipeline.enablePlugin('@test/mock-plugin');
      const result = await pipeline.disablePlugin('@test/mock-plugin');
      expect(result).toBe(true);

      const installed = pipeline.getInstalledPlugin('@test/mock-plugin');
      expect(installed?.enabled).toBe(false);
      expect(installed?.state).toBe('disabled');
    });
  });

  describe('sandbox integration', () => {
    it('should generate SandboxCreateOptions for enabled plugins', async () => {
      await pipeline.install({ pluginId: '@test/mock-plugin' });

      const options = pipeline.getSandboxCreateOptions('@test/mock-plugin');
      expect(options).not.toBeNull();
      expect(options?.pluginId).toBe('@test/mock-plugin');
      expect(options?.pluginUrl).toContain('dist/index.js');
      expect(options?.manifest.permissions).toContain('scene:read');
      expect(options?.manifest.trustLevel).toBe('sandboxed');
    });

    it('should return null for disabled plugins', async () => {
      await pipeline.install({ pluginId: '@test/mock-plugin', autoEnable: false });

      const options = pipeline.getSandboxCreateOptions('@test/mock-plugin');
      expect(options).toBeNull();
    });

    it('should batch-generate all enabled plugin options', async () => {
      await pipeline.install({ pluginId: '@test/mock-plugin' });

      const allOptions = pipeline.getAllSandboxCreateOptions();
      expect(allOptions.length).toBe(1);
      expect(allOptions[0].pluginId).toBe('@test/mock-plugin');
    });
  });

  describe('query installed plugins', () => {
    it('should list all installed plugins', async () => {
      await pipeline.install({ pluginId: '@test/mock-plugin' });

      const installed = pipeline.getInstalledPlugins();
      expect(installed).toHaveLength(1);
    });

    it('should get enabled plugins', async () => {
      await pipeline.install({ pluginId: '@test/mock-plugin' });

      const enabled = pipeline.getEnabledPlugins();
      expect(enabled).toHaveLength(1);
    });
  });
});

// =============================================================================
// MODULE EXPORTS TESTS
// =============================================================================

describe('Plugin Marketplace Exports', () => {
  it('should export all plugin marketplace types and services', async () => {
    // PluginPackageSpec types (just validate the module loads)
    const spec = await import('../PluginPackageSpec.js');
    expect(spec).toBeDefined();

    // PluginSignatureService
    const { PluginSignatureService } = await import('../PluginSignatureService.js');
    expect(PluginSignatureService).toBeDefined();
    expect(typeof PluginSignatureService.generateKeypair).toBe('function');

    // PluginMarketplaceService
    const { PluginMarketplaceService, InMemoryPluginDatabase, PluginDownloadStatsTracker, PluginRatingService } =
      await import('../PluginMarketplaceService.js');
    expect(PluginMarketplaceService).toBeDefined();
    expect(InMemoryPluginDatabase).toBeDefined();
    expect(PluginDownloadStatsTracker).toBeDefined();
    expect(PluginRatingService).toBeDefined();

    // PluginInstallPipeline
    const { PluginInstallPipeline } = await import('../PluginInstallPipeline.js');
    expect(PluginInstallPipeline).toBeDefined();

    // Routes
    const { createPluginMarketplaceRoutes } = await import('../pluginRoutes.js');
    expect(createPluginMarketplaceRoutes).toBeDefined();
    expect(typeof createPluginMarketplaceRoutes).toBe('function');
  });
});
