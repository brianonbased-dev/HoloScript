export const maxDuration = 300;

/**
 * POST /api/brittney — Brittney AI chat endpoint.
 *
 * Streams Claude responses as SSE events. Supports tool use for
 * scene manipulation (add_trait, create_object, etc.).
 */

import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { BRITTNEY_TOOLS } from '@/lib/brittney/BrittneyTools';
import { STUDIO_API_TOOLS, STUDIO_API_TOOL_NAMES } from '@/lib/brittney/StudioAPITools';
import { executeStudioTool } from '@/lib/brittney/StudioAPIExecutor';
import { MCP_TOOLS, MCP_TOOL_NAMES } from '@/lib/brittney/MCPTools';
import { executeMCPTool } from '@/lib/brittney/MCPToolExecutor';
import { buildContextualPrompt } from '@/lib/brittney/systemPrompt';
import { rateLimit } from '@/lib/rate-limiter';
import { checkCredits, deductCredits } from '@/lib/creditGate';
import { SIMULATION_TOOLS } from '@/lib/brittney/SimulationTools';
import { requireAuth } from '@/lib/api-auth';
import { corsHeaders } from '../_lib/cors';
import { readJsonBody } from '../_lib/body-size';

const MAX_REQUESTS_PER_MIN = 20;
// SEC-T03: cap per-message input size to bound LLM spend from a single request.
const MAX_MESSAGE_CHARS = 4000;

/* System prompt lives in @/lib/brittney/systemPrompt.ts */

function convertToolsToClaudeFormat(): Anthropic.Tool[] {
  const sceneTtools = BRITTNEY_TOOLS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool['input_schema'],
  }));
  const apiTools = STUDIO_API_TOOLS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool['input_schema'],
  }));
  const mcpTools = MCP_TOOLS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool['input_schema'],
  }));
  const simTools = SIMULATION_TOOLS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool['input_schema'],
  }));
  return [...sceneTtools, ...apiTools, ...mcpTools, ...simTools];
}

/**
 * Resolve the base URL for internal API calls.
 * In production Next.js, internal fetch needs the full origin.
 */
function getBaseUrl(request: Request): string {
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  const host = request.headers.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

export async function POST(request: NextRequest) {
  // SEC-T03: gate on authenticated session before any LLM spend.
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const limit = rateLimit(
    request,
    { max: MAX_REQUESTS_PER_MIN, label: 'Rate limit exceeded' },
    'brittney'
  );
  if (!limit.ok) {
    return limit.response;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return sseResponse([
      { type: 'error', payload: 'ANTHROPIC_API_KEY not configured' },
      { type: 'done', payload: null },
    ]);
  }

  // SEC-T17: cap body bytes before parsing. Per-message content is capped
  // below at MAX_MESSAGE_CHARS (4KB); 32KB body budget covers multi-turn
  // history + sceneContext without exposing the 300s maxDuration to abuse.
  const parsed = await readJsonBody<{
    messages?: Array<{ role: string; content: string }>;
    sceneContext?: string;
  }>(request, { maxBytes: 32_000 });
  if (!parsed.ok) {
    const msg =
      parsed.error === 'payload_too_large' ? 'Body exceeds size limit' : 'Invalid JSON body';
    return sseResponse([
      { type: 'error', payload: msg },
      { type: 'done', payload: null },
    ]);
  }
  const body = parsed.body;

  const { messages, sceneContext } = body;

  // SEC-T03: reject oversize messages before constructing the LLM request.
  const oversize = (messages ?? []).find(
    (m) => typeof m.content === 'string' && m.content.length > MAX_MESSAGE_CHARS
  );
  if (oversize) {
    return sseResponse([
      {
        type: 'error',
        payload: `Message exceeds ${MAX_MESSAGE_CHARS} chars`,
      },
      { type: 'done', payload: null },
    ]);
  }

  const client = new Anthropic({ apiKey });

  const claudeMessages: Anthropic.MessageParam[] = (messages ?? []).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  if (claudeMessages.length === 0) {
    return sseResponse([
      { type: 'error', payload: 'No messages provided' },
      { type: 'done', payload: null },
    ]);
  }

  // SEC-T03: credit check before first Claude token (pricing op = Brittney chat).
  const gate = await checkCredits(request, 'studio_chat');
  if (gate.error) return gate.error;

  const systemPrompt = buildContextualPrompt(sceneContext);

  const baseUrl = getBaseUrl(request);

  // Forward auth-related headers so Studio API calls inherit the session
  const forwardHeaders: Record<string, string> = {};
  const cookie = request.headers.get('cookie');
  if (cookie) forwardHeaders['cookie'] = cookie;
  const authHeader = request.headers.get('authorization');
  if (authHeader) forwardHeaders['authorization'] = authHeader;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: { type: string; payload: unknown }) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        const MAX_TOOL_ROUNDS = 5;
        let roundMessages = [...claudeMessages];
        let debited = false;

        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          // Accumulate tool use blocks during streaming
          let currentToolName = '';
          let currentToolInput = '';
          let currentToolId = '';
          const pendingToolCalls: Array<{
            id: string;
            name: string;
            input: Record<string, unknown>;
          }> = [];

          if (!debited) {
            debited = true;
            deductCredits(gate.userId, 'studio_chat').catch(() => {});
          }

          const response = await client.messages.create({
            // Opus 4.7 default — most capable. Override via BRITTNEY_MODEL env
            // (e.g. 'claude-sonnet-4-6' for cost, 'claude-haiku-4-5' for speed).
            model: process.env.BRITTNEY_MODEL || 'claude-opus-4-7',
            // 16K covers streaming tool use with scene manipulation (easily
            // exceeds 2K per turn). Safe ONLY because stream:true (below) keeps
            // the HTTP socket alive past undici's ~30s headersTimeout — a buffered
            // (non-streaming) request at this max_tokens hangs on slow Opus turns
            // (see packages/llm-provider/src/adapters/anthropic.ts:201-216).
            max_tokens: 16000,
            system: systemPrompt,
            messages: roundMessages,
            tools: convertToolsToClaudeFormat(),
            stream: true,
          });

          let stopReason: string | null = null;

          for await (const event of response) {
            switch (event.type) {
              case 'content_block_start':
                if (event.content_block.type === 'tool_use') {
                  currentToolName = event.content_block.name;
                  currentToolId = event.content_block.id;
                  currentToolInput = '';
                }
                break;

              case 'content_block_delta':
                if ('text' in event.delta && event.delta.text) {
                  send({ type: 'text', payload: event.delta.text });
                }
                if ('partial_json' in event.delta && event.delta.partial_json) {
                  currentToolInput += event.delta.partial_json;
                }
                break;

              case 'content_block_stop':
                if (currentToolName) {
                  const parsedArgs: Record<string, unknown> = currentToolInput
                    ? (JSON.parse(currentToolInput) as Record<string, unknown>)
                    : {};

                  if (
                    STUDIO_API_TOOL_NAMES.has(currentToolName) ||
                    MCP_TOOL_NAMES.has(currentToolName)
                  ) {
                    // Studio API or MCP tool — execute server-side and collect for tool_result
                    pendingToolCalls.push({
                      id: currentToolId,
                      name: currentToolName,
                      input: parsedArgs,
                    });
                    // Notify the client that a tool is being executed
                    send({
                      type: 'tool_call',
                      payload: {
                        name: currentToolName,
                        arguments: parsedArgs,
                        serverExecuted: true,
                      },
                    });
                  } else {
                    // Scene manipulation tool — send to client for execution
                    send({
                      type: 'tool_call',
                      payload: { name: currentToolName, arguments: parsedArgs },
                    });
                  }
                  currentToolName = '';
                  currentToolInput = '';
                  currentToolId = '';
                }
                break;

              case 'message_delta':
                if ('stop_reason' in event.delta) {
                  stopReason = event.delta.stop_reason;
                }
                break;
            }
          }

          // If Claude stopped for tool_use AND there are server-side tools to execute,
          // run them and feed results back for another round
          if (stopReason === 'tool_use' && pendingToolCalls.length > 0) {
            // Execute all pending tool calls in parallel — route to correct executor
            const results = await Promise.all(
              pendingToolCalls.map(async (tc) => {
                const result = MCP_TOOL_NAMES.has(tc.name)
                  ? await executeMCPTool(tc.name, tc.input)
                  : await executeStudioTool(tc.name, tc.input, baseUrl, forwardHeaders);
                send({
                  type: 'tool_result',
                  payload: {
                    name: tc.name,
                    success: result.success,
                    data: result.data,
                    error: result.error,
                  },
                });
                return { id: tc.id, result };
              })
            );

            // Build the assistant message with tool_use blocks + tool results
            const assistantContent: Anthropic.ContentBlockParam[] = pendingToolCalls.map((tc) => ({
              type: 'tool_use' as const,
              id: tc.id,
              name: tc.name,
              input: tc.input as Record<string, unknown>,
            }));

            const toolResultContent: Anthropic.ToolResultBlockParam[] = results.map((r) => ({
              type: 'tool_result' as const,
              tool_use_id: r.id,
              content: JSON.stringify(r.result.success ? r.result.data : { error: r.result.error }),
            }));

            roundMessages = [
              ...roundMessages,
              { role: 'assistant' as const, content: assistantContent },
              { role: 'user' as const, content: toolResultContent },
            ];
            // Continue to next round — Claude will process the tool results
            continue;
          }

          // No more tool calls or all remaining are client-side — done
          break;
        }

        send({ type: 'done', payload: null });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        send({ type: 'error', payload: msg });
        send({ type: 'done', payload: null });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...sseHeaders(),
      'X-RateLimit-Limit': String(MAX_REQUESTS_PER_MIN),
      'X-RateLimit-Remaining': String(limit.remaining),
    },
  });
}

function sseResponse(events: Array<{ type: string; payload: unknown }>): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(body, { headers: sseHeaders() });
}

function sseHeaders(): HeadersInit {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  };
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, {
      methods: 'GET, POST, OPTIONS',
    }),
  });
}
