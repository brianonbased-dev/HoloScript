/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  serverExternalPackages: [
    '@holoscript/mcp-server',
    'tree-sitter-javascript',
    'tree-sitter',
    'web-tree-sitter',
    '@holoscript/core',
    // Node-only (reads node:fs); resolved at runtime like core, not bundled into routes.
    '@holoscript/llm-provider',
    // Native/ML deps reachable through core -> engine; never bundle sharp's libvips binaries.
    '@holoscript/engine',
    'sharp',
    '@huggingface/transformers',
  ],
  turbopack: {
    root: path.join(__dirname, '..', '..'),
  },
  // CORS configuration to allow the Studio frontend to hit the API Gateway
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' }, // Update in prod
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
