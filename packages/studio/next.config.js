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
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self' ws: wss: https:;",
          },
        ],
      },
    ];
  },
  // Enable standard Next.js build checks
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  // Standalone output for Railway/Docker (skip on Windows — symlinks need admin)
  ...(process.platform !== 'win32' && { output: 'standalone' }),

  outputFileTracingRoot: path.join(__dirname, '..', '..'),
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
    'three',
    '@holoscript/std',
    '@holoscript/r3f-renderer',
  ],
  webpack: (config, { isServer }) => {
    config.module.rules.push({
      test: /\.(glb|gltf|hdr)$/,
      type: 'asset/resource',
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
      'node:stream': false,
      'node:buffer': false,
      memfs: false,
      'isomorphic-git': false,
    };

    return config;
  },
};

module.exports = nextConfig;
