/**
 * Rate-limit bypass heuristics (P.009.02) — runtime module:
 * packages/mcp-server/src/security/bypass-detection.ts
 *
 * Wired into stateless POST /mcp tools/call via securedToolExecution.
 * Optional Slack: SLACK_SECURITY_WEBHOOK_URL. Disable locally: BYPASS_DETECTION_ENABLED=false.
 */

export {};
