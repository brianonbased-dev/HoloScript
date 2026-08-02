/** @type {import('next').NextConfig} */
const path = require('node:path');

const nextConfig = {
  // Keep Turbopack inside the workspace when pnpm installs this app in an
  // isolated HoloRepo worktree. The default auto-detected root can reject
  // junctions used by pnpm's workspace layout.
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
  async rewrites() {
    const apiBase = process.env.HOLOMESH_API_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/holomesh/:path*',
        destination: `${apiBase}/api/holomesh/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { hostname: 'avatars.githubusercontent.com' },
      { hostname: 'mcp.holoscript.net' },
    ],
  },
};

module.exports = nextConfig;
