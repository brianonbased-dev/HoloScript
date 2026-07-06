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
  getMcpApiKeyAsync,
  getHolomeshKey,
  getHolomeshKeyAsync,
  getAbsorbKey,
  getAbsorbKeyAsync,
  getMoltbookKey,
  getMoltbookKeyAsync,
  getAnthropicKey,
  getAnthropicKeyAsync,
  getOpenAIKey,
  getOpenAIKeyAsync,
  getRailwayToken,
  getRailwayTokenAsync,
  getTeamId,
  resolveConfigSecret,
  configureConfigSecretResolver,
  resetConfigSecretResolver,
  getOAuthToken,
  invalidateOAuthTokenCache,
  mcpAuthHeaders,
  mcpAuthHeadersAsync,
  holomeshAuthHeaders,
  holomeshAuthHeadersAsync,
  absorbAuthHeaders,
  absorbAuthHeadersAsync,
  type ConfigSecretResolver,
} from './auth';

export { validateConfig, requireConfig, REQUIRED_VARS, type ValidationResult } from './validate';
