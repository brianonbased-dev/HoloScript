import * as esbuild from 'esbuild';
import fs from 'fs';
import _path from 'path';
import { fileURLToPath } from 'url';

const __dirname = _path.dirname(fileURLToPath(import.meta.url));

const nodeShimModules = [
  '@aztec/bb.js',
  'puppeteer-core',
  'ioredis',
  'jsonwebtoken',
  'jws',
  'cosmiconfig',
  '@holoscript/platform',
  '@holoscript/framework',
  '@holoscript/framework/economy',
  '@holoscript/engine',
  '@holoscript/crdt-spatial',
  '@holoscript/mcp-server',
  '@holoscript/snn-webgpu',
  '@modelcontextprotocol/sdk',
  'loro-crdt',
  'playwright',
  'playwright-core',
  'crypto',
  'fs',
  'fs/promises',
  'path',
  'zlib',
  'net',
  'tls',
  'dns',
  'stream',
  'os',
  'buffer',
  'punycode',
  'url',
  'child_process',
  'readline',
  'http',
  'https',
  'http2',
  'util',
  'assert',
  'events',
  'tty',
  'perf_hooks',
  'worker_threads',
  'inspector',
  'diagnostics_channel',
  'trace_events',
  'wasi',
  'v8',
  'vm',
  'string_decoder',
  'sys',
  'constants',
  'async_hooks',
  'dgram',
  'process',
  'node:fs/promises',
  'node:readline/promises',
  'node:timers',
  'node:timers/promises',
];

const nodeProtocolShimModules = nodeShimModules
  .filter((moduleName) => !moduleName.startsWith('@') && !moduleName.startsWith('node:') && !moduleName.includes('/'))
  .map((moduleName) => `node:${moduleName}`);

const workspaceShimPatterns = [
  '@holoscript/platform/*',
  '@holoscript/framework/*',
  '@holoscript/engine/*',
  '@holoscript/crdt-spatial/*',
  '@holoscript/mcp-server/*',
  '@holoscript/snn-webgpu/*',
  '@modelcontextprotocol/sdk/*',
  'loro-crdt/*',
  'playwright/*',
  'playwright-core/*',
  'node:*',
];

const shimImportMapEntries = [...nodeShimModules, ...nodeProtocolShimModules]
  .map((moduleName) => `        "${moduleName}": "/native/assets/node-fs-shim.js"`)
  .join(',\n');

async function build() {
  console.log('Building spatial client with esbuild...');
  
  // Ensure dist directory exists
  if (!fs.existsSync('dist/client')) {
    fs.mkdirSync('dist/client', { recursive: true });
  }

  await esbuild.build({
    entryPoints: ['src/main.tsx'],
    bundle: true,
    outfile: 'dist/client/main.js',
    format: 'esm',
    target: ['es2022'],
    external: [
      'react', 
      'react-dom', 
      'react-dom/client', 
      'three', 
      '@react-three/fiber', 
      '@react-three/drei', 
      '@react-three/rapier',
      'three-stdlib',
      ...nodeShimModules,
      ...nodeProtocolShimModules,
      ...workspaceShimPatterns
    ],
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
      '.svg': 'file',
      '.wasm': 'file',
      '.wgsl': 'text'
    },
    minify: true,
    sourcemap: true,
    logLevel: 'info'
  });

  // Copy and transform index.html
  let html = fs.readFileSync('index.html', 'utf-8');
  
  // Add import map to head if not exists
  if (!html.includes('importmap')) {
    const importMap = `
    <script async src="https://ga.jspm.io/npm:es-module-shims@1.10.0/dist/es-module-shims.js"></script>
    <script type="importmap">
    {
      "imports": {
        "react": "https://esm.sh/react@18.2.0",
        "react-dom": "https://esm.sh/react-dom@18.2.0",
        "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
        "three": "https://esm.sh/three@0.160.0",
        "three/": "https://esm.sh/three@0.160.0/",
        "three-stdlib": "https://esm.sh/three-stdlib@2.29.4?deps=three@0.160.0",
        "@react-three/fiber": "https://esm.sh/@react-three/fiber@8.15.11?deps=three@0.160.0,react@18.2.0",
        "@react-three/drei": "https://esm.sh/@react-three/drei@9.89.0?deps=three@0.160.0,react@18.2.0,@react-three/fiber@8.15.11",
        "@react-three/rapier": "https://esm.sh/@react-three/rapier@1.2.1?deps=three@0.160.0,react@18.2.0,@react-three/fiber@8.15.11",
        "lucide-react": "https://esm.sh/lucide-react@0.314.0?deps=react@18.2.0",
        "zustand": "https://esm.sh/zustand@4.5.0?deps=react@18.2.0",
${shimImportMapEntries}
      }
    }
    </script>
`;
    html = html.replace('</head>', importMap + '</head>');
  }

  // Inject bundled CSS file if esbuild generated one
  if (fs.existsSync('dist/client/main.css')) {
    html = html.replace('</head>', '<link rel="stylesheet" href="/main.css">\n</head>');
  }

  // Update script src from /src/main.tsx to /main.js
  html = html.replace('src="/src/main.tsx"', 'src="/main.js"');
  
  fs.writeFileSync('dist/client/index.html', html);
  
  // Copy static assets
  if (fs.existsSync('public')) {
    fs.cpSync('public', 'dist/client', { recursive: true });
  }

  // Live evidence strip: prefer fresh manifest from docs/ (same build as VitePress)
  const docManifest = _path.resolve(__dirname, '../../docs/public/live-evidence.json');
  if (fs.existsSync(docManifest)) {
    fs.copyFileSync(docManifest, _path.join('dist/client', 'live-evidence.json'));
    console.log('[build] copied docs/public/live-evidence.json -> dist/client/live-evidence.json');
  } else {
    console.warn('[build] docs/public/live-evidence.json missing — run: node scripts/build-live-evidence-manifest.mjs');
  }

  console.log('Build completed successfully.');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
