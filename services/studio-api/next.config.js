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
  ],
  turbopack: {
    root: path.join(__dirname, '..', '..'),
  },
  // CORS is applied per request in src/proxy.ts from an origin allowlist (src/lib/cors.ts).
};

module.exports = nextConfig;
