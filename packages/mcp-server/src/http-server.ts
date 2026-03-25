#!/usr/bin/env node
/**
 * HoloScript MCP Server - Streamable HTTP Transport
 *
 * Production HTTP transport for HoloScript language tooling.
 * Enables remote AI agents to parse, validate, and generate HoloScript code.
 *
 * Security Architecture (AAIF Enterprise):
 * - OAuth 2.1 authentication (PKCE mandatory, token rotation, DPoP support)
 * - Triple-gate security pattern:
 *   Gate 1: Client->LLM prompt validation (size, depth, injection, rate limit)
 *   Gate 2: LLM->MCP tool authorization (per-tool OAuth scopes)
 *   Gate 3: MCP->downstream API (StdlibPolicy enforcement)
 * - EU AI Act compliant audit logging (Articles 12-14)
 * - Backwards-compatible with legacy API key during migration period
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import http from 'http';
import { tools } from './tools';
import { handleTool } from './handlers';
import { PluginManager } from './PluginManager';
import { renderPreview, createShareLink, getScene, storeScene, generateBrowserTemplate } from './renderer';
import {
  buildAgentCard,
  createTask,
  getTask,
  listTasks,
  cancelTask,
  executeTask,
  taskToResponse,
  handleJsonRpcRequest,
  parseJsonRpcRequest,
  type SendTaskRequest,
  type TaskMessage,
  type TaskState,
  type AgentCard,
} from './a2a';
import {
  getOAuth21Service,
  SCOPE_CATEGORIES,
  type TokenIntrospection,
} from './security/oauth21';
import { runTripleGate } from './security/gates';
import { getAuditLogger } from './security/audit-log';
import {
  getOAuth2Provider,
  OAUTH2_SCOPES,
} from './auth/oauth2-provider';
import type { TokenStoreBackend } from './auth/token-store';
import { PostgresTokenStore } from './auth/postgres-token-store';

const PORT = parseInt(process.env.PORT || '3000', 10);
const MCP_API_KEY = process.env.MCP_API_KEY || '';
const SERVICE_NAME = 'holoscript-mcp';
declare const __SERVICE_VERSION__: string;
const SERVICE_VERSION = typeof __SERVICE_VERSION__ !== 'undefined' ? __SERVICE_VERSION__ : '0.0.0';

// Initialize token store backend (PostgreSQL if DATABASE_URL is set, otherwise in-memory)
let tokenBackend: TokenStoreBackend | undefined;
if (process.env.DATABASE_URL) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require('pg') as typeof import('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL !== 'false' ? { rejectUnauthorized: false } : false,
  });
  tokenBackend = new PostgresTokenStore(pool);
  console.log('[auth] Using PostgreSQL token store');
} else {
  console.log('[auth] Using in-memory token store (no DATABASE_URL)');
}

// Initialize security services
const oauth = getOAuth21Service({
  legacyApiKey: MCP_API_KEY,
  migrationMode: (process.env.OAUTH_MIGRATION_MODE as 'strict' | 'permissive') || 'permissive',
});
const oauth2 = getOAuth2Provider({
  legacyApiKey: MCP_API_KEY,
  migrationMode: (process.env.OAUTH_MIGRATION_MODE as 'strict' | 'permissive') || 'permissive',
  backend: tokenBackend,
});
const auditLog = getAuditLogger();

// ── Simple per-IP rate limiter for OAuth endpoints ──────────────────────────
const RATE_LIMIT = parseInt(process.env.OAUTH_RATE_LIMIT || '100', 10);
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function getRateLimit(ip: string): { remaining: number; limit: number; resetAt: number } {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count++;
  return { remaining: Math.max(0, RATE_LIMIT - bucket.count), limit: RATE_LIMIT, resetAt: bucket.resetAt };
}

function setRateLimitHeaders(res: http.ServerResponse, rl: { remaining: number; limit: number; resetAt: number }) {
  res.setHeader('X-RateLimit-Limit', rl.limit);
  res.setHeader('X-RateLimit-Remaining', rl.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rl.resetAt / 1000));
}

// Store active transports by session ID
const transports = new Map<string, StreamableHTTPServerTransport>();

// ── Session-to-Auth mapping for MCP transport sessions ───────────────────────
const sessionAuth = new Map<string, TokenIntrospection>();

async function createAndStoreSessionTransport(
  sessionId?: string,
  auth?: TokenIntrospection,
): Promise<StreamableHTTPServerTransport> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId || randomUUID(),
  });

  const server = createMcpServer(auth);
  await server.connect(transport);

  const sid = transport.sessionId!;
  transports.set(sid, transport);

  if (auth) {
    sessionAuth.set(sid, auth);
  }

  auditLog.logSessionEvent({
    event: 'session_created',
    sessionId: sid,
    clientId: auth?.clientId,
  });

  transport.onclose = () => {
    auditLog.logSessionEvent({
      event: 'session_closed',
      sessionId: sid,
      clientId: auth?.clientId,
    });
    sessionAuth.delete(sid);
    console.log(`[MCP] Session closed: ${sid}`);
  };

  return transport;
}

// ── Authentication ───────────────────────────────────────────────────────────

/**
 * Authenticate an HTTP request via OAuth 2.1 or legacy API key.
 * Returns token introspection with scopes and agent identity.
 */
function authenticateRequest(req: http.IncomingMessage): TokenIntrospection {
  return oauth.authenticateRequest(req.headers as Record<string, string | string[] | undefined>);
}

/**
 * Legacy authentication check (kept for simple boolean checks on non-tool routes)
 */
function checkAuth(req: http.IncomingMessage): boolean {
  const auth = authenticateRequest(req);
  return auth.active;
}

/**
 * Get client IP from request (for audit logging)
 */
function getClientIP(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Parse request body from incoming request.
 * Supports both application/json and application/x-www-form-urlencoded (RFC 6749).
 */
function parseJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    const MAX_BODY = 2 * 1024 * 1024; // 2MB hard limit

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        if (!body) { resolve({}); return; }
        const ct = (req.headers['content-type'] || '').toLowerCase();
        if (ct.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(body);
          const obj: Record<string, unknown> = {};
          for (const [k, v] of params) obj[k] = v;
          resolve(obj);
        } else {
          resolve(JSON.parse(body));
        }
      } catch {
        reject(new Error('Invalid request body'));
      }
    });
    req.on('error', reject);
  });
}

// ── Secured Tool Execution ───────────────────────────────────────────────────

/**
 * Execute a tool call with full triple-gate security and audit logging.
 *
 * This is the central secured execution path. All tool calls from MCP sessions,
 * JSON-RPC fallback, and A2A tasks route through here.
 */
async function securedToolExecution(
  toolName: string,
  args: Record<string, unknown>,
  auth: TokenIntrospection,
  options?: {
    sessionId?: string;
    requestPath?: string;
    requestMethod?: string;
    ip?: string;
  },
): Promise<{ result: unknown; isError: boolean }> {
  const startTime = Date.now();

  // Run triple-gate security check
  const gateResult = runTripleGate(toolName, args, auth);

  // Audit log the invocation (pass or fail)
  const invocationId = auditLog.logToolInvocation({
    toolName,
    args,
    auth,
    gateResult,
    requestPath: options?.requestPath,
    requestMethod: options?.requestMethod,
    ip: options?.ip,
    sessionId: options?.sessionId,
  });

  // If gates failed, return denial
  if (!gateResult.passed) {
    auditLog.logToolResult({
      invocationId,
      toolName,
      status: 'denied',
      durationMs: Date.now() - startTime,
      errorMessage: gateResult.reason,
      auth,
      sessionId: options?.sessionId,
    });

    return {
      result: {
        error: `Security gate ${gateResult.gate} denied: ${gateResult.reason}`,
        gate: gateResult.gate,
        riskLevel: gateResult.riskLevel,
      },
      isError: true,
    };
  }

  // Execute the tool
  try {
    const pluginResult = await PluginManager.handleTool(toolName, args);
    const result = pluginResult !== null
      ? pluginResult
      : await handleTool(toolName, args);

    auditLog.logToolResult({
      invocationId,
      toolName,
      status: 'success',
      durationMs: Date.now() - startTime,
      auth,
      sessionId: options?.sessionId,
    });

    return { result, isError: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[MCP] Tool error: ${toolName}`, message);

    auditLog.logToolResult({
      invocationId,
      toolName,
      status: 'error',
      durationMs: Date.now() - startTime,
      errorMessage: message,
      auth,
      sessionId: options?.sessionId,
    });

    return { result: { error: message }, isError: true };
  }
}

// ── MCP Server Factory ──────────────────────────────────────────────────────

/**
 * Create MCP server instance with security-aware tool handling.
 */
function createMcpServer(sessionAuthContext?: TokenIntrospection): Server {
  const server = new Server(
    {
      name: SERVICE_NAME,
      version: SERVICE_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [...tools, ...PluginManager.getTools()],
    };
  });

  // Handle tool calls with triple-gate security
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Use session auth context or default to admin (for legacy compat)
    const auth: TokenIntrospection = sessionAuthContext || {
      active: true,
      scopes: ['admin:*'],
      agentId: 'mcp-session-legacy',
    };

    const { result, isError } = await securedToolExecution(name, args || {}, auth);

    return {
      content: [
        {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
      ...(isError ? { isError: true } : {}),
    };
  });

  return server;
}

/**
 * Unified tool handler for A2A task execution.
 * Routes through triple-gate security, plugins, then the main handler pipeline.
 */
async function handleToolForA2A(name: string, args: Record<string, unknown>): Promise<unknown> {
  // A2A tasks get admin scope (they're already authenticated at the HTTP layer)
  const auth: TokenIntrospection = {
    active: true,
    scopes: ['admin:*'],
    agentId: 'a2a-task-executor',
  };

  const { result, isError } = await securedToolExecution(name, args, auth, {
    requestPath: '/a2a/tasks',
    requestMethod: 'POST',
  });

  if (isError) {
    throw new Error(typeof result === 'string' ? result : JSON.stringify(result));
  }
  return result;
}

// ── HTTP Server ──────────────────────────────────────────────────────────────

const httpServer = http.createServer(async (req, res) => {
  // CORS headers (extended for OAuth 2.1)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-api-key, Mcp-Session-Id, DPoP'
  );
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, WWW-Authenticate');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url?.split('?')[0];
  const clientIP = getClientIP(req);

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC ENDPOINTS (no authentication required)
  // ═══════════════════════════════════════════════════════════════════════════

  // Health check (unauthenticated for Railway)
  if (url === '/health') {
    const oauthStats = oauth.getStats();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'healthy',
        service: SERVICE_NAME,
        version: SERVICE_VERSION,
        uptime: process.uptime(),
        sessions: transports.size,
        tools: tools.length + PluginManager.getTools().length,
        security: {
          oauth21: true,
          tripleGate: true,
          auditLogging: true,
          euAiActCompliance: true,
          registeredClients: oauthStats.registeredClients,
          activeTokens: oauthStats.activeAccessTokens,
        },
      })
    );
    return;
  }

  // Extended health check with render capabilities
  if (url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptime: process.uptime(),
      capabilities: ['render', 'share', 'mcp', 'oauth21', 'audit'],
      render_url: process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : `http://localhost:${PORT}`,
    }));
    return;
  }

  // Prometheus metrics endpoint (v5.6 Observable Platform)
  if (url === '/metrics') {
    const { handleMetricsRequest } = await import('./health-check');
    handleMetricsRequest(req, res);
    return;
  }

  // .well-known/mcp discovery endpoint (MCP specification)
  if (url === '/.well-known/mcp' || url === '/.well-known/mcp.json') {
    const allTools = [...tools, ...PluginManager.getTools()];
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${PORT}`;

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(JSON.stringify({
      mcpVersion: '2025-03-26',
      name: SERVICE_NAME,
      version: SERVICE_VERSION,
      description: 'HoloScript language tooling — parse, validate, compile, and render .hs/.hsplus/.holo compositions across 27 backend targets.',
      transport: {
        type: 'streamable-http',
        url: `${baseUrl}/mcp`,
        authentication: {
          type: 'oauth2',
          flows: ['authorization_code', 'client_credentials'],
          authorizationEndpoint: `${baseUrl}/oauth/authorize`,
          tokenEndpoint: `${baseUrl}/oauth/token`,
          registrationEndpoint: `${baseUrl}/oauth/register`,
          introspectionEndpoint: `${baseUrl}/oauth/introspect`,
          scopes: Object.keys(OAUTH2_SCOPES),
          legacyScopes: Object.keys(SCOPE_CATEGORIES),
          legacyBearerSupported: true,
        },
      },
      capabilities: {
        tools: { count: allTools.length },
        resources: false,
        prompts: false,
      },
      tools: allTools.map(t => ({
        name: t.name,
        description: t.description,
      })),
      endpoints: {
        mcp: `${baseUrl}/mcp`,
        health: `${baseUrl}/health`,
        render: `${baseUrl}/api/render`,
        share: `${baseUrl}/api/share`,
        a2a: `${baseUrl}/a2a`,
        agentCard: `${baseUrl}/.well-known/agent-card.json`,
        oauth: {
          openidConfiguration: `${baseUrl}/.well-known/openid-configuration`,
          authorize: `${baseUrl}/oauth/authorize`,
          token: `${baseUrl}/oauth/token`,
          register: `${baseUrl}/oauth/register`,
          revoke: `${baseUrl}/oauth/revoke`,
          introspect: `${baseUrl}/oauth/introspect`,
        },
        audit: `${baseUrl}/api/audit`,
      },
      contact: {
        repository: 'https://github.com/buildwithholoscript/HoloScript',
      },
    }));
    return;
  }

  // OpenID Configuration / OAuth Authorization Server Metadata (RFC 8414)
  if (url === '/.well-known/openid-configuration' || url === '/.well-known/oauth-authorization-server') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(JSON.stringify(oauth.getOpenIDConfiguration(), null, 2));
    return;
  }

  // GET /.well-known/agent-card.json / agent.json — A2A Agent Card discovery
  if ((url === '/.well-known/agent-card.json' || url === '/.well-known/agent-card' || url === '/.well-known/agent.json') && req.method === 'GET') {
    const allTools = [...tools, ...PluginManager.getTools()];
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${PORT}`;

    const card = buildAgentCard(allTools, baseUrl, !!MCP_API_KEY);
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(JSON.stringify(card, null, 2));
    return;
  }

  // GET /a2a — A2A protocol info / discovery redirect
  if (url === '/a2a' && req.method === 'GET') {
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `http://localhost:${PORT}`;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      protocol: 'a2a',
      version: '1.0.0',
      transport: 'json-rpc-2.0',
      agentCard: `${baseUrl}/.well-known/agent-card.json`,
      endpoints: {
        jsonrpc: `${baseUrl}/a2a`,
        tasks: `${baseUrl}/a2a/tasks`,
        agentCard: `${baseUrl}/.well-known/agent-card.json`,
      },
      methods: [
        'a2a.sendMessage',
        'a2a.getTask',
        'a2a.listTasks',
        'a2a.cancelTask',
        'a2a.getExtendedAgentCard',
      ],
      description: 'HoloScript A2A (Agent-to-Agent) protocol endpoint. ' +
        'POST JSON-RPC 2.0 requests to this URL, or use the REST endpoints under /a2a/tasks. ' +
        'See agent card for full capabilities.',
    }, null, 2));
    return;
  }

  // POST /a2a — A2A JSON-RPC 2.0 transport (per A2A specification)
  if (url === '/a2a' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);

      // Validate JSON-RPC 2.0 envelope
      const parsed = parseJsonRpcRequest(body);
      if ('error' in parsed) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(parsed.error));
        return;
      }

      // Build agent card builder for a2a.getExtendedAgentCard
      const agentCardBuilder = (): AgentCard => {
        const allTools = [...tools, ...PluginManager.getTools()];
        const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
          ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
          : `http://localhost:${PORT}`;
        return buildAgentCard(allTools, baseUrl, !!MCP_API_KEY);
      };

      // Handle the JSON-RPC request
      const response = await handleJsonRpcRequest(
        parsed.request,
        handleToolForA2A,
        agentCardBuilder,
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response, null, 2));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // JSON-RPC spec: parse errors return -32700
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${message}`,
        },
      }));
    }
    return;
  }

  // Scene serving (public, read-only)
  const sceneMatch = url?.match(/^\/scene\/([a-f0-9]{8})$/);
  if (sceneMatch && req.method === 'GET') {
    const scene = getScene(sceneMatch[1]);
    if (!scene) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Scene not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(generateBrowserTemplate(scene.code, scene.title));
    return;
  }

  const embedMatch = url?.match(/^\/embed\/([a-f0-9]{8})$/);
  if (embedMatch && req.method === 'GET') {
    const scene = getScene(embedMatch[1]);
    if (!scene) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Scene not found' }));
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL',
    });
    res.end(generateBrowserTemplate(scene.code, scene.title));
    return;
  }

  const apiSceneMatch = url?.match(/^\/api\/scene\/([a-f0-9]{8})$/);
  if (apiSceneMatch && req.method === 'GET') {
    const scene = getScene(apiSceneMatch[1]);
    if (!scene) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Scene not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(scene));
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OAUTH 2.1 ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /oauth/register — Dynamic client registration (dual-register to both providers)
  if (url === '/oauth/register' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const clientName = (body.client_name as string) || 'unnamed-client';
      const redirectUris = (body.redirect_uris as string[]) || [];
      const scopes = (body.scope as string)?.split(' ') || ['tools:read'];
      const clientType = (body.token_endpoint_auth_method === 'none' ? 'public' : 'confidential') as 'confidential' | 'public';
      const rateLimit = (body.rate_limit as number) || 60;

      // Register with legacy provider (backwards compat)
      const { clientId, clientSecret } = oauth.registerClient({
        clientName, redirectUris, scopes, clientType, rateLimit,
      });

      // Also register with the new OAuth2Provider (token-store backed)
      await oauth2.registerClient({
        clientName, redirectUris, scopes, clientType, rateLimit,
      }).catch(() => { /* non-fatal: new provider registration is additive */ });

      auditLog.logAuthEvent({
        event: 'client_registered',
        clientId,
        ip: clientIP,
      });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        client_name: body.client_name,
        token_endpoint_auth_method: 'client_secret_post',
        grant_types: ['authorization_code', 'client_credentials', 'refresh_token'],
        scope: (body.scope as string) || 'tools:read',
        scopes_supported: Object.keys(OAUTH2_SCOPES),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_client_metadata', error_description: message }));
    }
    return;
  }

  // GET /oauth/authorize — Authorization request (returns consent info / validates params)
  if (url?.startsWith('/oauth/authorize') && req.method === 'GET') {
    try {
      const queryString = req.url?.split('?')[1] || '';
      const params = new URLSearchParams(queryString);
      const result = await oauth2.handleAuthorizeGet(params);

      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.body, null, 2));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_request', error_description: message }));
    }
    return;
  }

  // POST /oauth/authorize — Authorization code (with PKCE)
  if (url === '/oauth/authorize' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const code = oauth.createAuthorizationCode({
        clientId: body.client_id as string,
        redirectUri: body.redirect_uri as string,
        scopes: ((body.scope as string) || '').split(' ').filter(Boolean),
        codeChallenge: body.code_challenge as string,
        codeChallengeMethod: 'S256',
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        code,
        state: body.state || undefined,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_request', error_description: message }));
    }
    return;
  }

  // POST /oauth/token — Token exchange
  if (url === '/oauth/token' && req.method === 'POST') {
    const rl = getRateLimit(clientIP);
    setRateLimitHeaders(res, rl);

    if (rl.remaining <= 0) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) });
      res.end(JSON.stringify({ error: 'rate_limit_exceeded', error_description: 'Too many token requests. Try again later.' }));
      return;
    }

    try {
      const body = await parseJsonBody(req);
      const grantType = body.grant_type as string;
      const dpopHeader = req.headers['dpop'] as string | undefined;

      let tokenResponse;

      switch (grantType) {
        case 'authorization_code':
          tokenResponse = oauth.exchangeAuthorizationCode({
            code: body.code as string,
            clientId: body.client_id as string,
            clientSecret: body.client_secret as string,
            redirectUri: body.redirect_uri as string,
            codeVerifier: body.code_verifier as string,
            agentId: body.agent_id as string | undefined,
            dpopThumbprint: dpopHeader,
          });
          break;

        case 'client_credentials':
          tokenResponse = oauth.exchangeClientCredentials({
            clientId: body.client_id as string,
            clientSecret: body.client_secret as string,
            scopes: ((body.scope as string) || '').split(' ').filter(Boolean),
            agentId: body.agent_id as string | undefined,
            dpopThumbprint: dpopHeader,
          });
          break;

        case 'refresh_token':
          tokenResponse = oauth.refreshAccessToken({
            refreshToken: body.refresh_token as string,
            clientId: body.client_id as string,
            clientSecret: body.client_secret as string,
            dpopThumbprint: dpopHeader,
          });
          break;

        default:
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'unsupported_grant_type',
            error_description: `Grant type "${grantType}" is not supported. Use authorization_code, client_credentials, or refresh_token.`,
          }));
          return;
      }

      auditLog.logAuthEvent({
        event: 'token_issued',
        clientId: body.client_id as string,
        ip: clientIP,
      });

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
      });
      res.end(JSON.stringify(tokenResponse));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      auditLog.logAuthEvent({
        event: 'auth_failure',
        ip: clientIP,
        reason: message,
      });

      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_grant', error_description: message }));
    }
    return;
  }

  // POST /oauth/revoke — Token revocation
  if (url === '/oauth/revoke' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const token = body.token as string;
      const revoked = oauth.revokeToken(token);

      if (revoked) {
        auditLog.logAuthEvent({
          event: 'token_revoked',
          ip: clientIP,
        });
      }

      // RFC 7009: Always return 200, even if token was not found
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ revoked }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_request', error_description: message }));
    }
    return;
  }

  // POST /oauth/introspect — Token introspection
  if (url === '/oauth/introspect' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const token = body.token as string;
      const result = oauth.introspect(token);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        active: result.active,
        client_id: result.clientId,
        scope: result.scopes?.join(' '),
        agent_id: result.agentId,
        exp: result.expiresAt ? Math.floor(result.expiresAt / 1000) : undefined,
        iat: result.issuedAt ? Math.floor(result.issuedAt / 1000) : undefined,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_request', error_description: message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHENTICATED ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  // MCP Streamable HTTP endpoint
  if (url === '/mcp') {
    const auth = authenticateRequest(req);
    if (!auth.active) {
      auditLog.logAuthEvent({
        event: 'auth_failure',
        ip: clientIP,
        reason: 'MCP endpoint - invalid credentials',
      });

      res.writeHead(401, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="holoscript-mcp", error="invalid_token"',
      });
      res.end(JSON.stringify({
        error: 'Unauthorized',
        message: 'Valid OAuth 2.1 token or API key required',
        token_endpoint: '/oauth/token',
        registration_endpoint: '/oauth/register',
      }));
      return;
    }

    auditLog.logAuthEvent({
      event: 'auth_success',
      clientId: auth.clientId,
      agentId: auth.agentId,
      ip: clientIP,
    });

    // Surface auth mode so agents know when they're unauthenticated
    if (auth.agentId === 'open-dev-mode') {
      res.setHeader('X-Auth-Mode', 'permissive-open');
    } else if (!auth.clientId) {
      res.setHeader('X-Auth-Mode', 'legacy-key');
    } else {
      res.setHeader('X-Auth-Mode', 'oauth2');
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // POST without session ID = create a new session transport
    if (req.method === 'POST' && !sessionId) {
      const transport = await createAndStoreSessionTransport(undefined, auth);
      console.log(`[MCP] New session: ${transport.sessionId!} (client: ${auth.clientId || 'legacy'})`);
      await transport.handleRequest(req, res);
      return;
    }

    // Requests with session ID = existing session
    if (sessionId) {
      let transport = transports.get(sessionId);
      if (!transport && req.method === 'POST') {
        const body = await parseJsonBody(req);
        const method = typeof body.method === 'string' ? body.method : '';

        if (method === 'notifications/initialized') {
          res.writeHead(202);
          res.end();
          return;
        }

        if (method === 'tools/list') {
          const id = (body.id as string | number | null | undefined) ?? null;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                tools: [...tools, ...PluginManager.getTools()],
              },
            })
          );
          return;
        }

        if (method === 'tools/call') {
          const id = (body.id as string | number | null | undefined) ?? null;
          const params = (body.params as Record<string, unknown>) || {};
          const name = params.name as string;
          const args = (params.arguments as Record<string, unknown>) || {};

          // Use session auth context
          const sessionAuth_ = sessionAuth.get(sessionId) || auth;

          const { result, isError } = await securedToolExecution(name, args, sessionAuth_, {
            sessionId,
            requestPath: '/mcp',
            requestMethod: 'POST',
            ip: clientIP,
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                  },
                ],
                ...(isError ? { isError: true } : {}),
              },
            })
          );
          return;
        }
      }
      if (transport) {
        await transport.handleRequest(req, res);
        if (req.method === 'DELETE') {
          transports.delete(sessionId);
          sessionAuth.delete(sessionId);
          console.log(`[MCP] Session removed: ${sessionId}`);
        }
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found', sessionId }));
      return;
    }

    // Invalid request
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Bad Request - Missing Mcp-Session-Id header or invalid initialization',
      })
    );
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // A2A TASK ENDPOINTS (authenticated)
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /a2a/tasks — Send/create a task (A2A tasks/send)
  if (url === '/a2a/tasks' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);

      const message: TaskMessage = (body.message as TaskMessage) || {
        role: 'user',
        parts: [{ type: 'text', text: JSON.stringify(body) }],
        timestamp: new Date().toISOString(),
      };

      const request: SendTaskRequest = {
        id: body.id as string | undefined,
        sessionId: body.sessionId as string | undefined,
        contextId: body.contextId as string | undefined,
        message,
        skillId: body.skillId as string | undefined,
        arguments: body.arguments as Record<string, unknown> | undefined,
        metadata: {
          ...(body.metadata as Record<string, unknown> || {}),
          ...(body.skillId ? { skillId: body.skillId } : {}),
          ...(body.arguments ? { arguments: body.arguments } : {}),
        },
      };

      const task = createTask(request);
      const executed = await executeTask(task, handleToolForA2A);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(taskToResponse(executed), null, 2));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  // GET /a2a/tasks — List tasks
  if (url === '/a2a/tasks' && req.method === 'GET') {
    const queryString = req.url?.split('?')[1] || '';
    const params = new URLSearchParams(queryString);
    const filters: {
      sessionId?: string;
      contextId?: string;
      state?: TaskState;
      limit?: number;
      offset?: number;
    } = {};

    if (params.get('sessionId')) filters.sessionId = params.get('sessionId')!;
    if (params.get('contextId')) filters.contextId = params.get('contextId')!;
    if (params.get('state')) filters.state = params.get('state') as TaskState;
    if (params.get('limit')) filters.limit = parseInt(params.get('limit')!, 10);
    if (params.get('offset')) filters.offset = parseInt(params.get('offset')!, 10);

    const result = listTasks(filters);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      tasks: result.tasks.map(taskToResponse),
      total: result.total,
    }, null, 2));
    return;
  }

  // GET /a2a/tasks/:id — Get a specific task
  const taskGetMatch = url?.match(/^\/a2a\/tasks\/([a-f0-9-]+)$/);
  if (taskGetMatch && req.method === 'GET') {
    const task = getTask(taskGetMatch[1]);
    if (!task) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Task not found', id: taskGetMatch[1] }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(taskToResponse(task), null, 2));
    return;
  }

  // DELETE /a2a/tasks/:id — Cancel a task
  const taskDeleteMatch = url?.match(/^\/a2a\/tasks\/([a-f0-9-]+)$/);
  if (taskDeleteMatch && req.method === 'DELETE') {
    const task = cancelTask(taskDeleteMatch[1]);
    if (!task) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Task not found', id: taskDeleteMatch[1] }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(taskToResponse(task), null, 2));
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REST API ENDPOINTS (public creation, authenticated where noted)
  // ═══════════════════════════════════════════════════════════════════════════

  // POST /api/render — render HoloScript to preview
  if (url === '/api/render' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.code || typeof body.code !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required field: code (string)' }));
        return;
      }
      const result = await renderPreview({
        code: body.code as string,
        format: (body.format as 'png' | 'gif' | 'mp4' | 'webp') || 'png',
        resolution: (body.resolution as number[]) || [800, 600],
        camera: body.camera as { position?: number[]; target?: number[] },
        duration: (body.duration as number) || 3000,
        quality: (body.quality as 'draft' | 'preview' | 'production') || 'preview',
        skipRemote: true,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  // POST /api/share — create share links for X/social platforms
  if (url === '/api/share' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.code || typeof body.code !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required field: code (string)' }));
        return;
      }
      const result = await createShareLink({
        code: body.code as string,
        title: (body.title as string) || 'HoloScript Scene',
        description: (body.description as string) || 'Interactive 3D scene built with HoloScript',
        platform: (body.platform as 'x' | 'generic' | 'codesandbox' | 'stackblitz') || 'x',
        skipRemote: true,
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  // POST /api/scene — store a scene and get short URL
  if (url === '/api/scene' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      if (!body.code || typeof body.code !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required field: code (string)' }));
        return;
      }
      const scene = storeScene(
        body.code as string,
        (body.title as string) || undefined,
        (body.description as string) || undefined,
      );
      const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : `http://localhost:${PORT}`;
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: scene.id,
        url: `${baseUrl}/scene/${scene.id}`,
        embed: `${baseUrl}/embed/${scene.id}`,
        api: `${baseUrl}/api/scene/${scene.id}`,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUDIT LOG ENDPOINT (EU AI Act Art. 13: Transparency)
  // ═══════════════════════════════════════════════════════════════════════════

  if (url === '/api/audit' && req.method === 'GET') {
    // Audit logs require authentication
    const auth = authenticateRequest(req);
    if (!auth.active) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Authentication required for audit access' }));
      return;
    }

    // Only admin scope can view audit logs
    if (!auth.scopes?.includes('admin:*') && !auth.scopes?.includes('tools:admin')) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Insufficient scope. Requires admin:* or tools:admin' }));
      return;
    }

    const queryString = req.url?.split('?')[1] || '';
    const params = new URLSearchParams(queryString);

    const result = auditLog.query({
      event: params.get('event') as any || undefined,
      clientId: params.get('clientId') || undefined,
      toolName: params.get('toolName') || undefined,
      status: params.get('status') as any || undefined,
      riskLevel: params.get('riskLevel') as any || undefined,
      since: params.get('since') || undefined,
      until: params.get('until') || undefined,
      limit: params.get('limit') ? parseInt(params.get('limit')!, 10) : 100,
      offset: params.get('offset') ? parseInt(params.get('offset')!, 10) : 0,
      humanReviewOnly: params.get('humanReviewOnly') === 'true',
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result, null, 2));
    return;
  }

  // GET /api/audit/compliance — EU AI Act compliance summary
  if (url === '/api/audit/compliance' && req.method === 'GET') {
    const auth = authenticateRequest(req);
    if (!auth.active || (!auth.scopes?.includes('admin:*') && !auth.scopes?.includes('tools:admin'))) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Authentication required with admin scope' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(auditLog.getComplianceStats(), null, 2));
    return;
  }

  // GET /api/audit/export — Export audit logs (EU AI Act Art. 13)
  if (url === '/api/audit/export' && req.method === 'GET') {
    const auth = authenticateRequest(req);
    if (!auth.active || (!auth.scopes?.includes('admin:*') && !auth.scopes?.includes('tools:admin'))) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Authentication required with admin scope' }));
      return;
    }

    const queryString = req.url?.split('?')[1] || '';
    const params = new URLSearchParams(queryString);
    const format = (params.get('format') || 'json') as 'json' | 'jsonl';

    const contentType = format === 'jsonl' ? 'application/x-ndjson' : 'application/json';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="holoscript-audit-${new Date().toISOString().split('T')[0]}.${format}"`,
    });
    res.end(auditLog.export(format));
    return;
  }

  // Root URL — redirect to discovery endpoint
  if (url === '/' && req.method === 'GET') {
    res.writeHead(302, { 'Location': '/.well-known/mcp' });
    res.end();
    return;
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

// ── Start Server ─────────────────────────────────────────────────────────────

httpServer.listen(PORT, '0.0.0.0', () => {
  const migrationMode = process.env.OAUTH_MIGRATION_MODE || 'permissive';
  console.log(`\u{1F680} ${SERVICE_NAME} v${SERVICE_VERSION}`);
  console.log(`   Transport: Streamable HTTP (MCP spec 2025-03-26)`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Auth: OAuth 2.1 (migration: ${migrationMode})`);
  console.log(`   Token TTL: access=${oauth2.getStore().ttl.accessTokenTTL}s, refresh=${oauth2.getStore().ttl.refreshTokenTTL}s`);
  console.log(`   Scopes: ${Object.keys(OAUTH2_SCOPES).join(', ')}`);
  console.log(`   Legacy API Key: ${MCP_API_KEY ? 'configured' : 'NONE (open dev mode)'}`);
  console.log(`   Security: Triple-gate (prompt \u2192 scope \u2192 policy)`);
  console.log(`   Token Store: ${oauth2.getStore().backend.constructor.name}`);
  console.log(`   Audit: EU AI Act compliant (Articles 12-14)`);
  console.log(`   Tools: ${tools.length} core + ${PluginManager.getTools().length} plugins`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /health                       - Health check (public)`);
  console.log(`     GET  /.well-known/mcp              - MCP discovery (public)`);
  console.log(`     GET  /.well-known/openid-configuration - OAuth 2.1 discovery (public)`);
  console.log(`     GET  /.well-known/agent-card.json  - A2A Agent Card (public)`);
  console.log(`     POST /oauth/register               - Client registration`);
  console.log(`     GET  /oauth/authorize               - Authorization request (PKCE)`);
  console.log(`     POST /oauth/authorize              - Authorization code (PKCE)`);
  console.log(`     POST /oauth/token                  - Token exchange`);
  console.log(`     POST /oauth/revoke                 - Token revocation`);
  console.log(`     POST /oauth/introspect             - Token introspection (RFC 7662)`);
  console.log(`     POST /mcp                          - MCP Streamable HTTP (authenticated)`);
  console.log(`     GET  /mcp                          - MCP session messages (authenticated)`);
  console.log(`     DELETE /mcp                        - Close session (authenticated)`);
  console.log(`     GET  /a2a                          - A2A protocol info (public)`);
  console.log(`     POST /a2a                          - A2A JSON-RPC 2.0 transport`);
  console.log(`     POST /a2a/tasks                    - A2A send task (REST fallback)`);
  console.log(`     GET  /a2a/tasks                    - A2A list tasks`);
  console.log(`     GET  /a2a/tasks/:id                - A2A get task`);
  console.log(`     DELETE /a2a/tasks/:id              - A2A cancel task`);
  console.log(`     GET  /api/health                   - API health + capabilities (public)`);
  console.log(`     POST /api/render                   - Render HoloScript preview`);
  console.log(`     POST /api/share                    - Create share links`);
  console.log(`     POST /api/scene                    - Store scene, get short URL`);
  console.log(`     GET  /scene/:id                    - View stored scene (public)`);
  console.log(`     GET  /embed/:id                    - Embed stored scene (public)`);
  console.log(`     GET  /api/audit                    - Query audit log (admin)`);
  console.log(`     GET  /api/audit/compliance         - EU AI Act compliance report (admin)`);
  console.log(`     GET  /api/audit/export             - Export audit log (admin)`);
});

// Graceful shutdown
function shutdown(signal: string) {
  console.log(`${signal} received, closing server...`);
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  // Force exit after 10s if connections don't drain
  setTimeout(() => {
    console.warn('Forcing exit after 10s timeout');
    process.exit(1);
  }, 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
