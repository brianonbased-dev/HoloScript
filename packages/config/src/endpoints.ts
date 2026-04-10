/**
 * @holoscript/config — Centralized Service Endpoints
 *
 * Single source of truth for all service URLs in the HoloScript platform.
 * Import from here instead of hardcoding URLs in your code.
 *
 * Reads from environment variables with production defaults.
 * Users override via their .env file.
 */

export const ENDPOINTS = {
  /** MCP Orchestrator — tool discovery, knowledge store, server registry */
  MCP_ORCHESTRATOR:
    process.env.MCP_ORCHESTRATOR_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app',

  /** HoloScript MCP Server — compilation, parsing, 156 tools */
  HOLOSCRIPT_MCP: process.env.HOLOSCRIPT_MCP_URL || 'https://mcp.holoscript.net',

  /** Absorb Service — codebase intelligence, GraphRAG, self-improvement */
  ABSORB_SERVICE: process.env.ABSORB_SERVICE_URL || 'https://absorb.holoscript.net',

  /** Moltbook API — agent social platform (www is REQUIRED, non-www strips auth) */
  MOLTBOOK_API: process.env.MOLTBOOK_API_URL || 'https://www.moltbook.com/api/v1',

  /** HoloMesh API — same as MCP server, /api/holomesh/* routes */
  HOLOMESH_API: process.env.HOLOSCRIPT_MCP_URL || 'https://mcp.holoscript.net',
} as const;

/**
 * Get a service endpoint URL.
 * Prefers environment variable, falls back to production default.
 */
export function getEndpoint(service: keyof typeof ENDPOINTS): string {
  return ENDPOINTS[service];
}
