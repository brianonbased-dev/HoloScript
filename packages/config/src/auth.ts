/**
 * @holoscript/config — Server-Only Auth Helpers
 *
 * THESE FUNCTIONS THROW IF CALLED FROM THE BROWSER.
 * Keys never leave the server. Studio API routes proxy all
 * authenticated requests — the browser calls /api/compile,
 * the API route reads the key and forwards.
 *
 * Users set keys in their .env file. One file, all keys.
 */

// =============================================================================
// SERVER GUARD
// =============================================================================

function assertServer(caller: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      `@holoscript/config: ${caller}() is server-only. ` +
      'Use Studio API routes to proxy requests — never expose keys to the browser.'
    );
  }
}

// =============================================================================
// KEY ACCESSORS
// =============================================================================

/** MCP Orchestrator API key (legacy format, used for tool calls and knowledge sync) */
export function getMcpApiKey(): string {
  assertServer('getMcpApiKey');
  return process.env.MCP_API_KEY || '';
}

/** HoloMesh agent API key (holomesh_sk_* format) */
export function getHolomeshKey(): string {
  assertServer('getHolomeshKey');
  return process.env.HOLOMESH_API_KEY || '';
}

/** Absorb Service API key */
export function getAbsorbKey(): string {
  assertServer('getAbsorbKey');
  return process.env.ABSORB_API_KEY || '';
}

/** Moltbook agent API key (moltbook_sk_* format) */
export function getMoltbookKey(): string {
  assertServer('getMoltbookKey');
  return process.env.MOLTBOOK_API_KEY || '';
}

/** Anthropic API key for LLM calls */
export function getAnthropicKey(): string {
  assertServer('getAnthropicKey');
  return process.env.ANTHROPIC_API_KEY || '';
}

/** OpenAI API key for embeddings and fallback LLM */
export function getOpenAIKey(): string {
  assertServer('getOpenAIKey');
  return process.env.OPENAI_API_KEY || '';
}

/** Railway project token for deploy operations */
export function getRailwayToken(): string {
  assertServer('getRailwayToken');
  return process.env.RAILWAY_TOKEN || '';
}

/** HoloMesh team ID */
export function getTeamId(): string {
  assertServer('getTeamId');
  return process.env.HOLOMESH_TEAM_ID || '';
}

// =============================================================================
// AUTH HEADERS
// =============================================================================

/** Build Authorization header for MCP Orchestrator */
export function mcpAuthHeaders(): Record<string, string> {
  return { 'x-mcp-api-key': getMcpApiKey() };
}

/** Build Authorization header for HoloMesh API */
export function holomeshAuthHeaders(): Record<string, string> {
  return { 'Authorization': `Bearer ${getHolomeshKey()}` };
}

/** Build Authorization header for Absorb Service */
export function absorbAuthHeaders(): Record<string, string> {
  return { 'Authorization': `Bearer ${getAbsorbKey()}` };
}
