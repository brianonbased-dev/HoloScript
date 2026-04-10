import { NextResponse } from 'next/server';

// ─── GET /api/docs — Auto-generated API Documentation ───────────────────────
// Returns an OpenAPI 3.1.0-compatible specification of all studio-api endpoints.
// Generated from the known route inventory. For agent and human consumption.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'HoloScript Studio API',
      version: '0.1.0',
      description: 'Backend API for HoloScript Studio — 3D scene creation, compilation, and deployment platform. 70+ REST endpoints, MCP tool proxy, OAuth authentication.',
      contact: { name: 'HoloScript Team', url: 'https://github.com/brianonbased-dev/HoloScript' },
    },
    servers: [
      { url: 'https://studio.holoscript.net', description: 'Production' },
      { url: 'http://localhost:3105', description: 'Local development' },
    ],
    tags: [
      { name: 'auth', description: 'Authentication (NextAuth.js — GitHub, Google OAuth)' },
      { name: 'agent', description: 'Agent-optimized endpoints for AI agent access' },
      { name: 'mcp', description: 'MCP tool proxy to orchestrator' },
      { name: 'scenes', description: 'Scene generation, compilation, export' },
      { name: 'assets', description: 'Asset upload, processing, and management' },
      { name: 'projects', description: 'Project and workspace management' },
      { name: 'social', description: 'Social features — follows, comments, feed' },
      { name: 'daemon', description: 'Background daemon jobs and absorb tasks' },
      { name: 'admin', description: 'Admin and operational endpoints' },
    ],
    paths: {
      '/api/health': {
        get: { tags: ['admin'], summary: 'Health check', description: 'Returns Ollama status and available models', responses: { '200': { description: 'Health status' } } },
      },
      '/api/auth/{...nextauth}': {
        get: { tags: ['auth'], summary: 'NextAuth.js handler', description: 'Handles /signin, /signout, /callback, /session, /csrf, /providers', parameters: [{ name: '...nextauth', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Auth response' } } },
      },
      '/api/agent': {
        get: { tags: ['agent'], summary: 'List available agent actions', responses: { '200': { description: 'Action catalog' } } },
        post: { tags: ['agent'], summary: 'Execute agent action', description: 'Maps friendly action names to MCP tools. Actions: compile, parse, validate, suggest_traits, generate, query, list_traits, explain_trait', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['compile', 'parse', 'validate', 'suggest_traits', 'generate', 'query', 'list_traits', 'explain_trait'] }, code: { type: 'string' }, target: { type: 'string' }, prompt: { type: 'string' } } } } } }, responses: { '200': { description: 'Action result' }, '400': { description: 'Invalid action' } } },
      },
      '/api/studio/mcp-config': {
        get: { tags: ['agent'], summary: 'MCP configuration for IDE agents', parameters: [{ name: 'format', in: 'query', schema: { type: 'string', enum: ['claude', 'cursor', 'generic'], default: 'claude' } }], responses: { '200': { description: 'MCP server configuration' } } },
      },
      '/api/studio/quickstart': {
        post: { tags: ['agent'], summary: 'One-request agent onboarding', description: 'Returns capabilities, workflows, MCP config, and hello world compilation', responses: { '200': { description: 'Quickstart bundle' } } },
      },
      '/api/studio/capabilities': {
        get: { tags: ['agent'], summary: 'Structured capabilities listing', description: 'Returns all Studio domains, tools, and access methods', responses: { '200': { description: 'Capabilities' } } },
      },
      '/api/mcp/call': {
        get: { tags: ['mcp'], summary: 'MCP orchestrator status', responses: { '200': { description: 'Orchestrator status and servers' } } },
        post: { tags: ['mcp'], summary: 'Proxy MCP tool call', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['tool'], properties: { tool: { type: 'string' }, args: { type: 'object' } } } } } }, responses: { '200': { description: 'Tool result' }, '503': { description: 'Orchestrator offline' } } },
      },
      '/api/generate': {
        post: { tags: ['scenes'], summary: 'Generate scene from prompt', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { prompt: { type: 'string' }, style: { type: 'string' } } } } } }, responses: { '200': { description: 'Generated scene' } } },
      },
      '/api/export': {
        post: { tags: ['scenes'], summary: 'Export scene', responses: { '200': { description: 'Exported data' } } },
      },
      '/api/export/gltf': {
        post: { tags: ['scenes'], summary: 'Export scene as GLTF', responses: { '200': { description: 'GLTF data' } } },
      },
      '/api/export/v2': {
        post: { tags: ['scenes'], summary: 'Export scene (v2 pipeline)', responses: { '200': { description: 'Exported data' } } },
      },
      '/api/publish': {
        post: { tags: ['scenes'], summary: 'Publish scene to community', responses: { '200': { description: 'Published scene' } } },
      },
      '/api/share': {
        post: { tags: ['scenes'], summary: 'Create shareable link', responses: { '200': { description: 'Share URL' } } },
      },
      '/api/deploy': {
        post: { tags: ['scenes'], summary: 'Deploy scene to hosting', responses: { '200': { description: 'Deployment result' } } },
      },
      '/api/critique': {
        post: { tags: ['scenes'], summary: 'AI scene critique', responses: { '200': { description: 'Critique result' } } },
      },
      '/api/assets': {
        get: { tags: ['assets'], summary: 'List assets', responses: { '200': { description: 'Asset list' } } },
      },
      '/api/assets/upload': {
        post: { tags: ['assets'], summary: 'Upload asset', responses: { '200': { description: 'Uploaded asset' } } },
      },
      '/api/assets/process': {
        post: { tags: ['assets'], summary: 'Process uploaded asset', responses: { '200': { description: 'Processing result' } } },
      },
      '/api/social/feed': {
        get: { tags: ['social'], summary: 'Social feed', responses: { '200': { description: 'Feed entries' } } },
      },
      '/api/social/follows': {
        post: { tags: ['social'], summary: 'Follow/unfollow user', responses: { '200': { description: 'Follow result' } } },
      },
      '/api/social/comments': {
        post: { tags: ['social'], summary: 'Comment on scene', responses: { '200': { description: 'Comment result' } } },
      },
      '/api/social/crosspost/moltbook': {
        get: {
          tags: ['social'],
          summary: 'Moltbook crosspost endpoint metadata',
          responses: { '200': { description: 'Crosspost endpoint info and defaults' } },
        },
        post: {
          tags: ['social'],
          summary: 'Crosspost agent discovery update to Moltbook',
          description: 'Posts a discovery/update payload to Moltbook community channels for agent visibility.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    content: { type: 'string' },
                    community: { type: 'string', default: 'holoscript' },
                    tags: { type: 'array', items: { type: 'string' } },
                    agentName: { type: 'string' },
                    agentCardUrl: { type: 'string' },
                    capabilities: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Crosspost accepted by Moltbook' },
            '401': { description: 'Authentication required' },
            '503': { description: 'Moltbook API key missing / service unavailable' },
          },
        },
      },
      '/api/daemon/absorb': {
        post: { tags: ['daemon'], summary: 'Start absorb job', responses: { '200': { description: 'Job started' } } },
      },
      '/api/daemon/jobs': {
        get: { tags: ['daemon'], summary: 'List daemon jobs', responses: { '200': { description: 'Job list' } } },
      },
      '/api/rooms': {
        post: { tags: ['projects'], summary: 'Create collaboration room', responses: { '200': { description: 'Room created' } } },
      },
      '/api/trait-registry': {
        get: { tags: ['projects'], summary: 'Browse trait registry', responses: { '200': { description: 'Trait list' } } },
      },
      '/api/materials': {
        get: { tags: ['assets'], summary: 'List materials', responses: { '200': { description: 'Material list' } } },
      },
      '/api/plugins': {
        get: { tags: ['projects'], summary: 'List plugins', responses: { '200': { description: 'Plugin list' } } },
      },
      '/api/docs': {
        get: { tags: ['admin'], summary: 'This endpoint — OpenAPI specification', responses: { '200': { description: 'OpenAPI 3.1.0 spec' } } },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  });
}
