#!/usr/bin/env node

/**
 * AAIF MCP Dev Summit 2026 -- HoloScript Triple-Protocol Demo
 *
 * Self-contained runnable demo that simulates all 5 acts of the summit presentation
 * against a local mock server. Use for rehearsal, offline mode, or when
 * mcp.holoscript.net is unreachable.
 *
 * Usage:
 *   node docs/demos/aaif-summit-demo.mjs            # Run all acts + start server
 *   node docs/demos/aaif-summit-demo.mjs --act 1    # Run only Act 1
 *   node docs/demos/aaif-summit-demo.mjs --server    # Start mock server only (port 4200)
 *   node docs/demos/aaif-summit-demo.mjs --dry-run   # Print expected outputs without server
 *
 * @version 1.0.0
 * @see docs/demos/aaif-summit-2026.md for the full talk track
 */

import { createServer } from 'http';
import { createHash, randomUUID } from 'crypto';

// =============================================================================
// CONFIGURATION
// =============================================================================

const PORT = parseInt(process.env.DEMO_PORT || '4200', 10);
const BASE_URL = `http://localhost:${PORT}`;
const API_KEY = 'demo-api-key-aaif-2026';

// =============================================================================
// MOCK DATA
// =============================================================================

/** Simulated MCP tools (subset representing the 82+ real tools) */
const MOCK_TOOLS = [
  { name: 'parse_hs', description: 'Parse HoloScript (.hs) code into an AST', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'parse_holo', description: 'Parse HoloScript (.holo) composition files', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'validate_holoscript', description: 'Validate HoloScript code for errors', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'compile_holoscript', description: 'Compile HoloScript to any of 28+ targets', inputSchema: { type: 'object', properties: { code: { type: 'string' }, target: { type: 'string' } }, required: ['code', 'target'] } },
  { name: 'suggest_traits', description: 'AI-suggest VR traits for an object', inputSchema: { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] } },
  { name: 'generate_scene', description: 'Generate HoloScript from natural language', inputSchema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } },
  { name: 'render_preview', description: 'Render a 3D preview of a HoloScript scene', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'generate_3d_object', description: 'Generate a 3D object from text description', inputSchema: { type: 'object', properties: { description: { type: 'string' }, tier: { type: 'string' } }, required: ['description'] } },
  { name: 'holo_absorb_repo', description: 'Scan repository for codebase intelligence', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'holo_ask_codebase', description: 'Ask questions about absorbed codebase', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'holo_self_diagnose', description: 'Run autonomous self-diagnostic pipeline', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_traits', description: 'List all 1800+ semantic VR traits', inputSchema: { type: 'object', properties: {} } },
  { name: 'explain_trait', description: 'Explain a specific VR trait', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'holo_parse_to_graph', description: 'Parse HoloScript to dependency graph', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'holo_semantic_search', description: 'Semantic search over codebase', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'compile_to_unity', description: 'Compile to Unity C# format', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'compile_to_unreal', description: 'Compile to Unreal C++ format', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'compile_to_webgpu', description: 'Compile to WebGPU WGSL shaders', inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] } },
  { name: 'browser_launch', description: 'Launch headless browser for preview', inputSchema: { type: 'object', properties: {} } },
  { name: 'browser_screenshot', description: 'Take a screenshot of the current page', inputSchema: { type: 'object', properties: {} } },
];

// Pad to 82 skills with generated stubs
while (MOCK_TOOLS.length < 82) {
  const i = MOCK_TOOLS.length;
  MOCK_TOOLS.push({
    name: `holo_tool_${i}`,
    description: `HoloScript tool #${i}`,
    inputSchema: { type: 'object', properties: {} },
  });
}

/** Derive skill tags (simplified version of real deriveSkillTags) */
function deriveSkillTags(name) {
  const tags = ['holoscript'];
  if (name.startsWith('parse_') || name === 'validate_holoscript') tags.push('parsing', 'validation', 'language');
  else if (name.includes('trait')) tags.push('traits', 'spatial', 'vr');
  else if (name.startsWith('generate_') || name === 'generate_scene') tags.push('generation', 'ai', 'codegen');
  else if (name.startsWith('compile_')) tags.push('compilation', 'export', 'multi-target');
  else if (name.startsWith('holo_absorb') || name.startsWith('holo_query') || name.startsWith('holo_ask')) tags.push('codebase', 'analysis', 'intelligence');
  else if (name.startsWith('holo_self')) tags.push('quality', 'self-improvement', 'testing');
  else if (name.startsWith('browser_')) tags.push('browser', 'preview', 'rendering');
  else tags.push('utility');
  return tags;
}

/** Convert tool to A2A skill */
function toolToSkill(tool) {
  return {
    id: tool.name,
    name: tool.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    description: tool.description,
    tags: deriveSkillTags(tool.name),
    examples: [],
    inputModes: ['text/plain', 'application/json'],
    outputModes: ['text/plain', 'application/json', 'application/holoscript'],
    inputSchema: tool.inputSchema,
    outputSchema: { type: 'object', properties: { content: { type: 'array' } } },
  };
}

// =============================================================================
// AGENT CARD
// =============================================================================

function buildAgentCard() {
  return {
    id: 'holoscript-agent',
    name: 'HoloScript Agent',
    description: 'HoloScript language tooling agent -- parse, validate, compile, render, and generate spatial computing code across 28+ export targets.',
    endpoint: `${BASE_URL}/a2a`,
    version: '1.0.0',
    documentationUrl: 'https://github.com/buildwithholoscript/HoloScript',
    provider: { organization: 'HoloScript', url: 'https://holoscript.net' },
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: true },
    securitySchemes: {
      apiKey: { type: 'apiKey', description: 'API key passed via x-api-key header', name: 'x-api-key', in: 'header' },
      bearerAuth: { type: 'http', description: 'Bearer token via Authorization header', scheme: 'bearer' },
      oauth2: {
        type: 'oauth2',
        description: 'OAuth 2.1 with PKCE (S256) and client credentials flows',
        flows: {
          authorizationCode: {
            authorizationUrl: `${BASE_URL}/oauth/authorize`,
            tokenUrl: `${BASE_URL}/oauth/token`,
            scopes: {
              'tools:read': 'Read-only access to tool outputs (parse, validate, list, explain)',
              'tools:execute': 'Execute tools that produce output (compile, render, generate)',
              'tasks:read': 'Read A2A task state and history',
              'tasks:write': 'Create, send, and cancel A2A tasks',
              'admin': 'Full administrative access to all tools and endpoints',
            },
          },
          clientCredentials: {
            tokenUrl: `${BASE_URL}/oauth/token`,
            scopes: {
              'tools:read': 'Read-only access to tool outputs',
              'tools:execute': 'Execute tools that produce output',
              'tasks:read': 'Read A2A task state and history',
              'tasks:write': 'Create, send, and cancel A2A tasks',
            },
          },
        },
      },
      openIdConnect: {
        type: 'openIdConnect',
        description: 'OpenID Connect discovery for OAuth 2.1',
        openIdConnectUrl: `${BASE_URL}/.well-known/openid-configuration`,
      },
    },
    security: [{ apiKey: [] }, { bearerAuth: [] }, { oauth2: ['tools:read'] }],
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json', 'application/holoscript'],
    skills: MOCK_TOOLS.map(toolToSkill),
  };
}

// =============================================================================
// TASK STORE
// =============================================================================

const taskStore = new Map();

function createTask(params) {
  const now = new Date().toISOString();
  const task = {
    id: params.id || randomUUID(),
    sessionId: params.sessionId || null,
    contextId: params.contextId || null,
    status: { state: 'submitted', timestamp: now },
    history: [params.message],
    artifacts: [],
    metadata: params.metadata || {},
    createdAt: now,
    updatedAt: now,
  };
  taskStore.set(task.id, task);
  return task;
}

/** Simulate tool execution */
function executeTool(skillId, args) {
  switch (skillId) {
    case 'parse_hs': {
      const code = args.code || '';
      return JSON.stringify({
        type: 'composition',
        objects: [{
          name: code.match(/object\s+(\w+)/)?.[1] || 'Unknown',
          properties: { position: [0, 1, 0], color: '#ff0000' },
          traits: [],
        }],
        metadata: { parser: 'holoscript-v5', parseTimeMs: 1.2 },
      }, null, 2);
    }
    case 'compile_holoscript': {
      const target = args.target || 'threejs';
      return JSON.stringify({
        target,
        success: true,
        output: `// Compiled to ${target}\n// ${args.code || ''}\nexport function createScene(renderer) {\n  const cube = new THREE.Mesh(\n    new THREE.BoxGeometry(1, 1, 1),\n    new THREE.MeshStandardMaterial({ color: 0xff0000 })\n  );\n  cube.position.set(0, 1, 0);\n  return cube;\n}`,
        stats: { lines: 8, compileTimeMs: 4.7, target },
      }, null, 2);
    }
    case 'generate_3d_object': {
      if (args.tier === 'premium') {
        return JSON.stringify({
          error: 'payment_required',
          x402: {
            x402Version: 1,
            accepts: [{
              scheme: 'exact',
              network: 'base',
              maxAmountRequired: '50000',
              resource: '/api/generate-3d/premium',
              description: 'Premium 3D model generation (high-poly, PBR textures)',
              payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
              asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              maxTimeoutSeconds: 60,
            }],
            error: 'X-PAYMENT header is required',
          },
        }, null, 2);
      }
      return JSON.stringify({ modelUrl: 'https://cdn.holoscript.net/models/sword_abc123.glb', vertices: 12400, textures: ['diffuse', 'normal', 'roughness'] }, null, 2);
    }
    case 'holo_self_diagnose':
      return JSON.stringify({ error: 'insufficient_scope', required: 'admin', message: 'Self-diagnostic requires admin scope' }, null, 2);
    default:
      return JSON.stringify({ result: `Executed ${skillId} successfully`, args }, null, 2);
  }
}

function executeTask(task, skillId, args) {
  const now = () => new Date().toISOString();
  task.status = { state: 'working', timestamp: now() };
  task.updatedAt = now();

  try {
    const result = executeTool(skillId, args);
    const artifact = {
      id: randomUUID(),
      name: `${skillId}_result`,
      description: `Output from ${skillId}`,
      parts: [{ type: 'text', text: result, mimeType: 'application/json' }],
      index: 0,
      mediaType: 'application/json',
    };
    task.artifacts.push(artifact);

    const agentMsg = { role: 'agent', parts: [{ type: 'text', text: result }], timestamp: now() };
    task.history.push(agentMsg);
    task.status = { state: 'completed', message: agentMsg, timestamp: now() };
    task.updatedAt = now();
  } catch (err) {
    const agentMsg = { role: 'agent', parts: [{ type: 'text', text: `Error: ${err.message}` }], timestamp: now() };
    task.history.push(agentMsg);
    task.status = { state: 'failed', message: agentMsg, timestamp: now() };
    task.updatedAt = now();
  }
  return task;
}

// =============================================================================
// OAUTH 2.1 MOCK STORE
// =============================================================================

const clients = new Map();
const authCodes = new Map();
const accessTokens = new Map();
const refreshTokens = new Map();

function registerClient(params) {
  const clientId = `client_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const clientSecret = `sec_${randomUUID().replace(/-/g, '')}`;
  const secretHash = createHash('sha256').update(clientSecret).digest('hex');
  clients.set(clientId, {
    clientId,
    clientSecretHash: secretHash,
    clientName: params.clientName,
    redirectUris: params.redirectUris,
    scopes: params.scopes,
    clientType: params.clientType || 'confidential',
    createdAt: Date.now(),
  });
  return { clientId, clientSecret };
}

function createAuthCode(clientId, redirectUri, scopes, codeChallenge) {
  const code = `authcode_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
  authCodes.set(code, {
    code,
    clientId,
    redirectUri,
    scopes,
    codeChallenge,
    codeChallengeMethod: 'S256',
    expiresAt: Date.now() + 300_000,
    used: false,
  });
  return code;
}

function issueTokens(clientId, scopes) {
  const accessToken = `at_${randomUUID().replace(/-/g, '')}`;
  const refreshToken = `rt_${randomUUID().replace(/-/g, '')}`;
  accessTokens.set(accessToken, {
    token: accessToken,
    clientId,
    scopes,
    expiresAt: Date.now() + 3600_000,
    issuedAt: Date.now(),
  });
  refreshTokens.set(refreshToken, {
    token: refreshToken,
    clientId,
    scopes,
    expiresAt: Date.now() + 86400_000,
    chainId: randomUUID(),
    used: false,
  });
  return { accessToken, refreshToken };
}

function verifyS256(verifier, challenge) {
  const hash = createHash('sha256').update(verifier).digest('base64url');
  return hash === challenge;
}

// =============================================================================
// HTTP SERVER
// =============================================================================

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...headers });
  res.end(JSON.stringify(body, null, 2));
}

function handleRequest(req, res) {
  const url = new URL(req.url, BASE_URL);
  const path = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, X-PAYMENT',
    });
    return res.end();
  }

  // ── Health ──────────────────────────────────────────────────────────────
  if (path === '/health' && method === 'GET') {
    return sendJson(res, 200, {
      status: 'ok',
      tools: MOCK_TOOLS.length,
      uptime: process.uptime(),
      mode: 'demo-mock',
      version: '5.1.0',
    });
  }

  // ── Agent Card ──────────────────────────────────────────────────────────
  if (path === '/.well-known/agent-card.json' && method === 'GET') {
    return sendJson(res, 200, buildAgentCard());
  }

  // ── OpenID Configuration ───────────────────────────────────────────────
  if (path === '/.well-known/openid-configuration' && method === 'GET') {
    return sendJson(res, 200, {
      issuer: BASE_URL,
      authorization_endpoint: `${BASE_URL}/oauth/authorize`,
      token_endpoint: `${BASE_URL}/oauth/token`,
      revocation_endpoint: `${BASE_URL}/oauth/revoke`,
      introspection_endpoint: `${BASE_URL}/oauth/introspect`,
      registration_endpoint: `${BASE_URL}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: ['tools:read', 'tools:execute', 'tasks:read', 'tasks:write', 'admin'],
      service_documentation: 'https://holoscript.net/docs/mcp/oauth',
    });
  }

  // ── A2A JSON-RPC Endpoint ──────────────────────────────────────────────
  if (path === '/a2a' && method === 'POST') {
    return parseBody(req).then(body => {
      if (body.jsonrpc !== '2.0') {
        return sendJson(res, 200, {
          jsonrpc: '2.0', id: body.id || null,
          error: { code: -32600, message: 'Invalid JSON-RPC: missing jsonrpc "2.0"' },
        });
      }

      const { id, method: rpcMethod, params } = body;

      switch (rpcMethod) {
        case 'a2a.sendMessage': {
          if (!params?.message) {
            return sendJson(res, 200, {
              jsonrpc: '2.0', id,
              error: { code: -32602, message: 'Missing required parameter: message' },
            });
          }
          const msg = params.message;
          if (!msg.timestamp) msg.timestamp = new Date().toISOString();
          if (!msg.role) msg.role = 'user';

          const task = createTask({
            id: params.id,
            sessionId: params.sessionId,
            contextId: params.contextId,
            message: msg,
            metadata: {
              ...(params.metadata || {}),
              ...(params.skillId ? { skillId: params.skillId } : {}),
              ...(params.arguments ? { arguments: params.arguments } : {}),
            },
          });

          const skillId = params.skillId || task.metadata?.skillId;
          const args = params.arguments || task.metadata?.arguments || {};

          if (skillId) {
            executeTask(task, skillId, args);
          } else {
            task.status = {
              state: 'input-required',
              message: {
                role: 'agent',
                parts: [{ type: 'text', text: 'Please specify a skillId to invoke.' }],
                timestamp: new Date().toISOString(),
              },
              timestamp: new Date().toISOString(),
            };
          }

          return sendJson(res, 200, {
            jsonrpc: '2.0', id,
            result: {
              id: task.id,
              sessionId: task.sessionId,
              contextId: task.contextId,
              status: task.status,
              artifacts: task.artifacts,
              history: task.history,
            },
          });
        }

        case 'a2a.getTask': {
          const taskId = params?.id;
          if (!taskId) {
            return sendJson(res, 200, {
              jsonrpc: '2.0', id,
              error: { code: -32602, message: 'Missing required parameter: id' },
            });
          }
          const task = taskStore.get(taskId);
          if (!task) {
            return sendJson(res, 200, {
              jsonrpc: '2.0', id,
              error: { code: -32001, message: `Task not found: ${taskId}` },
            });
          }
          return sendJson(res, 200, {
            jsonrpc: '2.0', id,
            result: {
              id: task.id, sessionId: task.sessionId, contextId: task.contextId,
              status: task.status, artifacts: task.artifacts, history: task.history,
            },
          });
        }

        case 'a2a.listTasks': {
          let tasks = [...taskStore.values()];
          if (params?.state) tasks = tasks.filter(t => t.status.state === params.state);
          tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          const limit = params?.limit || 50;
          const offset = params?.offset || 0;
          return sendJson(res, 200, {
            jsonrpc: '2.0', id,
            result: {
              tasks: tasks.slice(offset, offset + limit).map(t => ({
                id: t.id, status: t.status, artifacts: t.artifacts, history: t.history,
              })),
              total: tasks.length,
            },
          });
        }

        case 'a2a.cancelTask': {
          const taskId = params?.id;
          const task = taskStore.get(taskId);
          if (!task) {
            return sendJson(res, 200, {
              jsonrpc: '2.0', id,
              error: { code: -32001, message: `Task not found: ${taskId}` },
            });
          }
          task.status = { state: 'canceled', timestamp: new Date().toISOString() };
          return sendJson(res, 200, {
            jsonrpc: '2.0', id,
            result: { id: task.id, status: task.status },
          });
        }

        default:
          return sendJson(res, 200, {
            jsonrpc: '2.0', id,
            error: { code: -32601, message: `Unknown method: ${rpcMethod}` },
          });
      }
    });
  }

  // ── x402 Demo Endpoint ─────────────────────────────────────────────────
  if (path === '/x402/demo' && method === 'GET') {
    const xPayment = req.headers['x-payment'];
    if (!xPayment) {
      return sendJson(res, 402, {
        x402Version: 1,
        accepts: [{
          scheme: 'exact',
          network: 'base',
          maxAmountRequired: '50000',
          resource: '/x402/demo',
          description: 'Premium demo resource access',
          payTo: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          maxTimeoutSeconds: 60,
        }],
        error: 'X-PAYMENT header is required',
      });
    }

    // Simulate payment verification
    try {
      const decoded = JSON.parse(Buffer.from(xPayment, 'base64').toString('utf-8'));
      const settlementId = `tx_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const responsePayload = Buffer.from(JSON.stringify({
        success: true,
        transaction: settlementId,
        network: decoded.network || 'base',
        payer: decoded.payload?.authorization?.from || 'unknown',
      })).toString('base64');

      return sendJson(res, 200, {
        resource: 'Premium demo content unlocked',
        settlement: {
          success: true,
          transaction: settlementId,
          mode: parseInt(decoded.payload?.authorization?.value || '0', 10) < 100000 ? 'in_memory' : 'on_chain',
          network: decoded.network || 'base',
        },
        auditTrail: [
          { event: 'payment:verification_started', timestamp: new Date().toISOString() },
          { event: 'payment:verification_passed', timestamp: new Date().toISOString() },
          { event: 'payment:settlement_started', timestamp: new Date().toISOString() },
          { event: 'payment:settlement_completed', timestamp: new Date().toISOString(), transaction: settlementId },
        ],
      }, { 'X-PAYMENT-RESPONSE': responsePayload });
    } catch {
      return sendJson(res, 400, { error: 'Invalid X-PAYMENT header encoding' });
    }
  }

  // ── OAuth: Client Registration ─────────────────────────────────────────
  if (path === '/oauth/register' && method === 'POST') {
    return parseBody(req).then(body => {
      if (!body.clientName || !body.redirectUris || !body.scopes) {
        return sendJson(res, 400, {
          error: 'invalid_request',
          error_description: 'Missing required parameters: clientName, redirectUris, scopes',
        });
      }
      const result = registerClient(body);
      return sendJson(res, 201, result);
    });
  }

  // ── OAuth: Authorize (GET) ─────────────────────────────────────────────
  if (path === '/oauth/authorize' && method === 'GET') {
    const clientId = url.searchParams.get('client_id');
    const responseType = url.searchParams.get('response_type');
    const redirectUri = url.searchParams.get('redirect_uri');
    const scope = url.searchParams.get('scope') || 'tools:read';
    const codeChallenge = url.searchParams.get('code_challenge');
    const codeChallengeMethod = url.searchParams.get('code_challenge_method');
    const state = url.searchParams.get('state');

    if (responseType !== 'code') {
      return sendJson(res, 400, { error: 'unsupported_response_type', error_description: 'Only response_type=code is supported' });
    }
    if (!clientId || !redirectUri || !codeChallenge || codeChallengeMethod !== 'S256') {
      return sendJson(res, 400, { error: 'invalid_request', error_description: 'Missing PKCE parameters' });
    }

    const client = clients.get(clientId);
    if (!client) {
      return sendJson(res, 400, { error: 'invalid_client', error_description: 'Unknown client_id' });
    }

    return sendJson(res, 200, {
      authorization_request: {
        client_id: clientId,
        client_name: client.clientName,
        redirect_uri: redirectUri,
        scope,
        state: state || undefined,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      },
      instructions: 'POST to /oauth/authorize with the same parameters to obtain an authorization code.',
    });
  }

  // ── OAuth: Authorize (POST) ────────────────────────────────────────────
  if (path === '/oauth/authorize' && method === 'POST') {
    return parseBody(req).then(body => {
      const { client_id, redirect_uri, scope, code_challenge, code_challenge_method, state } = body;
      if (!client_id || !redirect_uri || !code_challenge) {
        return sendJson(res, 400, { error: 'invalid_request', error_description: 'Missing required parameters' });
      }
      if (code_challenge_method && code_challenge_method !== 'S256') {
        return sendJson(res, 400, { error: 'invalid_request', error_description: 'Only S256 is supported' });
      }

      const client = clients.get(client_id);
      if (!client) {
        return sendJson(res, 400, { error: 'invalid_client', error_description: 'Unknown client_id' });
      }

      const scopes = (scope || 'tools:read').split(' ').filter(Boolean);
      const code = createAuthCode(client_id, redirect_uri, scopes, code_challenge);
      return sendJson(res, 200, { code, state: state || undefined });
    });
  }

  // ── OAuth: Token ───────────────────────────────────────────────────────
  if (path === '/oauth/token' && method === 'POST') {
    return parseBody(req).then(body => {
      const { grant_type } = body;

      if (grant_type === 'authorization_code') {
        const { code, client_id, client_secret, redirect_uri, code_verifier } = body;
        if (!code || !client_id || !client_secret || !redirect_uri || !code_verifier) {
          return sendJson(res, 400, { error: 'invalid_request', error_description: 'Missing required parameters' });
        }

        const authCode = authCodes.get(code);
        if (!authCode || authCode.used || authCode.expiresAt < Date.now()) {
          return sendJson(res, 400, { error: 'invalid_grant', error_description: 'Invalid or expired authorization code' });
        }
        if (authCode.clientId !== client_id || authCode.redirectUri !== redirect_uri) {
          return sendJson(res, 400, { error: 'invalid_grant', error_description: 'Client or redirect URI mismatch' });
        }

        const client = clients.get(client_id);
        if (!client) {
          return sendJson(res, 400, { error: 'invalid_client', error_description: 'Unknown client' });
        }
        const secretHash = createHash('sha256').update(client_secret).digest('hex');
        if (secretHash !== client.clientSecretHash) {
          return sendJson(res, 400, { error: 'invalid_client', error_description: 'Invalid client credentials' });
        }

        // Verify PKCE
        if (!verifyS256(code_verifier, authCode.codeChallenge)) {
          return sendJson(res, 400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
        }

        authCode.used = true;
        const tokens = issueTokens(client_id, authCode.scopes);
        return sendJson(res, 200, {
          access_token: tokens.accessToken,
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: tokens.refreshToken,
          scope: authCode.scopes.join(' '),
        }, { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' });
      }

      if (grant_type === 'client_credentials') {
        const { client_id, client_secret, scope } = body;
        if (!client_id || !client_secret) {
          return sendJson(res, 400, { error: 'invalid_request', error_description: 'Missing client_id or client_secret' });
        }
        const client = clients.get(client_id);
        if (!client) {
          return sendJson(res, 400, { error: 'invalid_client', error_description: 'Unknown client' });
        }
        const secretHash = createHash('sha256').update(client_secret).digest('hex');
        if (secretHash !== client.clientSecretHash) {
          return sendJson(res, 400, { error: 'invalid_client', error_description: 'Invalid credentials' });
        }
        const scopes = scope ? scope.split(' ') : client.scopes;
        const tokens = issueTokens(client_id, scopes);
        return sendJson(res, 200, {
          access_token: tokens.accessToken,
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: tokens.refreshToken,
          scope: scopes.join(' '),
        }, { 'Cache-Control': 'no-store', 'Pragma': 'no-cache' });
      }

      return sendJson(res, 400, { error: 'unsupported_grant_type', error_description: `Unsupported: ${grant_type}` });
    });
  }

  // ── OAuth: Introspect ──────────────────────────────────────────────────
  if (path === '/oauth/introspect' && method === 'POST') {
    return parseBody(req).then(body => {
      const stored = accessTokens.get(body.token);
      if (!stored || stored.expiresAt < Date.now()) {
        return sendJson(res, 200, { active: false });
      }
      return sendJson(res, 200, {
        active: true,
        client_id: stored.clientId,
        scope: stored.scopes.join(' '),
        token_type: 'Bearer',
        exp: Math.floor(stored.expiresAt / 1000),
        iat: Math.floor(stored.issuedAt / 1000),
        iss: BASE_URL,
      });
    });
  }

  // ── 404 ────────────────────────────────────────────────────────────────
  sendJson(res, 404, { error: 'Not found', path, method });
}

// =============================================================================
// ACT RUNNERS (for --dry-run and --act modes)
// =============================================================================

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function banner(text) {
  const line = '='.repeat(60);
  console.log(`\n${BOLD}${CYAN}${line}${RESET}`);
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  console.log(`${BOLD}${CYAN}${line}${RESET}\n`);
}

function step(n, desc) {
  console.log(`${BOLD}${GREEN}  Step ${n}:${RESET} ${desc}`);
}

function output(label, data) {
  console.log(`${DIM}  ${label}:${RESET}`);
  if (typeof data === 'string') {
    console.log(`  ${data}`);
  } else {
    console.log(`  ${JSON.stringify(data, null, 2).split('\n').join('\n  ')}`);
  }
  console.log();
}

async function fetchJson(path, opts = {}) {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return response.json();
}

async function runAct1() {
  banner('ACT 1: DISCOVERY');

  step(1, 'Fetch Agent Card');
  const card = await fetchJson('/.well-known/agent-card.json');
  output('Agent Card Summary', {
    id: card.id,
    name: card.name,
    version: card.version,
    endpoint: card.endpoint,
    skills_count: card.skills.length,
    security_schemes: Object.keys(card.securitySchemes),
  });

  step(2, 'Inspect parse_hs skill');
  const parseSkill = card.skills.find(s => s.id === 'parse_hs');
  output('Skill: parse_hs', {
    id: parseSkill.id,
    name: parseSkill.name,
    description: parseSkill.description,
    tags: parseSkill.tags,
    inputModes: parseSkill.inputModes,
    outputModes: parseSkill.outputModes,
  });

  step(3, 'Security schemes');
  output('Security Schemes', Object.fromEntries(
    Object.entries(card.securitySchemes).map(([k, v]) => [k, { type: v.type, description: v.description }])
  ));

  console.log(`${GREEN}  [ACT 1 COMPLETE]${RESET} ${card.skills.length} skills, ${Object.keys(card.securitySchemes).length} security schemes discovered.\n`);
}

async function runAct2() {
  banner('ACT 2: COMMUNICATION');

  step(1, 'Send A2A message (parse HoloScript)');
  const result1 = await fetchJson('/a2a', {
    method: 'POST',
    body: {
      jsonrpc: '2.0', id: 'demo-1', method: 'a2a.sendMessage',
      params: {
        skillId: 'parse_hs',
        arguments: { code: 'object Cube { position: [0, 1, 0]; color: "#ff0000" }' },
        message: { role: 'user', parts: [{ type: 'text', text: 'Parse this HoloScript scene' }] },
      },
    },
  });
  output('Task created', {
    task_id: result1.result.id,
    state: result1.result.status.state,
    artifacts_count: result1.result.artifacts.length,
  });
  const taskId = result1.result.id;

  step(2, 'Get task (multi-turn retrieve)');
  const result2 = await fetchJson('/a2a', {
    method: 'POST',
    body: {
      jsonrpc: '2.0', id: 'demo-2', method: 'a2a.getTask',
      params: { id: taskId },
    },
  });
  const parsedArtifact = JSON.parse(result2.result.artifacts[0].parts[0].text);
  output('Task retrieved', {
    state: result2.result.status.state,
    ast_type: parsedArtifact.type,
    object_name: parsedArtifact.objects?.[0]?.name,
    parse_time_ms: parsedArtifact.metadata?.parseTimeMs,
  });

  step(3, 'List recent tasks');
  const result3 = await fetchJson('/a2a', {
    method: 'POST',
    body: {
      jsonrpc: '2.0', id: 'demo-3', method: 'a2a.listTasks',
      params: { limit: 5 },
    },
  });
  output('Task list', {
    total: result3.result.total,
    states: result3.result.tasks.map(t => t.status.state),
  });

  console.log(`${GREEN}  [ACT 2 COMPLETE]${RESET} JSON-RPC 2.0 transport with full task lifecycle.\n`);
}

async function runAct3() {
  banner('ACT 3: ECONOMY');

  step(1, 'Request premium resource (trigger 402)');
  const result1 = await fetchJson('/x402/demo');
  output('402 PaymentRequired', {
    x402Version: result1.x402Version,
    network: result1.accepts[0].network,
    amount_usdc: `$${parseInt(result1.accepts[0].maxAmountRequired) / 1_000_000}`,
    recipient: result1.accepts[0].payTo,
    asset: result1.accepts[0].asset,
    timeout_seconds: result1.accepts[0].maxTimeoutSeconds,
  });

  step(2, 'Sign EIP-712 authorization and submit X-PAYMENT');
  const paymentPayload = {
    x402Version: 1,
    scheme: 'exact',
    network: 'base',
    payload: {
      signature: '0xdead0000beef1111cafe2222face3333abcd4444defaced55667788990011aabb',
      authorization: {
        from: '0xAgent1234567890abcdef1234567890abcdef1234',
        to: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18',
        value: '50000',
        validAfter: Math.floor(Date.now() / 1000 - 60).toString(),
        validBefore: Math.floor(Date.now() / 1000 + 60).toString(),
        nonce: `nonce_${randomUUID().slice(0, 8)}`,
      },
    },
  };
  const xPaymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

  const response = await fetch(`${BASE_URL}/x402/demo`, {
    headers: { 'X-PAYMENT': xPaymentHeader },
  });
  const result2 = await response.json();
  output('Payment settled', {
    resource: result2.resource,
    settlement_mode: result2.settlement.mode,
    transaction: result2.settlement.transaction,
    network: result2.settlement.network,
  });

  step(3, 'Audit trail');
  output('PaymentGateway Events', result2.auditTrail);

  console.log(`${GREEN}  [ACT 3 COMPLETE]${RESET} x402 payment flow: 402 -> sign -> settle -> access.\n`);
}

async function runAct4() {
  banner('ACT 4: ORCHESTRATION');

  step(1, 'Debate Society composition (headless)');
  console.log(`${DIM}  composition "DebateSociety" {${RESET}`);
  console.log(`${DIM}    config { headless: true; consensus: "moderator" }${RESET}`);
  console.log(`${DIM}    agent "Moderator"   { @llm_agent; @consensus }${RESET}`);
  console.log(`${DIM}    agent "Optimist"    { @llm_agent; @knowledge { persist: true } }${RESET}`);
  console.log(`${DIM}    agent "Skeptic"     { @llm_agent; @knowledge { persist: true } }${RESET}`);
  console.log(`${DIM}    agent "Synthesizer" { @llm_agent; @knowledge { persist: true } }${RESET}`);
  console.log(`${DIM}  }${RESET}\n`);

  step(2, 'Simulated headless execution (3 cycles)');
  const debate = [
    { agent: 'Moderator',   type: 'topic',     text: 'Should AI agents manage their own budgets autonomously?' },
    { agent: 'Optimist',    type: 'argument',   text: 'With x402 payment protocol, agents can autonomously pay for resources. Budget caps and audit trails prevent runaway spend.' },
    { agent: 'Skeptic',     type: 'rebuttal',   text: 'The daemon burn incident (W.090) shows agents spent $180 in orphaned processes. Autonomy without guardrails is dangerous.' },
    { agent: 'Synthesizer', type: 'synthesis',  text: 'Autonomous budgets with hard caps ($10 per session), kill-before-start protocol, and human review gates at L1/L2.' },
    { agent: 'Moderator',   type: 'consensus',  text: 'Tiered autonomy: L0 agents get micro-budgets (<$2/cycle), L1/L2 require human approval for spend > $5.' },
  ];

  for (const msg of debate) {
    const color = msg.agent === 'Moderator' ? YELLOW : msg.agent === 'Optimist' ? GREEN : msg.agent === 'Skeptic' ? RED : CYAN;
    console.log(`  ${color}[${msg.agent}]${RESET} ${DIM}(${msg.type})${RESET} ${msg.text}`);
    await new Promise(r => setTimeout(r, 500));
  }
  console.log();

  step(3, 'Broadcast channel + knowledge persistence');
  output('Channel Stats', {
    channel: 'debate',
    subscribers: ['Moderator', 'Optimist', 'Skeptic', 'Synthesizer'],
    messages_delivered: debate.length,
    delivery_mode: 'reliable',
    ordering: 'causal',
  });
  output('Knowledge Persistence', {
    optimist: { arguments: 1, evidence_refs: 2 },
    skeptic: { rebuttals: 1, counterexamples: 1 },
    synthesizer: { syntheses: 1, compromises: 1 },
    total_size: '0.4KB',
  });

  console.log(`${GREEN}  [ACT 4 COMPLETE]${RESET} Multi-agent orchestration via broadcast channels.\n`);
}

async function runAct5() {
  banner('ACT 5: SECURITY');

  step(1, 'Register OAuth 2.1 client (RFC 7591)');
  const regResult = await fetchJson('/oauth/register', {
    method: 'POST',
    body: {
      clientName: 'AAIF Demo Agent',
      redirectUris: ['https://demo.example.com/callback'],
      scopes: ['tools:read', 'tools:execute', 'tasks:write'],
      clientType: 'confidential',
    },
  });
  output('Client registered', {
    clientId: regResult.clientId,
    secret_preview: regResult.clientSecret.slice(0, 12) + '...',
  });

  step(2, 'Generate PKCE challenge and get authorization code');
  // Generate a deterministic but realistic PKCE pair
  const codeVerifier = `demo_verifier_${randomUUID().replace(/-/g, '').slice(0, 32)}`;
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

  output('PKCE Parameters', {
    code_verifier: codeVerifier,
    code_challenge: codeChallenge,
    method: 'S256',
  });

  const authResult = await fetchJson('/oauth/authorize', {
    method: 'POST',
    body: {
      client_id: regResult.clientId,
      redirect_uri: 'https://demo.example.com/callback',
      scope: 'tools:read tools:execute',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    },
  });
  output('Authorization code', { code: authResult.code });

  step(3, 'Exchange code for tokens (PKCE verified)');
  const tokenResult = await fetchJson('/oauth/token', {
    method: 'POST',
    body: {
      grant_type: 'authorization_code',
      code: authResult.code,
      client_id: regResult.clientId,
      client_secret: regResult.clientSecret,
      redirect_uri: 'https://demo.example.com/callback',
      code_verifier: codeVerifier,
    },
  });
  output('Tokens issued', {
    access_token: tokenResult.access_token.slice(0, 16) + '...',
    token_type: tokenResult.token_type,
    expires_in: tokenResult.expires_in,
    scope: tokenResult.scope,
    has_refresh_token: !!tokenResult.refresh_token,
  });

  step(4, 'Use Bearer token to call a tool');
  const toolResult = await fetchJson('/a2a', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokenResult.access_token}` },
    body: {
      jsonrpc: '2.0', id: 'auth-demo-1', method: 'a2a.sendMessage',
      params: {
        skillId: 'compile_holoscript',
        arguments: { code: 'object Cube { position: [0,1,0] }', target: 'threejs' },
        message: { role: 'user', parts: [{ type: 'text', text: 'Compile to Three.js' }] },
      },
    },
  });
  output('Tool execution (authorized)', {
    state: toolResult.result.status.state,
    target: 'threejs',
    success: toolResult.result.status.state === 'completed',
  });

  step(5, 'OpenID Configuration discovery');
  const oidc = await fetchJson('/.well-known/openid-configuration');
  output('OpenID Configuration', {
    issuer: oidc.issuer,
    grant_types: oidc.grant_types_supported,
    pkce_methods: oidc.code_challenge_methods_supported,
    scopes: oidc.scopes_supported,
  });

  console.log(`${GREEN}  [ACT 5 COMPLETE]${RESET} OAuth 2.1 with PKCE: register -> authorize -> token -> call.\n`);
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const actFlag = args.find(a => a.startsWith('--act'));
  const actNum = actFlag ? parseInt(args[args.indexOf(actFlag) + 1] || actFlag.replace('--act', '').replace('=', ''), 10) : 0;
  const serverOnly = args.includes('--server');
  const dryRun = args.includes('--dry-run');

  if (dryRun) {
    banner('AAIF MCP Dev Summit 2026 -- DRY RUN');
    console.log('  This would start a mock server on port', PORT);
    console.log('  and run all 5 acts against it.\n');
    console.log('  Acts:');
    console.log('    1. Discovery  -- Agent Card with 82 skills, 4 security schemes');
    console.log('    2. Communication -- A2A JSON-RPC 2.0 with task lifecycle');
    console.log('    3. Economy    -- x402 payment flow (402 -> sign -> settle)');
    console.log('    4. Orchestration -- Headless debate-society (3 agents + moderator)');
    console.log('    5. Security   -- OAuth 2.1 PKCE (register -> authorize -> token -> call)');
    console.log();
    console.log('  Endpoints that would be available:');
    console.log(`    GET  ${BASE_URL}/health`);
    console.log(`    GET  ${BASE_URL}/.well-known/agent-card.json`);
    console.log(`    GET  ${BASE_URL}/.well-known/openid-configuration`);
    console.log(`    POST ${BASE_URL}/a2a`);
    console.log(`    GET  ${BASE_URL}/x402/demo`);
    console.log(`    POST ${BASE_URL}/oauth/register`);
    console.log(`    POST ${BASE_URL}/oauth/authorize`);
    console.log(`    POST ${BASE_URL}/oauth/token`);
    console.log(`    POST ${BASE_URL}/oauth/introspect`);
    process.exit(0);
  }

  // Start server
  const server = createServer(handleRequest);
  await new Promise((resolve, reject) => {
    server.listen(PORT, () => {
      console.log(`\n${BOLD}${CYAN}  HoloScript Triple-Protocol Demo Server${RESET}`);
      console.log(`  ${DIM}Listening on ${BASE_URL}${RESET}`);
      console.log(`  ${DIM}Press Ctrl+C to stop${RESET}\n`);
      resolve();
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`  ${RED}Port ${PORT} is already in use. Set DEMO_PORT env var or stop the other process.${RESET}`);
        process.exit(1);
      }
      reject(err);
    });
  });

  if (serverOnly) {
    console.log(`  ${DIM}Server-only mode. Use curl or another client to interact.${RESET}`);
    console.log(`  ${DIM}Try: curl ${BASE_URL}/health | jq .${RESET}\n`);
    return; // Keep server running
  }

  // Small delay to ensure server is ready
  await new Promise(r => setTimeout(r, 200));

  try {
    const acts = {
      1: runAct1,
      2: runAct2,
      3: runAct3,
      4: runAct4,
      5: runAct5,
    };

    if (actNum && acts[actNum]) {
      await acts[actNum]();
    } else {
      // Run all acts
      banner('AAIF MCP Dev Summit 2026');
      console.log(`  ${DIM}Running all 5 acts against local mock server${RESET}`);
      console.log(`  ${DIM}Server: ${BASE_URL}${RESET}\n`);

      for (const [num, fn] of Object.entries(acts)) {
        await fn();
        if (parseInt(num) < 5) {
          console.log(`${DIM}  --- Pause (press Enter for next act, or wait 2s) ---${RESET}`);
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      banner('DEMO COMPLETE');
      console.log('  Three protocols, one endpoint:');
      console.log(`  ${CYAN}MCP${RESET}   for tool discovery`);
      console.log(`  ${GREEN}A2A${RESET}   for agent communication`);
      console.log(`  ${YELLOW}x402${RESET}  for agent economy`);
      console.log(`  ${RED}OAuth${RESET} for enterprise security`);
      console.log();
      console.log(`  Production: ${BOLD}https://mcp.holoscript.net${RESET}`);
      console.log(`  82 tools | 28 targets | 1800+ traits`);
      console.log();
    }
  } finally {
    server.close();
    process.exit(0);
  }
}

main().catch(err => {
  console.error(`${RED}Error: ${err.message}${RESET}`);
  process.exit(1);
});
