import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { createDeployer, DeployConfig, BuildOutput } from '../index';
import { CloudflareDeployer } from '../CloudflareDeployer';
import { VercelDeployer } from '../VercelDeployer';
import { NginxDeployer } from '../NginxDeployer';
import { BaseDeployer } from '../BaseDeployer';

// ============================================================================
// Network + FS Mocks
// ============================================================================
//
// The CF + Vercel deployers make real HTTP calls to their platform APIs and
// read build-output files from disk. In tests we never want to hit the
// network or real paths like /tmp/build-output, so we stub fetch + fs.readFile.
//
// The fetch mock returns success envelopes WITHOUT a `result.url` / `url`
// field so that `createDeployment` falls back to the conventional URL
// (e.g. `https://<project>.pages.dev`). This lets the tests assert both
// the default URL shape AND the custom-domain fallback path.
//
// NginxDeployer is unaffected: it uses injectable sshExecutor/scpUploader
// mocks set up in its own beforeEach and does not touch fetch or fs.readFile.

function installDeployerNetworkMocks(): void {
  vi.spyOn(fs.promises, 'readFile').mockImplementation(
    async () => Buffer.from('mock-build-output')
  );

  const successfulResponse = () =>
    ({
      ok: true,
      status: 200,
      statusText: 'OK',
      // CF envelope: { success, result }. Vercel: bare object.
      // We return a union so both adapters parse without error; neither
      // includes a `url`/`result.url`, so createDeployment uses fallback.
      json: async () => ({
        success: true,
        result: { id: 'mock-deployment-id' },
        id: 'mock-vercel-id',
        readyState: 'READY',
        alias: [],
        deployments: [],
      }),
    }) as Response;

  vi.stubGlobal('fetch', vi.fn(async () => successfulResponse()));
}

// ============================================================================
// Test Helpers
// ============================================================================

function makeValidConfig(overrides?: Partial<DeployConfig>): DeployConfig {
  return {
    target: 'cloudflare',
    projectName: 'test-project',
    environment: 'staging',
    regions: ['us-east-1'],
    buildSettings: {
      minify: true,
      splitChunks: false,
      prerender: false,
    },
    ...overrides,
  };
}

function makeBuildOutput(overrides?: Partial<BuildOutput>): BuildOutput {
  return {
    outputDir: '/tmp/build-output',
    files: ['index.js', 'style.css'],
    totalSize: 1024,
    entrypoint: 'index.js',
    sourceMaps: false,
    ...overrides,
  };
}

// ============================================================================
// Config Validation Tests
// ============================================================================

describe('BaseDeployer - Config Validation', () => {
  let deployer: CloudflareDeployer;

  beforeEach(() => {
    deployer = new CloudflareDeployer({
      apiToken: 'test-token',
      accountId: 'test-account',
    });
  });

  it('should accept a valid config', () => {
    const config = makeValidConfig();
    expect(() => deployer.validateConfig(config)).not.toThrow();
  });

  it('should reject empty project name', () => {
    const config = makeValidConfig({ projectName: '' });
    expect(() => deployer.validateConfig(config)).toThrow('Project name is required');
  });

  it('should reject whitespace-only project name', () => {
    const config = makeValidConfig({ projectName: '   ' });
    expect(() => deployer.validateConfig(config)).toThrow('Project name is required');
  });

  it('should reject project names with invalid characters', () => {
    const config = makeValidConfig({ projectName: 'my project!' });
    expect(() => deployer.validateConfig(config)).toThrow(
      'Project name must contain only alphanumeric characters, hyphens, and underscores'
    );
  });

  it('should accept project names with hyphens and underscores', () => {
    const config = makeValidConfig({ projectName: 'my-project_v2' });
    expect(() => deployer.validateConfig(config)).not.toThrow();
  });

  it('should reject invalid target', () => {
    const config = makeValidConfig({ target: 'aws' as any });
    expect(() => deployer.validateConfig(config)).toThrow('Invalid target: aws');
  });

  it('should reject invalid environment', () => {
    const config = makeValidConfig({ environment: 'dev' as any });
    expect(() => deployer.validateConfig(config)).toThrow('Invalid environment: dev');
  });

  it('should accept production environment', () => {
    const config = makeValidConfig({ environment: 'production' });
    expect(() => deployer.validateConfig(config)).not.toThrow();
  });

  it('should reject empty regions array', () => {
    const config = makeValidConfig({ regions: [] });
    expect(() => deployer.validateConfig(config)).toThrow('At least one region is required');
  });

  it('should reject missing build settings', () => {
    const config = makeValidConfig();
    (config as any).buildSettings = undefined;
    expect(() => deployer.validateConfig(config)).toThrow('Build settings are required');
  });

  it('should reject non-boolean minify', () => {
    const config = makeValidConfig();
    (config as any).buildSettings.minify = 'true';
    expect(() => deployer.validateConfig(config)).toThrow('buildSettings.minify must be a boolean');
  });

  it('should reject non-boolean splitChunks', () => {
    const config = makeValidConfig();
    (config as any).buildSettings.splitChunks = 1;
    expect(() => deployer.validateConfig(config)).toThrow(
      'buildSettings.splitChunks must be a boolean'
    );
  });

  it('should reject non-boolean prerender', () => {
    const config = makeValidConfig();
    (config as any).buildSettings.prerender = null;
    expect(() => deployer.validateConfig(config)).toThrow(
      'buildSettings.prerender must be a boolean'
    );
  });

  it('should accept all valid targets', () => {
    for (const target of ['cloudflare', 'vercel', 'netlify', 'custom'] as const) {
      const config = makeValidConfig({ target });
      expect(() => deployer.validateConfig(config)).not.toThrow();
    }
  });
});

// ============================================================================
// Cloudflare Deployer Tests
// ============================================================================

describe('CloudflareDeployer', () => {
  let deployer: CloudflareDeployer;

  beforeEach(() => {
    installDeployerNetworkMocks();
    deployer = new CloudflareDeployer({
      apiToken: 'cf-test-token-123',
      accountId: 'cf-account-456',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should be an instance of BaseDeployer', () => {
    expect(deployer).toBeInstanceOf(BaseDeployer);
  });

  describe('deploy()', () => {
    it('should return a successful deploy result', async () => {
      const config = makeValidConfig({ target: 'cloudflare' });
      const buildOutput = makeBuildOutput();

      const result = await deployer.deploy(config, buildOutput);

      expect(result.success).toBe(true);
      expect(result.url).toContain('test-project');
      expect(result.deploymentId).toContain('cloudflare');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.regions).toEqual(['us-east-1']);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.error).toBeUndefined();
    });

    it('should use custom domain in URL when provided', async () => {
      const config = makeValidConfig({
        target: 'cloudflare',
        customDomain: 'app.example.com',
      });
      const buildOutput = makeBuildOutput();

      const result = await deployer.deploy(config, buildOutput);

      expect(result.success).toBe(true);
      expect(result.url).toBe('https://app.example.com');
    });

    it('should emit deploy:start and deploy:done events', async () => {
      const startHandler = vi.fn();
      const doneHandler = vi.fn();

      deployer.on('deploy:start', startHandler);
      deployer.on('deploy:done', doneHandler);

      const config = makeValidConfig({ target: 'cloudflare' });
      await deployer.deploy(config, makeBuildOutput());

      expect(startHandler).toHaveBeenCalledOnce();
      expect(doneHandler).toHaveBeenCalledOnce();
      expect(doneHandler.mock.calls[0][0].success).toBe(true);
    });

    it('should track deployment in history', async () => {
      const config = makeValidConfig({ target: 'cloudflare' });
      await deployer.deploy(config, makeBuildOutput());

      const deployments = await deployer.getDeployments();
      expect(deployments.length).toBe(1);
      expect(deployments[0].status).toBe('ready');
      expect(deployments[0].environment).toBe('staging');
    });

    it('should handle KV namespace bindings', async () => {
      const deployerWithKV = new CloudflareDeployer({
        apiToken: 'cf-test-token',
        accountId: 'cf-account',
        kvNamespaces: [{ binding: 'MY_KV', namespaceId: 'kv-ns-id-1' }],
      });

      const config = makeValidConfig({ target: 'cloudflare' });
      const result = await deployerWithKV.deploy(config, makeBuildOutput());

      expect(result.success).toBe(true);
    });

    it('should validate config before deploying', async () => {
      const badConfig = makeValidConfig({ projectName: '' });

      await expect(deployer.deploy(badConfig, makeBuildOutput())).rejects.toThrow(
        'Project name is required'
      );
    });
  });

  describe('rollback()', () => {
    it('should successfully rollback a known deployment', async () => {
      const config = makeValidConfig({ target: 'cloudflare' });
      const deployResult = await deployer.deploy(config, makeBuildOutput());

      const rollbackResult = await deployer.rollback(deployResult.deploymentId);

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.deploymentId).toBe(deployResult.deploymentId);
    });

    it('should fail rollback for unknown deployment', async () => {
      const result = await deployer.rollback('nonexistent-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('getPreviewUrl()', () => {
    it('should return a preview URL with sanitized branch name', async () => {
      // Need to set project name first via a deploy
      const config = makeValidConfig({ target: 'cloudflare' });
      await deployer.deploy(config, makeBuildOutput());

      const url = await deployer.getPreviewUrl('feature/my-branch');
      expect(url).toContain('feature-my-branch');
      expect(url).toContain('pages.dev');
    });
  });

  describe('getDeployments()', () => {
    it('should return empty array initially', async () => {
      const deployments = await deployer.getDeployments();
      expect(deployments).toEqual([]);
    });

    it('should return deployments after deploying', async () => {
      const config = makeValidConfig({ target: 'cloudflare' });
      await deployer.deploy(config, makeBuildOutput());
      await deployer.deploy(
        makeValidConfig({ target: 'cloudflare', environment: 'production' }),
        makeBuildOutput()
      );

      const deployments = await deployer.getDeployments();
      expect(deployments.length).toBe(2);
      expect(deployments[0].environment).toBe('staging');
      expect(deployments[1].environment).toBe('production');
    });
  });
});

// ============================================================================
// Vercel Deployer Tests
// ============================================================================

describe('VercelDeployer', () => {
  let deployer: VercelDeployer;

  beforeEach(() => {
    installDeployerNetworkMocks();
    deployer = new VercelDeployer({
      apiToken: 'vercel-test-token-789',
      teamId: 'team-abc',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should be an instance of BaseDeployer', () => {
    expect(deployer).toBeInstanceOf(BaseDeployer);
  });

  describe('deploy()', () => {
    it('should return a successful deploy result', async () => {
      const config = makeValidConfig({ target: 'vercel' });
      const result = await deployer.deploy(config, makeBuildOutput());

      expect(result.success).toBe(true);
      expect(result.url).toContain('test-project');
      expect(result.deploymentId).toContain('vercel');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('should use custom domain in URL when provided', async () => {
      const config = makeValidConfig({
        target: 'vercel',
        customDomain: 'my-app.com',
      });

      const result = await deployer.deploy(config, makeBuildOutput());

      expect(result.url).toBe('https://my-app.com');
    });

    it('should emit deploy events', async () => {
      const startHandler = vi.fn();
      const doneHandler = vi.fn();

      deployer.on('deploy:start', startHandler);
      deployer.on('deploy:done', doneHandler);

      const config = makeValidConfig({ target: 'vercel' });
      await deployer.deploy(config, makeBuildOutput());

      expect(startHandler).toHaveBeenCalledOnce();
      expect(doneHandler).toHaveBeenCalledOnce();
    });

    it('should validate config before deploying', async () => {
      const badConfig = makeValidConfig({ regions: [] });

      await expect(deployer.deploy(badConfig, makeBuildOutput())).rejects.toThrow(
        'At least one region is required'
      );
    });
  });

  describe('environment variables', () => {
    it('should add environment variables', () => {
      deployer.addEnvVar({
        key: 'API_KEY',
        value: 'secret-value',
        target: ['production'],
        type: 'encrypted',
      });

      const vars = deployer.getEnvVars();
      expect(vars.length).toBe(1);
      expect(vars[0].key).toBe('API_KEY');
      expect(vars[0].value).toBe('secret-value');
    });

    it('should overwrite existing env var with same key', () => {
      deployer.addEnvVar({
        key: 'API_KEY',
        value: 'old-value',
        target: ['production'],
      });
      deployer.addEnvVar({
        key: 'API_KEY',
        value: 'new-value',
        target: ['production', 'preview'],
      });

      const vars = deployer.getEnvVars();
      expect(vars.length).toBe(1);
      expect(vars[0].value).toBe('new-value');
      expect(vars[0].target).toEqual(['production', 'preview']);
    });

    it('should remove environment variables', () => {
      deployer.addEnvVar({
        key: 'TO_REMOVE',
        value: 'value',
        target: ['production'],
      });

      const removed = deployer.removeEnvVar('TO_REMOVE');
      expect(removed).toBe(true);
      expect(deployer.getEnvVars().length).toBe(0);
    });

    it('should return false when removing non-existent var', () => {
      const removed = deployer.removeEnvVar('NONEXISTENT');
      expect(removed).toBe(false);
    });
  });

  describe('rollback()', () => {
    it('should successfully rollback a known deployment', async () => {
      const config = makeValidConfig({ target: 'vercel' });
      const deployResult = await deployer.deploy(config, makeBuildOutput());

      const result = await deployer.rollback(deployResult.deploymentId);

      expect(result.success).toBe(true);
    });

    it('should fail rollback for unknown deployment', async () => {
      const result = await deployer.rollback('nonexistent-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('getPreviewUrl()', () => {
    it('should return a preview URL with git branch format', async () => {
      const config = makeValidConfig({ target: 'vercel' });
      await deployer.deploy(config, makeBuildOutput());

      const url = await deployer.getPreviewUrl('feature/new-ui');
      expect(url).toContain('feature-new-ui');
      expect(url).toContain('vercel.app');
    });
  });

  describe('serverless config', () => {
    it('should set serverless configuration', () => {
      deployer.setServerlessConfig({
        runtime: 'edge',
        memory: 512,
        maxDuration: 10,
      });

      // Verify it doesn't throw
    });
  });
});

// ============================================================================
// Nginx Deployer Tests
// ============================================================================

describe('NginxDeployer', () => {
  let deployer: NginxDeployer;
  let mockSshExecutor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    deployer = new NginxDeployer({
      host: '192.168.1.100',
      username: 'deploy',
      keyPath: '/home/deploy/.ssh/id_rsa',
      remotePath: '/var/www/holoscript',
    });

    // Mock SSH executor to avoid real SSH calls
    mockSshExecutor = vi.fn().mockResolvedValue('');
    deployer.setSshExecutor(mockSshExecutor);

    // Mock SCP uploader to avoid real SCP calls
    deployer.setScpUploader(vi.fn().mockResolvedValue(undefined));
  });

  it('should be an instance of BaseDeployer', () => {
    expect(deployer).toBeInstanceOf(BaseDeployer);
  });

  describe('deploy()', () => {
    it('should execute SSH commands for deployment', async () => {
      const config = makeValidConfig({ target: 'custom' });
      const result = await deployer.deploy(config, makeBuildOutput());

      expect(result.success).toBe(true);
      expect(result.url).toContain('192.168.1.100');
      expect(result.deploymentId).toContain('nginx');
      expect(mockSshExecutor).toHaveBeenCalled();
    });

    it('should create release directory via SSH', async () => {
      const config = makeValidConfig({ target: 'custom' });
      await deployer.deploy(config, makeBuildOutput());

      const mkdirCall = mockSshExecutor.mock.calls.find((call: string[]) =>
        call[0].includes('mkdir')
      );
      expect(mkdirCall).toBeTruthy();
      expect(mkdirCall![0]).toContain('/var/www/holoscript/releases/');
    });

    it('should symlink swap for zero-downtime', async () => {
      const config = makeValidConfig({ target: 'custom' });
      await deployer.deploy(config, makeBuildOutput());

      const symlinkCall = mockSshExecutor.mock.calls.find((call: string[]) =>
        call[0].includes('ln -sfn')
      );
      expect(symlinkCall).toBeTruthy();
      expect(symlinkCall![0]).toContain('/var/www/holoscript/current');
    });

    it('should reload Nginx after deployment', async () => {
      const config = makeValidConfig({ target: 'custom' });
      await deployer.deploy(config, makeBuildOutput());

      const reloadCall = mockSshExecutor.mock.calls.find(
        (call: string[]) => call[0].includes('nginx -t') && call[0].includes('reload')
      );
      expect(reloadCall).toBeTruthy();
    });

    it('should use custom domain in URL when provided', async () => {
      const config = makeValidConfig({
        target: 'custom',
        customDomain: 'holoscript.example.com',
      });

      const result = await deployer.deploy(config, makeBuildOutput());

      expect(result.url).toBe('https://holoscript.example.com');
    });

    it('should handle deployment failure gracefully', async () => {
      mockSshExecutor.mockRejectedValueOnce(new Error('Connection refused'));

      const config = makeValidConfig({ target: 'custom' });
      const result = await deployer.deploy(config, makeBuildOutput());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
    });

    it('should emit deploy events', async () => {
      const startHandler = vi.fn();
      const doneHandler = vi.fn();

      deployer.on('deploy:start', startHandler);
      deployer.on('deploy:done', doneHandler);

      const config = makeValidConfig({ target: 'custom' });
      await deployer.deploy(config, makeBuildOutput());

      expect(startHandler).toHaveBeenCalledOnce();
      expect(doneHandler).toHaveBeenCalledOnce();
    });
  });

  describe('rollback()', () => {
    it('should rollback by switching symlink', async () => {
      // Deploy first
      const config = makeValidConfig({ target: 'custom' });
      const deployResult = await deployer.deploy(config, makeBuildOutput());

      // Mock listing releases for rollback
      mockSshExecutor.mockResolvedValueOnce('1700000002\n1700000001\n');
      mockSshExecutor.mockResolvedValueOnce(''); // symlink
      mockSshExecutor.mockResolvedValueOnce(''); // nginx reload

      const result = await deployer.rollback(deployResult.deploymentId);

      expect(result.success).toBe(true);
    });

    it('should fail rollback for unknown deployment', async () => {
      const result = await deployer.rollback('nonexistent-id');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('generateNginxConfig()', () => {
    it('should generate valid Nginx config', () => {
      const config = makeValidConfig({ target: 'custom', projectName: 'my-app' });
      const nginxConfig = deployer.generateNginxConfig(config, '/var/www/holoscript/current');

      expect(nginxConfig).toContain('server {');
      expect(nginxConfig).toContain('listen 80');
      expect(nginxConfig).toContain('root /var/www/holoscript/current');
      expect(nginxConfig).toContain('index index.html');
      expect(nginxConfig).toContain('gzip on');
      expect(nginxConfig).toContain('try_files');
    });

    it('should include custom domain as server_name', () => {
      const config = makeValidConfig({
        target: 'custom',
        customDomain: 'holoscript.example.com',
      });

      const nginxConfig = deployer.generateNginxConfig(config, '/var/www/current');

      expect(nginxConfig).toContain('server_name holoscript.example.com');
    });

    it('should include edge config headers', () => {
      const config = makeValidConfig({
        target: 'custom',
        edgeConfig: {
          cacheControl: 'public, max-age=31536000',
          headers: {
            'X-Custom-Header': 'holoscript',
          },
        },
      });

      const nginxConfig = deployer.generateNginxConfig(config, '/var/www/current');

      expect(nginxConfig).toContain('Cache-Control');
      expect(nginxConfig).toContain('public, max-age=31536000');
      expect(nginxConfig).toContain('X-Custom-Header');
      expect(nginxConfig).toContain('holoscript');
    });

    it('should include SSL config when enabled', () => {
      deployer.setSiteConfig({
        ssl: true,
        sslCertPath: '/etc/ssl/cert.pem',
        sslKeyPath: '/etc/ssl/key.pem',
      });

      const config = makeValidConfig({ target: 'custom' });
      const nginxConfig = deployer.generateNginxConfig(config, '/var/www/current');

      expect(nginxConfig).toContain('listen 443 ssl');
      expect(nginxConfig).toContain('ssl_certificate /etc/ssl/cert.pem');
      expect(nginxConfig).toContain('ssl_certificate_key /etc/ssl/key.pem');
    });

    it('should include WASM MIME type support', () => {
      const config = makeValidConfig({ target: 'custom' });
      const nginxConfig = deployer.generateNginxConfig(config, '/var/www/current');

      expect(nginxConfig).toContain('application/wasm');
      expect(nginxConfig).toContain('Cross-Origin-Embedder-Policy');
    });

    it('should include proxy pass when configured', () => {
      deployer.setSiteConfig({
        proxyPass: 'http://127.0.0.1:3000',
      });

      const config = makeValidConfig({ target: 'custom' });
      const nginxConfig = deployer.generateNginxConfig(config, '/var/www/current');

      expect(nginxConfig).toContain('proxy_pass http://127.0.0.1:3000');
      expect(nginxConfig).toContain('proxy_set_header Host');
    });

    it('should include security headers', () => {
      const config = makeValidConfig({ target: 'custom' });
      const nginxConfig = deployer.generateNginxConfig(config, '/var/www/current');

      expect(nginxConfig).toContain('X-Frame-Options');
      expect(nginxConfig).toContain('X-Content-Type-Options');
      expect(nginxConfig).toContain('X-XSS-Protection');
    });
  });

  describe('getPreviewUrl()', () => {
    it('should return a preview URL with sanitized branch name', async () => {
      const url = await deployer.getPreviewUrl('feature/new-trait');
      expect(url).toContain('feature-new-trait');
      expect(url).toContain('preview');
      expect(url).toContain('192.168.1.100');
    });
  });

  describe('site config', () => {
    it('should set and get site config', () => {
      deployer.setSiteConfig({
        serverName: 'holoscript.io',
        listenPort: 8080,
        gzip: false,
      });

      const config = deployer.getSiteConfig();
      expect(config.serverName).toBe('holoscript.io');
      expect(config.listenPort).toBe(8080);
      expect(config.gzip).toBe(false);
    });
  });
});

// ============================================================================
// Build Step Tests
// ============================================================================

describe('BaseDeployer - Build Step', () => {
  let deployer: CloudflareDeployer;

  beforeEach(() => {
    deployer = new CloudflareDeployer({
      apiToken: 'test-token',
      accountId: 'test-account',
    });
  });

  it('should emit build:start event', async () => {
    const handler = vi.fn();
    deployer.on('build:start', handler);

    const config = makeValidConfig();

    try {
      await deployer.buildProject(config);
    } catch {
      // Expected to fail since holoscript CLI isn't installed in test
    }

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(config);
  });

  it('should throw on build failure', async () => {
    const config = makeValidConfig();

    await expect(deployer.buildProject(config)).rejects.toThrow('Build failed');
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createDeployer', () => {
  it('should create a CloudflareDeployer for "cloudflare" target', () => {
    const deployer = createDeployer('cloudflare', {
      apiToken: 'cf-token',
      accountId: 'cf-account',
    });

    expect(deployer).toBeInstanceOf(CloudflareDeployer);
  });

  it('should create a VercelDeployer for "vercel" target', () => {
    const deployer = createDeployer('vercel', {
      apiToken: 'vercel-token',
      teamId: 'team-id',
    });

    expect(deployer).toBeInstanceOf(VercelDeployer);
  });

  it('should create a NginxDeployer for "nginx" target', () => {
    const deployer = createDeployer('nginx', {
      host: '192.168.1.1',
      username: 'admin',
    });

    expect(deployer).toBeInstanceOf(NginxDeployer);
  });

  it('should create a NginxDeployer for "custom" target', () => {
    const deployer = createDeployer('custom', {
      host: '10.0.0.1',
      username: 'deploy',
    });

    expect(deployer).toBeInstanceOf(NginxDeployer);
  });

  it('should throw for unknown target', () => {
    expect(() => createDeployer('aws')).toThrow('Unknown deployment target: "aws"');
  });

  it('should list supported targets in error message', () => {
    expect(() => createDeployer('gcp')).toThrow(
      'Supported targets: cloudflare, vercel, nginx, custom'
    );
  });

  it('should work with no config (defaults)', () => {
    const deployer = createDeployer('cloudflare');
    expect(deployer).toBeInstanceOf(CloudflareDeployer);
  });

  it('should create deployers that are instances of BaseDeployer', () => {
    for (const target of ['cloudflare', 'vercel', 'nginx', 'custom']) {
      const deployer = createDeployer(target);
      expect(deployer).toBeInstanceOf(BaseDeployer);
    }
  });
});

// ============================================================================
// Multiple Deploys & Regions
// ============================================================================

describe('Multi-region deployment', () => {
  beforeEach(() => {
    installDeployerNetworkMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should deploy to multiple regions', async () => {
    const deployer = new CloudflareDeployer({
      apiToken: 'token',
      accountId: 'account',
    });

    const config = makeValidConfig({
      regions: ['us-east-1', 'eu-west-1', 'ap-southeast-1'],
    });

    const result = await deployer.deploy(config, makeBuildOutput());

    expect(result.success).toBe(true);
    expect(result.regions).toEqual(['us-east-1', 'eu-west-1', 'ap-southeast-1']);
  });
});

// ============================================================================
// Edge Config Tests
// ============================================================================

describe('Edge configuration', () => {
  beforeEach(() => {
    installDeployerNetworkMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('should include edge config in Cloudflare deploy', async () => {
    const deployer = new CloudflareDeployer({
      apiToken: 'token',
      accountId: 'account',
    });

    const config = makeValidConfig({
      edgeConfig: {
        cacheControl: 'public, max-age=3600',
        headers: {
          'X-Powered-By': 'HoloScript',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    });

    const result = await deployer.deploy(config, makeBuildOutput());
    expect(result.success).toBe(true);
  });

  it('should include edge config in Vercel deploy', async () => {
    const deployer = new VercelDeployer({
      apiToken: 'token',
    });

    const config = makeValidConfig({
      target: 'vercel',
      edgeConfig: {
        cacheControl: 's-maxage=86400',
        headers: { 'X-Frame-Options': 'DENY' },
      },
    });

    const result = await deployer.deploy(config, makeBuildOutput());
    expect(result.success).toBe(true);
  });
});
