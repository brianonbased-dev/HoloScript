/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@holoscript/mcp-server', 'tree-sitter-javascript', 'tree-sitter', 'web-tree-sitter', '@holoscript/core'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  // CORS configuration to allow the Studio frontend to hit the API Gateway
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" }, // Update in prod
          { key: "Access-Control-Allow-Methods", value: "GET,OPTIONS,PATCH,DELETE,POST,PUT" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ]
      }
    ]
  }
};

module.exports = nextConfig;
