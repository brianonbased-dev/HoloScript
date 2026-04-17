import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('node:fs');
vi.mock('node:child_process');

// Import the module under test after mocks are set up
import {
  TEMPLATES,
  detectPackageManager,
  installCommand,
  devCommand,
  validateProjectName,
  normalizePackageName,
  copyDir,
  buildPackageJson,
  writeProjectPackageJson,
  buildHoloscriptConfig,
  writeHoloscriptConfig,
  parseArgs,
  resolveTemplate,
  checkProjectDir,
} from './scaffold.js';

/**
 * Tests for create-holoscript-app scaffolding tool.
 * All filesystem operations are mocked via vi.mock('node:fs').
 */
describe('create-holoscript-app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Template Registry ──────────────────────────────────
  describe('TEMPLATES registry', () => {
    it('should contain exactly 5 templates', () => {
      expect(TEMPLATES).toHaveLength(5);
    });

    it('should include hello-world as the first template', () => {
      expect(TEMPLATES[0].name).toBe('hello-world');
      expect(TEMPLATES[0].dir).toBe('hello-world');
    });

    it('should include all expected template names', () => {
      const names = TEMPLATES.map((t) => t.name);
      expect(names).toEqual([
        'hello-world',
        'instant',
        'physics-playground',
        'interactive-gallery',
        '2d-revolution',
      ]);
    });

    it('should have non-empty descriptions for every template', () => {
      for (const t of TEMPLATES) {
        expect(t.description.length).toBeGreaterThan(0);
      }
    });
  });

  // ─── Template Resolution ────────────────────────────────
  describe('resolveTemplate', () => {
    it('should resolve a known template by name', () => {
      const result = resolveTemplate('physics-playground');
      expect(result.name).toBe('physics-playground');
      expect(result.dir).toBe('physics-playground');
    });

    it('should fall back to hello-world for unknown template', () => {
      const result = resolveTemplate('nonexistent-template');
      expect(result.name).toBe('hello-world');
    });

    it('should fall back to hello-world when flag is undefined', () => {
      const result = resolveTemplate(undefined);
      expect(result.name).toBe('hello-world');
    });
  });

  // ─── Package Manager Detection ──────────────────────────
  describe('detectPackageManager', () => {
    const originalUA = process.env.npm_config_user_agent;

    afterEach(() => {
      if (originalUA !== undefined) {
        process.env.npm_config_user_agent = originalUA;
      } else {
        delete process.env.npm_config_user_agent;
      }
    });

    it('should detect pnpm from user agent', () => {
      process.env.npm_config_user_agent = 'pnpm/9.0.0 npm/? node/v20.10.0';
      expect(detectPackageManager()).toBe('pnpm');
    });

    it('should detect yarn from user agent', () => {
      process.env.npm_config_user_agent = 'yarn/4.0.0 npm/? node/v20.10.0';
      expect(detectPackageManager()).toBe('yarn');
    });

    it('should default to npm when user agent is empty', () => {
      process.env.npm_config_user_agent = '';
      expect(detectPackageManager()).toBe('npm');
    });

    it('should default to npm when user agent is unset', () => {
      delete process.env.npm_config_user_agent;
      expect(detectPackageManager()).toBe('npm');
    });
  });

  // ─── Install / Dev Commands ─────────────────────────────
  describe('installCommand', () => {
    it('should return "pnpm install" for pnpm', () => {
      expect(installCommand('pnpm')).toBe('pnpm install');
    });

    it('should return "npm install" for npm', () => {
      expect(installCommand('npm')).toBe('npm install');
    });

    it('should return bare "yarn" for yarn', () => {
      expect(installCommand('yarn')).toBe('yarn');
    });
  });

  describe('devCommand', () => {
    it('should return "pnpm run dev" for pnpm', () => {
      expect(devCommand('pnpm')).toBe('pnpm run dev');
    });

    it('should return "npm run dev" for npm', () => {
      expect(devCommand('npm')).toBe('npm run dev');
    });

    it('should return "yarn dev" for yarn', () => {
      expect(devCommand('yarn')).toBe('yarn dev');
    });
  });

  // ─── Project Name Validation ────────────────────────────
  describe('validateProjectName', () => {
    it('should accept valid alphanumeric names', () => {
      expect(validateProjectName('my-app')).toBe(true);
      expect(validateProjectName('my_app')).toBe(true);
      expect(validateProjectName('MyApp123')).toBe(true);
    });

    it('should reject names with spaces', () => {
      expect(validateProjectName('my app')).toBe('Only alphanumeric, hyphens, and underscores');
    });

    it('should reject names with special characters', () => {
      expect(validateProjectName('my@app')).toBe('Only alphanumeric, hyphens, and underscores');
      expect(validateProjectName('my.app')).toBe('Only alphanumeric, hyphens, and underscores');
    });

    it('should reject empty string', () => {
      expect(validateProjectName('')).toBe('Project name cannot be empty');
    });

    it('should reject whitespace-only string', () => {
      expect(validateProjectName('   ')).toBe('Project name cannot be empty');
    });
  });

  // ─── Package Name Normalization ─────────────────────────
  describe('normalizePackageName', () => {
    it('should lowercase and replace invalid chars with hyphens', () => {
      expect(normalizePackageName('My Project')).toBe('my-project');
      expect(normalizePackageName('my@project.v1')).toBe('my-project-v1');
    });

    it('should preserve valid characters', () => {
      expect(normalizePackageName('my-app_v1')).toBe('my-app_v1');
    });
  });

  // ─── CLI Argument Parsing ──────────────────────────────
  describe('parseArgs', () => {
    it('should extract project name from first positional arg', () => {
      const result = parseArgs(['node', 'script.js', 'my-project']);
      expect(result.projectName).toBe('my-project');
      expect(result.skipPrompts).toBe(false);
      expect(result.templateFlag).toBeUndefined();
    });

    it('should detect --yes flag', () => {
      const result = parseArgs(['node', 'script.js', 'app', '--yes']);
      expect(result.skipPrompts).toBe(true);
    });

    it('should detect -y flag', () => {
      const result = parseArgs(['node', 'script.js', 'app', '-y']);
      expect(result.skipPrompts).toBe(true);
    });

    it('should extract --template value', () => {
      const result = parseArgs(['node', 'script.js', 'app', '--template', 'physics-playground']);
      expect(result.templateFlag).toBe('physics-playground');
    });

    it('should return undefined projectName when no positional args', () => {
      const result = parseArgs(['node', 'script.js', '--yes']);
      expect(result.projectName).toBeUndefined();
    });

    it('should handle combined flags and positional args', () => {
      const result = parseArgs([
        'node',
        'script.js',
        'my-app',
        '--yes',
        '--template',
        '2d-revolution',
      ]);
      expect(result.projectName).toBe('my-app');
      expect(result.skipPrompts).toBe(true);
      expect(result.templateFlag).toBe('2d-revolution');
    });

    it('should detect --go flag and imply skipPrompts + instant template', () => {
      const result = parseArgs(['node', 'script.js', 'app', '--go']);
      expect(result.goMode).toBe(true);
      expect(result.skipPrompts).toBe(true);
      expect(result.templateFlag).toBe('instant');
    });

    it('should detect -g short flag equivalent to --go', () => {
      const result = parseArgs(['node', 'script.js', 'app', '-g']);
      expect(result.goMode).toBe(true);
      expect(result.skipPrompts).toBe(true);
      expect(result.templateFlag).toBe('instant');
    });

    it('should respect explicit --template override in --go mode', () => {
      const result = parseArgs([
        'node',
        'script.js',
        'app',
        '--go',
        '--template',
        'hello-world',
      ]);
      expect(result.goMode).toBe(true);
      expect(result.templateFlag).toBe('hello-world');
    });

    it('should parse --port argument', () => {
      const result = parseArgs(['node', 'script.js', 'app', '--go', '--port', '4242']);
      expect(result.port).toBe(4242);
    });

    it('should leave port undefined when not passed', () => {
      const result = parseArgs(['node', 'script.js', 'app']);
      expect(result.port).toBeUndefined();
      expect(result.goMode).toBe(false);
    });
  });

  // ─── buildPackageJson ───────────────────────────────────
  describe('buildPackageJson', () => {
    it('should produce base package.json for non-react template', () => {
      const pkg = buildPackageJson({ projectName: 'test-app', templateName: 'hello-world' });
      expect(pkg.name).toBe('test-app');
      expect(pkg.version).toBe('0.1.0');
      expect(pkg.type).toBe('module');
      expect((pkg.dependencies as Record<string, string>).three).toBe('^0.170.0');
      expect((pkg.dependencies as Record<string, string>)['react']).toBeUndefined();
    });

    it('should produce zero-dependency package.json for instant template', () => {
      const pkg = buildPackageJson({ projectName: 'quick-app', templateName: 'instant' });
      expect(pkg.name).toBe('quick-app');
      expect(pkg.version).toBe('0.1.0');
      expect(pkg.dependencies).toBeUndefined();
      expect(pkg.devDependencies).toBeUndefined();
      expect((pkg.scripts as Record<string, string>).dev).toBe('npx serve .');
    });

    it('should include React deps for 2d-revolution template', () => {
      const pkg = buildPackageJson({ projectName: 'rev-app', templateName: '2d-revolution' });
      const deps = pkg.dependencies as Record<string, string>;
      const devDeps = pkg.devDependencies as Record<string, string>;
      expect(deps['react']).toBe('^18.2.0');
      expect(deps['react-dom']).toBe('^18.2.0');
      expect(deps['@react-three/fiber']).toBe('^8.17.10');
      expect(deps['@react-three/drei']).toBe('^9.114.0');
      expect(deps['@holoscript/semantic-2d']).toBe('^6.0.1');
      expect(devDeps['@vitejs/plugin-react']).toBe('^4.3.4');
    });

    it('should set private: true and standard scripts', () => {
      const pkg = buildPackageJson({ projectName: 'x', templateName: 'hello-world' });
      expect(pkg.private).toBe(true);
      const scripts = pkg.scripts as Record<string, string>;
      expect(scripts.dev).toBe('vite');
      expect(scripts.build).toBe('vite build');
      expect(scripts.preview).toBe('vite preview');
    });
  });

  // ─── buildHoloscriptConfig ──────────────────────────────
  describe('buildHoloscriptConfig', () => {
    it('should return correct default config', () => {
      const config = buildHoloscriptConfig();
      expect(config.$schema).toBe('https://holoscript.dev/schema/config.json');
      expect(config.target).toBe('webxr');
      expect(config.entry).toBe('src/scene.holo');
      expect(config.output).toBe('dist/');
    });
  });

  // ─── File Operations (mocked fs) ───────────────────────
  describe('copyDir', () => {
    it('should create dest dir and copy files recursively', () => {
      const mockDirEntry = (name: string, isDir: boolean) => ({
        name,
        isDirectory: () => isDir,
        isFile: () => !isDir,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        isSymbolicLink: () => false,
        parentPath: '/src',
        path: '/src',
      });

      vi.mocked(fs.readdirSync).mockImplementation((p: fs.PathLike) => {
        const pStr = p.toString();
        if (pStr === '/src') {
          return [
            mockDirEntry('file.txt', false),
            mockDirEntry('sub', true),
          ] as unknown as ReturnType<typeof fs.readdirSync>;
        }
        if (pStr === path.join('/src', 'sub')) {
          return [mockDirEntry('nested.txt', false)] as unknown as ReturnType<
            typeof fs.readdirSync
          >;
        }
        return [] as unknown as ReturnType<typeof fs.readdirSync>;
      });

      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
      vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

      copyDir('/src', '/dest');

      expect(fs.mkdirSync).toHaveBeenCalledWith('/dest', { recursive: true });
      expect(fs.mkdirSync).toHaveBeenCalledWith(path.join('/dest', 'sub'), { recursive: true });
      expect(fs.copyFileSync).toHaveBeenCalledWith(
        path.join('/src', 'file.txt'),
        path.join('/dest', 'file.txt')
      );
      expect(fs.copyFileSync).toHaveBeenCalledWith(
        path.join('/src', 'sub', 'nested.txt'),
        path.join('/dest', 'sub', 'nested.txt')
      );
    });
  });

  describe('writeProjectPackageJson', () => {
    it('should write JSON to the correct path', () => {
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      writeProjectPackageJson('/project', 'my-app', 'hello-world');
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      const [filePath, content] = vi.mocked(fs.writeFileSync).mock.calls[0] as [string, string];
      expect(filePath).toBe(path.join('/project', 'package.json'));
      const parsed = JSON.parse(content);
      expect(parsed.name).toBe('my-app');
    });
  });

  describe('writeHoloscriptConfig', () => {
    it('should write holoscript.config.json to project dir', () => {
      vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
      writeHoloscriptConfig('/project');
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      const [filePath, content] = vi.mocked(fs.writeFileSync).mock.calls[0] as [string, string];
      expect(filePath).toBe(path.join('/project', 'holoscript.config.json'));
      const parsed = JSON.parse(content);
      expect(parsed.target).toBe('webxr');
    });
  });

  // ─── checkProjectDir ───────────────────────────────────
  describe('checkProjectDir', () => {
    it('should return ok when directory does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = checkProjectDir('/new-project');
      expect(result.ok).toBe(true);
    });

    it('should return ok when directory exists but is empty', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([] as unknown as ReturnType<typeof fs.readdirSync>);
      const result = checkProjectDir('/empty-dir');
      expect(result.ok).toBe(true);
    });

    it('should reject non-empty existing directory', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['file.txt'] as unknown as ReturnType<
        typeof fs.readdirSync
      >);
      const result = checkProjectDir('/full-dir');
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('not empty');
    });
  });
});
