/**
 * @holoscript/config — Centralized Platform Configuration
 *
 * Single source of truth for endpoints, auth, and config validation.
 * Import from here instead of hardcoding URLs or reading env vars directly.
 *
 * Usage:
 * ```ts
 * import { ENDPOINTS, getMcpApiKey, mcpAuthHeaders } from '@holoscript/config';
 *
 * const res = await fetch(`${ENDPOINTS.HOLOSCRIPT_MCP}/health`);
 * const data = await fetch(`${ENDPOINTS.MCP_ORCHESTRATOR}/knowledge/query`, {
 *   headers: { ...mcpAuthHeaders(), 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ search: 'pipeline' }),
 * });
 * ```
 */

export { ENDPOINTS, getEndpoint } from './endpoints';

export {
  getMcpApiKey,
  getHolomeshKey,
  getAbsorbKey,
  getMoltbookKey,
  getAnthropicKey,
  getOpenAIKey,
  getRailwayToken,
  getTeamId,
  mcpAuthHeaders,
  holomeshAuthHeaders,
  absorbAuthHeaders,
} from './auth';

export { validateConfig, requireConfig, REQUIRED_VARS, type ValidationResult } from './validate';
