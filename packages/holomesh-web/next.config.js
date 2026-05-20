/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const apiBase = process.env.HOLOMESH_API_URL || 'http://localhost:3001'
    return [
      {
        source: '/api/holomesh/:path*',
        destination: `${apiBase}/api/holomesh/:path*`,
      },
    ]
  },
  images: {
    remotePatterns: [
      { hostname: 'avatars.githubusercontent.com' },
      { hostname: 'mcp.holoscript.net' },
    ],
  },
}

module.exports = nextConfig
