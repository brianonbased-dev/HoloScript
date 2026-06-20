/** @type {import('next').NextConfig} */
const path = require('path');
const { networkInterfaces } = require('os');

function isPrivateIpv4(address) {
  const [a, b] = address.split('.').map((part) => Number(part));
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function localLanDevOrigins() {
  const hosts = new Set();
  addDevOrigin(hosts, 'localhost');
  addDevOrigin(hosts, '127.0.0.1');
  addDevOrigin(hosts, '*.trycloudflare.com');
  for (const infos of Object.values(networkInterfaces())) {
    for (const info of infos || []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      if (!isPrivateIpv4(info.address)) continue;
      addDevOrigin(hosts, info.address);
    }
  }
  addDevOrigin(hosts, process.env.STUDIO_LAN_HOST);
  addDevOrigin(hosts, process.env.STUDIO_MOBILE_ORIGIN);
  addDevOrigin(hosts, process.env.NEXT_PUBLIC_STUDIO_MOBILE_ORIGIN);
  return [...hosts].filter(Boolean);
}

function addDevOrigin(hosts, value) {
  const raw = value?.trim();
  if (!raw) return;
  try {
    hosts.add(new URL(raw).hostname);
  } catch {
    hosts.add(
      raw
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .split(':')[0]
    );
  }
}

const nextConfig = {
  reactStrictMode: true,
  // TEMPORARY (re-affirmed 2026-06-08; originally 2026-05-31): unblock the studio
  // deploy. `next build`'s whole-program TYPE-CHECK fails on workspace @holoscript/*
  // imports whose fresh Docker build emits no/mis-located .d.ts — e.g. platform's
  // tsconfig `rootDir:".."` makes `tsc --emitDeclarationOnly` land at
  // dist/platform/src/index.d.ts, NOT the dist/index.d.ts that package.json `types`
  // points at. This is a structural Docker-dts-vs-typecheck mismatch, NOT a source
  // defect: local `tsc --noEmit -p packages/studio/tsconfig.json` is clean except a
  // Web Speech API lib gap (8 errs in one file). Type-safety stays gated at
  // pre-commit + HoloCI; the production IMAGE build must not depend on
  // whole-monorepo .d.ts resolution (that fragility has bricked deploys repeatedly).
  // swc still fully compiles, so real codegen errors still fail the build.
  // Re-enable strict here once dts emission is fixed + the studio tsconfig alias map
  // completed (tracked board task). NOTE: this was regressed to `false` sometime
  // after 05-31 — which re-broke Railway one type-error per build (platform, today).
  typescript: { ignoreBuildErrors: true },
  // (Next 16 removed the next.config `eslint` key and runs no ESLint during
  // `next build`, so lint is gated separately at pre-commit + HoloCI — nothing to
  // configure here. An `eslint:` key would only emit an "Invalid options" warning.)
  allowedDevOrigins: localLanDevOrigins(),
  images: {
    formats: ['image/avif', 'image/webp'],
    // Use remotePatterns (preferred over deprecated `domains`) for external image sources
    remotePatterns: [
      { protocol: 'https', hostname: '**.holoscript.net' },
      { protocol: 'https', hostname: '**.holomesh.net' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'cdn.polyhaven.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self' ws: wss: https:;",
          },
          // Cross-origin isolation enables SharedArrayBuffer for @holoscript/compiler-wasm.
          // COOP must be `same-origin-allow-popups` (not `same-origin`) — Quest Browser's
          // VR compositor spawns a cross-origin context that needs opener access.
          // `same-origin` breaks navigator.xr.isSessionSupported on Meta Quest Browser.
          // See research/quest3-iphone-moment/a-quest3-feasibility-probe.md (step 7)
          // and c-studio-share-path-map.md (G5).
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
          // Quest Browser requires explicit xr-spatial-tracking permission.
          // Omitting this causes isSessionSupported('immersive-vr') to return false.
          {
            key: 'Permissions-Policy',
            value: 'xr-spatial-tracking=*, camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
  // Short share URL: /w/<id> serves the same page as /shared/<id>.
  // Rewrite (not redirect) so the browser keeps the short URL visible.
  // See research/quest3-iphone-moment/c-studio-share-path-map.md (G1).
  async rewrites() {
    return [
      // /health -> /api/health: Railway and external monitors hit /health
      // expecting JSON; without this rewrite Next.js serves the catch-all
      // HTML page. The actual handler is src/app/api/health/route.ts.
      { source: '/health', destination: '/api/health' },
      { source: '/w/:id', destination: '/shared/:id' },
    ];
  },
  async redirects() {
    return [
      { source: '/scenarios/:path*', destination: '/start', permanent: true },
      { source: '/publish/:path*', destination: '/create', permanent: true },
      // /operations is now a real page (the D.081 operate console: live
      // fleet/CI/Lotus/board telemetry), no longer an alias for /admin.
      // The /admin absorb dashboard stays at /admin.
      // Canonical-domain cutover (founder 2026-06-14: "playground should live in
      // .studio not .net"): the Studio — and every route it owns, incl. /playground —
      // lives at holoscript.studio (W.713 clean front door), NOT the legacy
      // studio.holoscript.net subdomain. Permanently redirect any access on the .net
      // subdomain to the .studio canonical, preserving the path. Host-scoped, so the
      // holoscript.net marketing apex/www are untouched.
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'studio.holoscript.net' }],
        destination: 'https://holoscript.studio/:path*',
        permanent: true,
      },
    ];
  },
  // NOTE: `typescript.ignoreBuildErrors` is set ABOVE (true, the dated TEMPORARY
  // unblock for the workspace-dts-vs-typecheck mismatch). A second
  // `typescript: { ignoreBuildErrors: false }` used to live here and SILENTLY
  // OVERRODE that (last duplicate key wins), defeating the unblock and making
  // Railway fail the typecheck one error per build. Removed — the single source
  // of truth is the line ~54 setting. Re-enable strict checks there once
  // workspace .d.ts emission is fixed (tracked board task).
  // Standalone output for Railway/Docker (skip on Windows — symlinks need admin)
  ...(process.platform !== 'win32' && { output: 'standalone' }),

  // Renamed from `turbo` to `turbopack` in Next.js 16 (config-key migration).
  // The old `turbo` key is silently ignored, causing the .wgsl loader rule
  // and resolveAlias map to be dropped — which broke Studio dev with
  // "Unknown module type" errors on .wgsl imports from @holoscript/engine.
  turbopack: {
    root: path.join(__dirname, '..', '..'),
    // Next.js 16's turbopack.resolveAlias rejects `false` (the webpack
    // convention to disable a module). Use empty-module-stub.js as the
    // alias target — semantically equivalent: any import resolves to {}
    // and tree-shakes cleanly. Keeps Node-only deps out of client bundles.
    resolveAlias: (() => {
      const stub = './empty-module-stub.cjs';
      return {
        tls: stub,
        net: stub,
        worker_threads: stub,
        'node:worker_threads': stub,
        ws: stub,
        ioredis: stub,
        puppeteer: stub,
        playwright: stub,
        '@xenova/transformers': stub,
        memfs: stub,
        'isomorphic-git': stub,
        '@holoscript/engine': stub,
        '@holoscript/engine/gpu': stub,
        '@holoscript/framework': stub,
        '@holoscript/platform': stub,
        '@holoscript/mesh': stub,
        // webgpu npm pkg (Dawn Node binding) uses `createRequire from 'module'` —
        // no browser equivalent. Leaks via @holoscript/core reconstruction/webgpuGate.ts.
        webgpu: stub,
        '@holoscript/snn-webgpu': stub,
      };
    })(),
    rules: {
      '*.wgsl': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
  },

  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  // Pages load native scenes from the repo examples/ library at runtime via
  // loadHoloExample (fs.readFileSync) — e.g. /playground/pipeline. Next.js does
  // NOT trace fs.readFileSync paths, so without this the standalone build omits
  // examples/ and the page hits its error fallback in production. Paths are
  // relative to this config; outputFileTracingRoot (repo root) anchors the copy.
  outputFileTracingIncludes: {
    '/**': ['../../examples/**/*.holo', '../../examples/**/*.hs', '../../examples/**/*.hsplus'],
  },
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx', 'holo'],
  serverExternalPackages: [
    // loro-crdt is a wasm-bindgen package. Webpack resolves its `module` field to the
    // `bundler/` target, which `import`s loro_wasm_bg.wasm; with asyncWebAssembly the wasm is
    // emitted as a server chunk asset that goes MISSING during `next build` "collect page data"
    // → `ENOENT .next/server/chunks/loro_wasm_bg.wasm` for /api/world-state/[entityId] and
    // /api/world-drive (bricked every studio deploy, 2026-06-20). Externalizing makes Next require
    // the CommonJS `nodejs/` target at runtime, which loads the wasm via fs.readFileSync(__dirname)
    // from node_modules where it sits beside the JS (and outputFileTracing copies it standalone).
    'loro-crdt',
    'tree-sitter',
    'tree-sitter-javascript',
    'tree-sitter-typescript',
    'tree-sitter-python',
    'tree-sitter-rust',
    'tree-sitter-go',
    'web-tree-sitter',
    '@xenova/transformers',
    'memfs',
    'isomorphic-git',
    '@jsonjoy.com/fs-node',
    '@jsonjoy.com/fs-node-builtins',
    '@holoscript/engine',
    'onnxruntime-node',
    'webgpu',
    '@holoscript/snn-webgpu',
  ],
  transpilePackages: [
    '@holoscript/studio-plugin-sdk',
    '@holoscript/connector-core',
    '@holoscript/connector-github',
    '@holoscript/connector-railway',
    '@holoscript/connector-upstash',
    '@holoscript/connector-appstore',
    '@holoscript/connector-vscode',
    'three',
    '@holoscript/std',
    '@holoscript/r3f-renderer',
    // Added 2026-04-25 to fix Next.js webpack `Module not found:
    // Can't resolve './XrMetricsBinding.js'` (and friends in
    // marketplace-agentkit). Without these in transpilePackages,
    // Next.js webpack resolves workspace-symlink imports against
    // raw .ts source but won't apply the .js→.ts extensionAlias
    // (set below in the webpack config). transpilePackages tells
    // Next to run its full pipeline (TS→JS, extensionAlias, etc.)
    // on these workspace packages, matching the local-monorepo
    // dev experience to the deploy build.
    '@holoscript/core',
    '@holoscript/marketplace-agentkit',
  ],
  webpack: (config, { isServer, defaultLoaders }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      syncWebAssembly: true,
    };

    // ESM .js-extension import resolution. Workspace packages use the
    // NodeNext convention where TypeScript source files import siblings
    // with a `.js` extension (e.g. `from './XrMetricsBinding.js'` resolving
    // to `./XrMetricsBinding.ts` at compile time). Webpack's default doesn't
    // handle this without `extensionAlias`. There are 131+ such imports
    // across @holoscript/core src/ alone — fixing this at config level
    // covers all of them in one line. Verified 2026-04-25 against Railway
    // deployment 5e06c58f failing on `Module not found: Can't resolve
    // './XrMetricsBinding.js'`.
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias || {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      // Studio imports only extractTraits/formatBytes from @holoscript/std.
      // Point webpack at the source utility so local dev and E2E do not depend on generated std dist files.
      '@holoscript/std$': path.resolve(__dirname, '../std/src/string.ts'),
      // Force a SINGLE instance of @react-three/fiber + three. pnpm symlinks
      // let webpack load TWO copies of fiber (one resolved from studio's
      // node_modules, one from @holoscript/r3f-renderer's), so r3f-renderer's
      // hooks (CompiledTraitMesh's useFrame) run against a different fiber
      // React context than studio's <Canvas> → "R3F: Hooks can only be used
      // within the Canvas component!". Aliasing to one realpath dedupes the
      // module so the context is shared (a single three instance also keeps
      // instanceof checks valid across the boundary).
      // Resolve to each package's MAIN entry file (exact-match `$` so subpath
      // imports like `three/examples/jsm/*` are untouched). NOT `<pkg>/package.json`
      // — three's `exports` map doesn't expose ./package.json (ERR_PACKAGE_PATH_NOT_EXPORTED).
      '@react-three/fiber$': require.resolve('@react-three/fiber'),
      three$: require.resolve('three'),
    };

    config.module.rules.push({
      test: /\.(glb|gltf|hdr)$/,
      type: 'asset/resource',
    });

    config.module.rules.push({
      test: /\.holo$/,
      use: [
        defaultLoaders.babel,
        {
          loader: require.resolve('./src/lib/holo-loader.mjs'),
        },
      ],
    });

    // Stub out optional peer deps from @holoscript/core that aren't needed for Studio
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'node:crypto': false,
        'node:fs': false,
        'node:fs/promises': false,
        'node:os': false,
        'node:path': false,
        'node:zlib': false,
      };
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        'fs/promises': false,
        path: false,
        os: false,
        net: false,
        tls: false,
        dns: false,
        dgram: false,
        child_process: false,
        cluster: false,
        http2: false,
        crypto: false,
        stream: false,
        buffer: false,
        events: false,
        https: false,
        http: false,
        url: false,
        zlib: false,
        util: false,
        querystring: false,
        worker_threads: false,
        // `module` (createRequire et al.) leaks into the client via
        // @holoscript/core/dist — a Node builtin with no browser equivalent.
        module: false,
        'node:crypto': false,
        'node:fs': false,
        'node:fs/promises': false,
        'node:os': false,
        'node:path': false,
        'node:zlib': false,
        'node:worker_threads': false,
        'node:module': false,
        // webgpu npm pkg leaks via @holoscript/core reconstruction/webgpuGate.ts require('webgpu')
        webgpu: false,
      };
    }

    // Alias optional dependencies to empty modules to avoid build failures
    config.resolve.alias = {
      ...config.resolve.alias,
      '@pixiv/three-vrm': false,
      ioredis: false,
      puppeteer: false,
      playwright: false,
      '@aztec/bb.js': false,
      '@xenova/transformers': false,
      // Externalize blockchain/wallet packages that don't work in browser
      '@coinbase/agentkit': false,
      // Stub engine + framework deep imports (pulled in via @holoscript/core barrel)
      // NOTE (2026-06-10): server code that needs the REAL engine (e.g.
      // /api/manufacturing/* routes) must load it via
      // `import(/* webpackIgnore: true */ '@holoscript/engine')` — the alias
      // below applies to ALL webpack layers, and Next's ESM-external interop
      // proxies break engine namespace access even when exempted here.
      ...Object.fromEntries(
        ['@holoscript/engine', '@holoscript/framework'].flatMap((pkg) => {
          // Generate false aliases for the base package and common subpaths
          const subs = [
            '',
            '/ai',
            '/networking',
            '/multiplayer',
            '/runtime',
            '/physics',
            '/animation',
            '/rendering',
            '/scene',
            '/ecs',
            '/dialogue',
            '/environment',
            '/camera',
            '/input',
            '/vr',
            '/orbital',
            '/hologram',
            '/navigation',
            '/combat',
            '/character',
            '/gameplay',
            '/particles',
            '/terrain',
            '/tilemap',
            '/procedural',
            '/world',
            '/vm',
            '/vm-bridge',
          ];
          return subs.map((s) => [`${pkg}${s}`, false]);
        })
      ),
      '@holoscript/mcp-server': false,
      '@holoscript/mcp-server/compiler-tools': false,
      '@holoscript/mcp-server/networking-tools': false,
      '@holoscript/mcp-server/snapshot-tools': false,
      '@holoscript/mcp-server/monitoring-tools': false,
      '@holoscript/mcp-server/codebase-tools': false,
      '@holoscript/mcp-server/graph-rag-tools': false,
      '@holoscript/mcp-server/self-improve-tools': false,
      '@holoscript/mcp-server/gltf-import-tools': false,
      viem: false,
      'viem/accounts': false,
      '@privy-io/server-auth': false,
      '@x402/paywall': false,
      '@x402/core': false,
      '@x402/fetch': false,
      '@holoscript/plugin-hardware-invention': false,
      '@holoscript/plugin-therapy': false,
      // Plugin packages imported by @holoscript/core/dist/traits/index.js but
      // excluded from pre-flight build (--filter '!./packages/plugins/**').
      // Stub them so studio's webpack walk doesn't die on Module not found.
      // See deploy-railway.yml targeted-build for the exclusion.
      '@holoscript/plugin-film-vfx': false,
      '@holoscript/alphafold-plugin': false,
      '@holoscript/domain-plugin-template': false,
      '@holoscript/plugin-emergency-response': false,
      '@holoscript/plugin-forensics': false,
      'node:stream': false,
      'node:buffer': false,
      memfs: false,
      'isomorphic-git': false,
    };

    // Catch-all: stub Node.js-only packages that leak into client bundle via @holoscript/core
    config.plugins.push(
      new (require('webpack').NormalModuleReplacementPlugin)(
        /^@holoscript\/(engine|framework|mesh|platform)(\/.*)?$/,
        require.resolve('./src/lib/empty-module.js')
      )
    );

    // Catch-all: every @holoscript/*-plugin and @holoscript/plugin-* gets
    // imported by @holoscript/core/dist/traits/index.js at load time, but
    // pre-flight build excludes packages/plugins/** for speed. Stub them
    // all so studio's webpack walk never dies on a new plugin we haven't
    // explicitly aliased yet. Plugins are data, not code (S.MCP arch
    // rule) — they shouldn't be in core's runtime imports anyway. The
    // bigger fix is removing those imports from core; until then, this
    // regex makes the deploy resilient to plugin churn. See deploy-
    // railway.yml targeted-build --filter '!./packages/plugins/**'.
    config.plugins.push(
      new (require('webpack').NormalModuleReplacementPlugin)(
        /^@holoscript\/(plugin-[\w-]+|[\w-]+-plugin)$/,
        require.resolve('./src/lib/empty-module.js')
      )
    );

    // Stub ws (WebSocket) — Node.js only, leaks via core barrel
    config.resolve.alias['ws'] = require.resolve('./src/lib/empty-module.js');
    config.resolve.alias['bufferutil'] = false;
    config.resolve.alias['utf-8-validate'] = false;

    // Stub ONNX Runtime node bindings — native .node files can't be bundled by
    // webpack. onnxruntime-node leaks into the client bundle via @holoscript/core's
    // traits barrel (chunk-QPIPBNG5.js → ort.node.min-*.js → ort.node.min.mjs).
    // See Studio build error: "Module not found: Can't resolve 'ort.node.min.mjs'".
    config.resolve.alias['onnxruntime-node'] = require.resolve('./src/lib/empty-module.js');
    config.plugins.push(
      new (require('webpack').NormalModuleReplacementPlugin)(
        /ort\.node\.min/,
        require.resolve('./src/lib/empty-module.js')
      )
    );

    // Stub webgpu npm pkg (Dawn Node binding) — uses `createRequire from 'module'`,
    // which has no browser equivalent. Leaks via @holoscript/core/reconstruction/webgpuGate.ts.
    config.resolve.alias['webgpu'] = require.resolve('./src/lib/empty-module.js');
    config.resolve.alias['@holoscript/snn-webgpu'] = require.resolve('./src/lib/empty-module.js');

    return config;
  },
};

module.exports = nextConfig;
