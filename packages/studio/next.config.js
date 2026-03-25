/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  // Suppress ESLint during builds — eslint-config-next@14 crashes inside Next.js 15.
  eslint: { ignoreDuringBuilds: true },
  // Type-checking is done separately via `pnpm typecheck` or `tsc --noEmit`.
  // The core package has pre-existing TS errors being resolved incrementally.
  typescript: { ignoreBuildErrors: true },
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
  ],
  transpilePackages: ['@holoscript/studio-plugin-sdk', 'three', '@holoscript/core', '@holoscript/std', '@holoscript/r3f-renderer'],
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
      'memfs': false,
      'isomorphic-git': false,
    };

    return config;
  },
};

module.exports = nextConfig;
