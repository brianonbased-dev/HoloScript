/**
 * quickstart.ts — `holoscript quickstart [name]`
 *
 * Scaffolds a working .holo project and launches it in the browser.
 * Zero prior knowledge assumed. Under 5 minutes from cold start.
 *
 * Flow:
 *   1. Create project directory with scene.holo, index.html, main.js
 *   2. Start a local static HTTP server (no install required)
 *   3. Open the browser pointing at the scene
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { exec } from 'node:child_process';

// ── Scene template ────────────────────────────────────────────────────────────

const SCENE_HOLO = `// Hello World — HoloScript Quickstart Scene
//
// This is your HoloScript scene. Edit and refresh the browser to see changes.
// Docs: https://github.com/brianonbased-dev/HoloScript

composition "Hello World" {

  object "AmbientLight" {
    type: "ambient_light"
    intensity: 0.5
  }

  object "Sun" {
    type: "directional_light"
    intensity: 0.9
    position: [5, 10, 5]
  }

  // Ground plane
  object "Ground" {
    @collidable
    geometry: "plane"
    scale: [10, 0.1, 10]
    color: "#2a2a40"
  }

  // Glowing, grabbable cube
  object "Cube" {
    @grabbable @collidable @glowing
    geometry: "cube"
    position: [0, 0.5, 0]
    color: "#7b2ffa"
    state {
      glowColor: "#00d4ff"
      glowIntensity: 1.2
    }
  }

  // Physics orb
  object "Orb" {
    @physics @glowing
    geometry: "sphere"
    position: [1.5, 2, -1]
    color: "#00d4ff"
    physics { mass: 0.5 }
  }
}
`;

function buildIndexHtml(projectName: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName} — HoloScript</title>
    <style>
      *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a1a; }
      canvas { display: block; width: 100%; height: 100%; }
      #loading {
        position: fixed; inset: 0; display: flex; align-items: center;
        justify-content: center; background: #0a0a1a; color: #fff;
        font-family: system-ui, sans-serif; z-index: 100; transition: opacity 0.5s;
      }
      #loading.hidden { opacity: 0; pointer-events: none; }
      .loader { text-align: center; }
      .loader h1 {
        font-size: 1.4rem; font-weight: 600;
        background: linear-gradient(135deg, #00d4ff, #7b2ffa);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        margin-bottom: 0.5rem;
      }
      .loader p { font-size: 0.85rem; color: #888; }
      .pulse {
        width: 40px; height: 40px; margin: 1rem auto; border-radius: 50%;
        background: linear-gradient(135deg, #00d4ff, #7b2ffa);
        animation: pulse 1.2s ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(0.8); opacity: 0.5; }
        50%       { transform: scale(1.2); opacity: 1; }
      }
      #badge {
        position: fixed; bottom: 0.75rem; left: 0.75rem;
        font-family: system-ui, sans-serif; font-size: 0.7rem; color: #555; z-index: 50;
      }
      #badge a { color: #7b2ffa; text-decoration: none; }
    </style>
  </head>
  <body>
    <div id="loading">
      <div class="loader">
        <div class="pulse"></div>
        <h1>HoloScript</h1>
        <p>Loading scene...</p>
      </div>
    </div>
    <div id="badge">
      Built with <a href="https://github.com/brianonbased-dev/HoloScript" target="_blank">HoloScript</a>
    </div>
    <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
      }
    }
    </script>
    <script type="module" src="main.js"></script>
  </body>
</html>
`;
}

const MAIN_JS = `
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ── Scene ────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
scene.fog = new THREE.Fog(0x0a0a1a, 20, 60);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 3, 6);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0.5, 0);

// ── Lights ───────────────────────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sun = new THREE.DirectionalLight(0xffeedd, 0.9);
sun.position.set(5, 10, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

// ── Ground ───────────────────────────────────────────────────────────────────
const ground = new THREE.Mesh(
  new THREE.BoxGeometry(10, 0.1, 10),
  new THREE.MeshStandardMaterial({ color: 0x2a2a40 })
);
ground.receiveShadow = true;
scene.add(ground);

// ── Cube (@grabbable @glowing) ───────────────────────────────────────────────
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x7b2ffa, emissive: 0x00d4ff, emissiveIntensity: 0.3 })
);
cube.position.set(0, 0.55, 0);
cube.castShadow = true;
scene.add(cube);

// ── Orb (@physics @glowing) ──────────────────────────────────────────────────
const orb = new THREE.Mesh(
  new THREE.SphereGeometry(0.4, 32, 32),
  new THREE.MeshStandardMaterial({ color: 0x00d4ff, emissive: 0x00d4ff, emissiveIntensity: 0.6 })
);
orb.position.set(1.5, 2, -1);
orb.castShadow = true;
scene.add(orb);

// ── Animate ──────────────────────────────────────────────────────────────────
let elapsed = 0;
let orbVy = 0;
const GRAVITY = -9.8;

function animate() {
  requestAnimationFrame(animate);
  const dt = 1 / 60;
  elapsed += dt;

  cube.rotation.y += 0.4 * dt;
  cube.position.y = 0.55 + Math.sin(elapsed * 1.4) * 0.06;

  orbVy += GRAVITY * dt;
  orb.position.y += orbVy * dt;
  if (orb.position.y < 0.45) {
    orb.position.y = 0.45;
    orbVy = Math.abs(orbVy) * 0.72;
  }
  orb.rotation.x += 0.5 * dt;

  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

animate();
document.getElementById('loading')?.classList.add('hidden');
`;

const HOLOSCRIPT_CONFIG = JSON.stringify({ version: '1', entrypoint: 'src/scene.holo', target: 'threejs' }, null, 2) + '\n';

function buildReadme(projectName: string, port: number): string {
  return `# ${projectName}

A HoloScript WebXR scene generated by \`holoscript quickstart\`.

## Running

\`\`\`bash
holoscript quickstart ${projectName}  # re-scaffold + serve
\`\`\`

Or serve the existing project manually:

\`\`\`bash
cd ${projectName}
npx serve .      # any static server works
# open http://localhost:${port}
\`\`\`

## Editing

Edit \`src/scene.holo\` and refresh the browser to see changes.

## Next steps

- List all traits: \`holoscript traits\`
- Generate new objects: \`holoscript generate "red glowing button"\`
- Full docs: https://github.com/brianonbased-dev/HoloScript
`;
}

// ── MIME types ────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.holo': 'text/plain; charset=utf-8',
  '.hs':   'text/plain; charset=utf-8',
  '.md':   'text/plain; charset=utf-8',
};

function getMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] ?? 'application/octet-stream';
}

// ── Static file server ────────────────────────────────────────────────────────

function startServer(root: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
      const rawUrl = req.url ?? '/';
      const urlPath = rawUrl === '/' ? '/index.html' : rawUrl;

      // Prevent path traversal
      const normalised = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
      const filePath = path.join(root, normalised);

      if (!filePath.startsWith(root + path.sep) && filePath !== root) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': getMime(filePath) });
        res.end(fs.readFileSync(filePath));
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port automatically
        startServer(root, port + 1).then(resolve, reject);
      } else {
        reject(err);
      }
    });

    server.listen(port, '127.0.0.1', () => resolve(port));
  });
}

// ── Browser open ──────────────────────────────────────────────────────────────

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'win32'  ? `start "" "${url}"` :
    process.platform === 'darwin' ? `open "${url}"` :
                                    `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      console.log(`  \x1b[33m⚠\x1b[0m  Could not auto-open browser — navigate to: \x1b[1m${url}\x1b[0m`);
    }
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface QuickstartOptions {
  /** Project directory name (default: my-holoscript-app) */
  projectName?: string;
  /** Port for the dev server (default: 3030, auto-increments on conflict) */
  port?: number;
  /** Scaffold project files only — do not start server */
  scaffoldOnly?: boolean;
  /** Skip auto-opening the browser */
  noOpen?: boolean;
}

export async function quickstartCommand(opts: QuickstartOptions = {}): Promise<void> {
  const projectName = opts.projectName ?? 'my-holoscript-app';
  const preferredPort = opts.port ?? 3030;

  // Banner
  console.log();
  console.log('\x1b[36m  ╔══════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m  ║\x1b[0m\x1b[1m  \u{1F310} HoloScript Quickstart             \x1b[0m\x1b[36m║\x1b[0m');
  console.log('\x1b[36m  ╚══════════════════════════════════════╝\x1b[0m');
  console.log();

  const projectDir = path.resolve(process.cwd(), projectName);

  // Guard: do not clobber a non-empty directory
  if (fs.existsSync(projectDir)) {
    const entries = fs.readdirSync(projectDir);
    if (entries.length > 0) {
      console.error(`\x1b[31m  ✗ Directory "${projectName}" already exists and is not empty.\x1b[0m`);
      console.log(`  Tip: choose a different name or remove the directory first.`);
      process.exit(1);
    }
  }

  // Scaffold files
  console.log(`  \x1b[32m●\x1b[0m  Scaffolding \x1b[1m${projectName}\x1b[0m...`);
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });

  fs.writeFileSync(path.join(projectDir, 'src', 'scene.holo'),      SCENE_HOLO,                          'utf8');
  fs.writeFileSync(path.join(projectDir, 'index.html'),              buildIndexHtml(projectName),          'utf8');
  fs.writeFileSync(path.join(projectDir, 'main.js'),                 MAIN_JS,                             'utf8');
  fs.writeFileSync(path.join(projectDir, 'holoscript.config.json'),  HOLOSCRIPT_CONFIG,                   'utf8');
  fs.writeFileSync(path.join(projectDir, 'README.md'),               buildReadme(projectName, preferredPort), 'utf8');

  console.log(`  \x1b[32m✓\x1b[0m  Project created: \x1b[2m${projectDir}\x1b[0m`);
  console.log(`  \x1b[32m✓\x1b[0m  Entry point: \x1b[1msrc/scene.holo\x1b[0m`);

  if (opts.scaffoldOnly) {
    console.log();
    console.log('  Next steps:');
    console.log(`    \x1b[36mcd ${projectName}\x1b[0m`);
    console.log(`    \x1b[36mnpx serve .\x1b[0m`);
    console.log();
    return;
  }

  // Start static server
  console.log(`  \x1b[34m⧗\x1b[0m  Starting dev server...`);
  const boundPort = await startServer(projectDir, preferredPort);
  const url = `http://localhost:${boundPort}`;
  console.log(`  \x1b[32m✓\x1b[0m  Serving at \x1b[1m${url}\x1b[0m`);

  if (!opts.noOpen) {
    openBrowser(url);
  }

  console.log();
  console.log('\x1b[32m  ✓ Your HoloScript scene is live!\x1b[0m');
  console.log();
  console.log(`  \x1b[2mEdit\x1b[0m \x1b[1m${path.join(projectName, 'src', 'scene.holo')}\x1b[0m \x1b[2mand refresh to see changes.\x1b[0m`);
  console.log(`  \x1b[2mPress\x1b[0m \x1b[1mCtrl+C\x1b[0m \x1b[2mto stop.\x1b[0m`);
  console.log();

  // Keep process alive while server runs
  process.stdin.resume();
}
