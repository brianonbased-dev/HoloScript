/**
 * Edge-safe headers for Server-Sent Events (SSE) through Railway, nginx, and CDNs.
 *
 * Long-lived streams are often buffered unless proxies are told not to; without
 * `X-Accel-Buffering: no` and strong cache disabling, clients may see no events
 * until a large buffer fills or the connection drops.
 *
 * Note: This does **not** fix MCP classic SSE on multi-replica deploys where
 * GET `/mcp` and POST `/mcp/messages` hit different instances — that needs
 * sticky sessions, a single replica, or streamable HTTP (POST `/mcp` only).
 */

import type http from 'http';

export function applyEdgeSafeSseHeaders(res: http.ServerResponse): void {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0, no-transform');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
