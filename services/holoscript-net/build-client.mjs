import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

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
      '@aztec/bb.js', 'puppeteer-core', 'ioredis', 'jsonwebtoken', 'jws', 'cosmiconfig',
      'crypto', 'fs', 'fs/promises', 'path', 'zlib', 'net', 'tls', 'dns', 'stream',
      'os', 'buffer', 'punycode', 'url', 'child_process', 'readline', 'http', 'https',
      'util', 'assert', 'events', 'tty', 'perf_hooks', 'worker_threads', 'inspector',
      'diagnostics_channel', 'trace_events', 'wasi', 'v8', 'string_decoder', 'sys'
    ],
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
      '.svg': 'file'
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
        "@aztec/bb.js": "/native/assets/node-fs-shim.js",
        "puppeteer-core": "/native/assets/node-fs-shim.js",
        "ioredis": "/native/assets/node-fs-shim.js",
        "jsonwebtoken": "/native/assets/node-fs-shim.js",
        "jws": "/native/assets/node-fs-shim.js",
        "cosmiconfig": "/native/assets/node-fs-shim.js",
        "crypto": "/native/assets/node-fs-shim.js",
        "fs": "/native/assets/node-fs-shim.js",
        "fs/promises": "/native/assets/node-fs-shim.js",
        "path": "/native/assets/node-fs-shim.js",
        "zlib": "/native/assets/node-fs-shim.js",
        "net": "/native/assets/node-fs-shim.js",
        "tls": "/native/assets/node-fs-shim.js",
        "dns": "/native/assets/node-fs-shim.js",
        "stream": "/native/assets/node-fs-shim.js",
        "os": "/native/assets/node-fs-shim.js",
        "buffer": "/native/assets/node-fs-shim.js",
        "punycode": "/native/assets/node-fs-shim.js",
        "url": "/native/assets/node-fs-shim.js",
        "child_process": "/native/assets/node-fs-shim.js",
        "readline": "/native/assets/node-fs-shim.js",
        "http": "/native/assets/node-fs-shim.js",
        "https": "/native/assets/node-fs-shim.js",
        "util": "/native/assets/node-fs-shim.js",
        "assert": "/native/assets/node-fs-shim.js",
        "events": "/native/assets/node-fs-shim.js",
        "tty": "/native/assets/node-fs-shim.js",
        "perf_hooks": "/native/assets/node-fs-shim.js",
        "worker_threads": "/native/assets/node-fs-shim.js",
        "inspector": "/native/assets/node-fs-shim.js",
        "diagnostics_channel": "/native/assets/node-fs-shim.js",
        "trace_events": "/native/assets/node-fs-shim.js",
        "wasi": "/native/assets/node-fs-shim.js",
        "v8": "/native/assets/node-fs-shim.js",
        "string_decoder": "/native/assets/node-fs-shim.js",
        "sys": "/native/assets/node-fs-shim.js"
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

  console.log('Build completed successfully.');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
