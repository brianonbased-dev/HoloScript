/**
 * `holoscript create-plugin` — Plugin project scaffolder
 *
 * Generates a new plugin project with:
 * - plugin.json manifest
 * - src/index.ts with example tool registration
 * - tsconfig.json
 * - package.json
 * - Permission manifest
 *
 * Part of HoloScript v5.7 "Open Ecosystem".
 *
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

export interface CreatePluginOptions {
  /** Plugin name (kebab-case) */
  name: string;
  /** Plugin description */
  description?: string;
  /** Author name */
  author?: string;
  /** Output directory (defaults to ./<name>) */
  outDir?: string;
  /** Permissions to include */
  permissions?: string[];
  /** Whether to include example tool */
  withExample?: boolean;
}

export interface CreatePluginResult {
  /** Whether creation succeeded */
  success: boolean;
  /** Directory where plugin was created */
  directory: string;
  /** List of files created */
  files: string[];
  /** Error message if failed */
  error?: string;
}

// =============================================================================
// TEMPLATE GENERATORS
// =============================================================================

function generatePackageJson(options: CreatePluginOptions): string {
  const pkg = {
    name: `@holoscript-plugin/${options.name}`,
    version: '0.1.0',
    description: options.description || `HoloScript plugin: ${options.name}`,
    main: 'dist/index.js',
    types: 'dist/index.d.ts',
    scripts: {
      build: 'tsc',
      dev: 'tsc --watch',
      test: 'vitest',
    },
    author: options.author || '',
    license: 'MIT',
    peerDependencies: {
      '@holoscript/core': '>=5.7.0',
    },
    devDependencies: {
      '@holoscript/core': '*',
      typescript: '^5.0.0',
      vitest: '^1.0.0',
    },
    keywords: ['holoscript', 'plugin', options.name],
  };
  return JSON.stringify(pkg, null, 2);
}

function generatePluginManifest(options: CreatePluginOptions): string {
  const manifest = {
    id: options.name,
    name: kebabToTitle(options.name),
    version: '0.1.0',
    description: options.description || `HoloScript plugin: ${options.name}`,
    author: options.author || 'HoloScript Plugin Author',
    main: 'dist/index.js',
    holoscriptVersion: '>=5.7.0',
    permissions: options.permissions || ['tool:register', 'event:emit'],
    activationEvents: ['onStartup'],
    contributes: {
      commands: [
        {
          command: `${options.name}.hello`,
          title: `${kebabToTitle(options.name)}: Hello`,
          category: 'Plugins',
        },
      ],
    },
  };
  return JSON.stringify(manifest, null, 2);
}

function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      lib: ['ES2020'],
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist', '**/*.test.ts'],
  };
  return JSON.stringify(config, null, 2);
}

function generateIndexTs(options: CreatePluginOptions): string {
  const pluginName = kebabToTitle(options.name);
  const example = options.withExample !== false;

  let code = `/**
 * ${pluginName} — HoloScript Plugin
 *
 * ${options.description || `A HoloScript plugin.`}
 */

/**
 * Plugin activation function.
 * Called when the plugin is loaded into the sandbox.
 */
export function activate(api: PluginAPI): void {
`;

  if (example) {
    code += `  // Register a tool that agents can call
  api.registerTool(
    'hello',
    'Say hello from the ${pluginName} plugin',
    (name?: string) => {
      return { message: \`Hello from ${pluginName}\${name ? \`, \${name}!\` : '!'}\` };
    }
  );

  // Register an event handler
  api.registerHandler('scene:update', (data: unknown) => {
    // Handle scene updates
    api.emitEvent('${options.name}:processed', { source: 'scene:update', data });
  });

  api.emitEvent('${options.name}:activated', { version: '0.1.0' });
`;
  }

  code += `}

/**
 * Plugin deactivation function.
 * Called when the plugin is unloaded.
 */
export function deactivate(): void {
  // Cleanup resources
}

// Plugin API types (provided by the sandbox runtime)
interface PluginAPI {
  registerTool(name: string, description: string, handler: (...args: unknown[]) => unknown): void;
  registerHandler(event: string, handler: (...args: unknown[]) => void): void;
  emitEvent(event: string, payload?: unknown): void;
}
`;

  return code;
}

function generateTestTs(options: CreatePluginOptions): string {
  const pluginName = kebabToTitle(options.name);
  return `/**
 * ${pluginName} plugin tests
 */

import { describe, it, expect } from 'vitest';

describe('${pluginName}', () => {
  it('exports activate function', async () => {
    const mod = await import('../src/index');
    expect(typeof mod.activate).toBe('function');
  });

  it('exports deactivate function', async () => {
    const mod = await import('../src/index');
    expect(typeof mod.deactivate).toBe('function');
  });
});
`;
}

function generateReadme(options: CreatePluginOptions): string {
  const pluginName = kebabToTitle(options.name);
  return `# ${pluginName}

${options.description || `A HoloScript plugin.`}

## Installation

\`\`\`bash
holoscript plugin install @holoscript-plugin/${options.name}
\`\`\`

## Permissions

${(options.permissions || ['tool:register', 'event:emit']).map((p) => `- \`${p}\``).join('\n')}

## Development

\`\`\`bash
npm install
npm run build
npm test
\`\`\`
`;
}

// =============================================================================
// HELPERS
// =============================================================================

function kebabToTitle(kebab: string): string {
  return kebab
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// =============================================================================
// MAIN
// =============================================================================

/**
 * Create a new plugin project.
 */
export function createPlugin(options: CreatePluginOptions): CreatePluginResult {
  const dir = options.outDir || path.resolve(process.cwd(), options.name);
  const files: string[] = [];

  try {
    // Validate name
    if (!/^[a-z0-9][a-z0-9-]*$/.test(options.name)) {
      return {
        success: false,
        directory: dir,
        files: [],
        error: 'Plugin name must be lowercase kebab-case (e.g. "my-plugin")',
      };
    }

    // Create directories
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'test'), { recursive: true });

    // Write files
    const fileMap: Record<string, string> = {
      'package.json': generatePackageJson(options),
      'plugin.json': generatePluginManifest(options),
      'tsconfig.json': generateTsConfig(),
      'README.md': generateReadme(options),
      'src/index.ts': generateIndexTs(options),
      'test/plugin.test.ts': generateTestTs(options),
    };

    for (const [relPath, content] of Object.entries(fileMap)) {
      const fullPath = path.join(dir, relPath);
      fs.writeFileSync(fullPath, content, 'utf-8');
      files.push(relPath);
    }

    return { success: true, directory: dir, files };
  } catch (err) {
    return {
      success: false,
      directory: dir,
      files,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
