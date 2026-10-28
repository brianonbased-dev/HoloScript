/** @type {import('next').NextConfig} */
const path = require('path');

const README_URL = 'https://github.com/brianonbased-dev/HoloScript#readme';
const FRONT_DOOR_REDIRECTS = [
  { source: '/getting-started', destination: 'https://holoscript.studio/install', permanent: false },
  { source: '/docs', destination: README_URL, permanent: false },
  { source: '/docs/:path*', destination: README_URL, permanent: false },
];

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
  // TEMPORARY front-door redirects (Growth & Compliance decision). These are
  // 302s on purpose (permanent: false) so browsers and crawlers do not cache
  // them; remove once holoscript.net serves its own getting-started and docs.
  async redirects() {
    return FRONT_DOOR_REDIRECTS;
  },
  async rewrites() {
    return [{ source: '/health', destination: '/api/health' }];
  },
};

module.exports = nextConfig;
module.exports.FRONT_DOOR_REDIRECTS = FRONT_DOOR_REDIRECTS;
