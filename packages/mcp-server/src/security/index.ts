/**
 * HoloScript MCP Security Module
 *
 * Enterprise-grade security for the MCP server implementing:
 * - OAuth 2.1 authentication (PKCE, token rotation, DPoP)
 * - Triple-gate authorization pattern (prompt → scope → policy)
 * - EU AI Act compliant audit logging
 *
 * Architecture:
 *   Client → Gate 1 (Prompt Validation)
 *     → Gate 2 (Tool Scope Authorization)
 *       → Gate 3 (StdlibPolicy Enforcement)
 *         → Tool Execution → Audit Log
 */

// OAuth 2.1 Token Service
export {
  OAuth21Service,
  getOAuth21Service,
  resetOAuth21Service,
  SCOPE_CATEGORIES,
  DEFAULT_OAUTH_CONFIG,
  type OAuth21Config,
  type OAuthScope,
  type RegisteredClient,
  type AccessToken,
  type RefreshToken,
  type TokenResponse,
  type TokenIntrospection,
  type GrantType,
} from './oauth21';

// Tool Scope Mapping (Gate 2)
export {
  authorizeToolCall,
  getToolRiskLevel,
  getToolScopes,
  getToolsForScope,
  type AuthorizationResult,
  type ToolRiskLevel,
} from './tool-scopes';

// Triple-Gate Security (Gates 1-3)
export {
  gate1ValidateRequest,
  gate3EnforcePolicy,
  runTripleGate,
  DEFAULT_GATE1_CONFIG,
  type Gate1Config,
  type Gate1Result,
  type Gate3Config,
  type Gate3Result,
  type TripleGateResult,
  type StdlibPolicy,
} from './gates';

// GitHub Token Authentication
export { resolveGitHubTokenForMcp } from './github-auth';

// EU AI Act Audit Logging
export {
  getAuditLogger,
  resetAuditLogger,
  redactPII,
  type AuditLogEntry,
  type AuditEventType,
  type AuditResultStatus,
  type AuditLogConfig,
} from './audit-log';

// Rate-limit bypass heuristics (P.009.02)
export {
  checkRateLimitBypass,
  analyzeXForwardedFor,
  ipv4Subnet24,
  readBearerToken,
  readXForwardedFor,
  resetBypassDetectionForTests,
  type BypassCheckInput,
  type BypassCheckResult,
} from './bypass-detection';
