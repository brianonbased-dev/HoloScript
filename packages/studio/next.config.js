/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  // Suppress ESLint during builds — eslint-config-next@14 crashes inside Next.js 15.
  // Type-checking still runs via `tsc --noEmit` or TypeScript error reporting.
  eslint: { ignoreDuringBuilds: true },
  // Standalone output for Railway/Docker (skip on Windows — symlinks need admin)
  ...(process.platform !== 'win32' && { output: 'standalone' }),
  transpilePackages: ['@holoscript/core', '@holoscript/std', '@holoscript/studio-plugin-sdk', 'three'],
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
      // Externalize blockchain/wallet packages that don't work in browser
      '@coinbase/agentkit': false,
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
