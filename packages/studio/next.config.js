/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
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
          // Cross-origin isolation enables SharedArrayBuffer for @holoscript/compiler-wasm
          // and unlocks WebXR features that need it. `credentialless` COEP lets
          // third-party resources (Polyhaven, avatars) load without requiring them
          // to ship CORP headers — safer than `require-corp` for our current deps.
          // See research/quest3-iphone-moment/a-quest3-feasibility-probe.md (step 7)
          // and c-studio-share-path-map.md (G5).
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        ],
      },
    ];
  },
  // Short share URL: /w/<id> serves the same page as /shared/<id>.
  // Rewrite (not redirect) so the browser keeps the short URL visible.
  // See research/quest3-iphone-moment/c-studio-share-path-map.md (G1).
  async rewrites() {
    return [{ source: '/w/:id', destination: '/shared/:id' }];
  },
  async redirects() {
    const academyUrl = process.env.NEXT_PUBLIC_ACADEMY_URL || 'http://localhost:3102';
    return [
      { source: '/workspace/:path*', destination: '/projects/:path*', permanent: true },
      { source: '/scenarios/:path*', destination: '/start', permanent: true },
      { source: '/publish/:path*', destination: '/create', permanent: true },
      { source: '/operations/:path*', destination: '/admin/:path*', permanent: true },
    ];
  },
  // Enable standard Next.js build checks
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // Standalone output for Railway/Docker (skip on Windows — symlinks need admin)
  ...(process.platform !== 'win32' && { output: 'standalone' }),

  turbo: {
    resolveAlias: {
      'tls': false,
      'net': false,
      'worker_threads': false,
      'node:worker_threads': false,
      'ws': false,
      'ioredis': false,
      'puppeteer': false,
      'playwright': false,
      '@xenova/transformers': false,
      'memfs': false,
      'isomorphic-git': false,
      '@holoscript/engine': false,
      '@holoscript/engine/gpu': false,
      '@holoscript/framework': false,
      '@holoscript/platform': false,
      '@holoscript/mesh': false,
    },
    rules: {
      '*.wgsl': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
  },

  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx', 'holo'],
  serverExternalPackages: [
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
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
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
        'node:worker_threads': false,
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

    // Stub ws (WebSocket) — Node.js only, leaks via core barrel
    config.resolve.alias['ws'] = require.resolve('./src/lib/empty-module.js');
    config.resolve.alias['bufferutil'] = false;
    config.resolve.alias['utf-8-validate'] = false;

    return config;
  },
};

module.exports = nextConfig;
