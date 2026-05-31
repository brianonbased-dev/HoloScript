/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  // Repo root is two levels up (services/holoscript-net-v2 → repo). Pin it so
  // Next traces the right workspace for standalone output on Railway and stops
  // inferring a stray home-directory lockfile as the root.
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  // Pages are authored in .holo and compiled to src/app/**/page.tsx ahead of
  // `next build` (see scripts/compile-holo-pages.ts). The Next runtime only
  // ever sees the generated .tsx — it never imports @holoscript/core, which is
  // a build-time-only devDependency used by the compile script.
  typescript: { ignoreBuildErrors: false },
  // Standalone output for Railway/Docker (skip on Windows — symlinks need admin).
  ...(process.platform !== 'win32' && { output: 'standalone' }),
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  async rewrites() {
    return [{ source: '/health', destination: '/api/health' }];
  },
};

module.exports = nextConfig;
