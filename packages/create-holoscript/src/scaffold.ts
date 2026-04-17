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
    name: 'instant',
    description: 'Zero-install CDN template — open in browser, no npm needed',
    dir: 'instant',
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
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
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
  // Instant template has no npm dependencies — Three.js loads from CDN
  if (opts.templateName === 'instant') {
    return {
      name: opts.projectName,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'npx serve .',
      },
    };
  }

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
    (pkg.dependencies as Record<string, string>)['@holoscript/semantic-2d'] = '^6.0.1';
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
  /** --go: 30-second mode — scaffold `instant`, serve, and open browser in one command. */
  goMode: boolean;
  /** Optional dev-server port override; defaults to 3030 in --go mode. */
  port: number | undefined;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const flags = args.filter((a) => a.startsWith('-'));
  const positional = args.filter((a) => !a.startsWith('-'));
  const skipPrompts = flags.includes('--yes') || flags.includes('-y');
  // --go implies --yes and defaults template to `instant`.
  const goMode = flags.includes('--go') || flags.includes('-g');

  const templateIdx = args.indexOf('--template');
  const explicitTemplate = templateIdx !== -1 ? args[templateIdx + 1] : undefined;
  const templateFlag = goMode && !explicitTemplate ? 'instant' : explicitTemplate;

  const portIdx = args.indexOf('--port');
  const portArg = portIdx !== -1 ? args[portIdx + 1] : undefined;
  const port = portArg ? Number(portArg) : undefined;

  return {
    projectName: positional[0],
    skipPrompts: skipPrompts || goMode,
    templateFlag,
    goMode,
    port,
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

// ─── --go mode: serve + open browser ──────────────────────
// Stdlib-only mini static server so `npx create-holoscript --go` has
// zero network dependencies after the package itself is fetched.
// Supports index.html + common asset types with correct MIME + no-cache headers.

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.holo': 'text/plain; charset=utf-8',
  '.hs': 'text/plain; charset=utf-8',
  '.hsplus': 'text/plain; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
};

export interface ServeResult {
  port: number;
  close: () => void;
}

/**
 * Starts a stdlib HTTP server rooted at `dir`. Returns the bound port + closer.
 * Tries the requested port first, then steps up on EADDRINUSE.
 */
export async function serveDir(dir: string, preferredPort = 3030): Promise<ServeResult> {
  const http = await import('node:http');

  const handler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
    const urlPath = (req.url ?? '/').split('?')[0];
    let filePath = path.join(dir, decodeURIComponent(urlPath));
    // Directory → index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    // Prevent path traversal
    if (!filePath.startsWith(path.resolve(dir))) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(filePath)) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] ?? 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    fs.createReadStream(filePath).pipe(res);
  };

  const server = http.createServer(handler);

  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryListen = (port: number) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && attempt < 20) {
          attempt += 1;
          tryListen(port + 1);
        } else {
          reject(err);
        }
      });
      server.once('listening', () => {
        const addr = server.address();
        const bound = typeof addr === 'object' && addr ? addr.port : port;
        resolve({
          port: bound,
          close: () => server.close(),
        });
      });
      server.listen(port, '127.0.0.1');
    };
    tryListen(preferredPort);
  });
}

/**
 * Best-effort cross-platform browser open. No external deps.
 * Returns true if the spawn call was issued (doesn't guarantee browser actually opened).
 */
export async function openBrowser(url: string): Promise<boolean> {
  try {
    const { spawn } = await import('node:child_process');
    const platform = process.platform;
    let cmd: string;
    let args: string[];
    if (platform === 'win32') {
      cmd = 'cmd';
      args = ['/c', 'start', '""', url];
    } else if (platform === 'darwin') {
      cmd = 'open';
      args = [url];
    } else {
      cmd = 'xdg-open';
      args = [url];
    }
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
