import fs from 'node:fs';
import path from 'node:path';

// ─── Templates ────────────────────────────────────────────
export interface TemplateInfo {
  name: string;
  description: string;
  dir: string;
}

export const TEMPLATES: TemplateInfo[] = [
  {
    name: 'hello-world',
    description: 'Interactive scene with physics — ground, cube, glowing orb',
    dir: 'hello-world',
  },
  {
    name: 'physics-playground',
    description: 'Throwable objects, collisions, and particle effects',
    dir: 'physics-playground',
  },
  {
    name: 'interactive-gallery',
    description: 'Clickable art panels with portals and ambient audio',
    dir: 'interactive-gallery',
  },
  {
    name: '2d-revolution',
    description: 'V6 Semantic2D hybrid UI using React Three Fiber',
    dir: '2d-revolution',
  },
];

// ─── Package Manager Detection ────────────────────────────
export function detectPackageManager(): 'pnpm' | 'yarn' | 'npm' {
  const ua = process.env.npm_config_user_agent ?? '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  return 'npm';
}

export function installCommand(pm: string): string {
  return pm === 'yarn' ? 'yarn' : `${pm} install`;
}

export function devCommand(pm: string): string {
  return pm === 'yarn' ? 'yarn dev' : `${pm} run dev`;
}

// ─── Validation ──────────────────────────────────────────
export function validateProjectName(name: string): true | string {
  if (!name || name.trim().length === 0) {
    return 'Project name cannot be empty';
  }
  if (!/^[a-z0-9_-]+$/i.test(name)) {
    return 'Only alphanumeric, hyphens, and underscores';
  }
  return true;
}

export function normalizePackageName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-');
}

// ─── File Operations ──────────────────────────────────────
export function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export interface PackageJsonOptions {
  projectName: string;
  templateName: string;
}

export function buildPackageJson(opts: PackageJsonOptions): Record<string, unknown> {
  const pkg: Record<string, unknown> = {
    name: opts.projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      three: '^0.170.0',
    } as Record<string, string>,
    devDependencies: {
      vite: '^6.0.0',
    } as Record<string, string>,
  };

  if (opts.templateName === '2d-revolution') {
    (pkg.dependencies as Record<string, string>)['react'] = '^18.2.0';
    (pkg.dependencies as Record<string, string>)['react-dom'] = '^18.2.0';
    (pkg.dependencies as Record<string, string>)['@react-three/fiber'] = '^8.17.10';
    (pkg.dependencies as Record<string, string>)['@react-three/drei'] = '^9.114.0';
    (pkg.dependencies as Record<string, string>)['@holoscript/semantic-2d'] = 'workspace:*';
    (pkg.devDependencies as Record<string, string>)['@vitejs/plugin-react'] = '^4.3.4';
  }

  return pkg;
}

export function writeProjectPackageJson(
  projectDir: string,
  projectName: string,
  templateName: string
): void {
  const pkg = buildPackageJson({ projectName, templateName });
  fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
}

export function buildHoloscriptConfig(): Record<string, string> {
  return {
    $schema: 'https://holoscript.dev/schema/config.json',
    target: 'webxr',
    entry: 'src/scene.holo',
    output: 'dist/',
  };
}

export function writeHoloscriptConfig(projectDir: string): void {
  const config = buildHoloscriptConfig();
  fs.writeFileSync(
    path.join(projectDir, 'holoscript.config.json'),
    JSON.stringify(config, null, 2) + '\n'
  );
}

// ─── CLI Argument Parsing ─────────────────────────────────
export interface ParsedArgs {
  projectName: string | undefined;
  skipPrompts: boolean;
  templateFlag: string | undefined;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const flags = args.filter((a) => a.startsWith('-'));
  const positional = args.filter((a) => !a.startsWith('-'));
  const skipPrompts = flags.includes('--yes') || flags.includes('-y');

  const templateIdx = args.indexOf('--template');
  const templateFlag = templateIdx !== -1 ? args[templateIdx + 1] : undefined;

  return {
    projectName: positional[0],
    skipPrompts,
    templateFlag,
  };
}

export function resolveTemplate(templateFlag: string | undefined): TemplateInfo {
  return TEMPLATES.find((t) => t.name === templateFlag) ?? TEMPLATES[0];
}

export function checkProjectDir(projectDir: string): { ok: boolean; reason?: string } {
  if (fs.existsSync(projectDir)) {
    const files = fs.readdirSync(projectDir);
    if (files.length > 0) {
      return { ok: false, reason: 'Directory already exists and is not empty' };
    }
  }
  return { ok: true };
}
