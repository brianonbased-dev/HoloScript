/**
 * POST /api/brittney — Brittney AI chat endpoint.
 *
 * Streams Claude responses as SSE events. Supports tool use for
 * scene manipulation (add_trait, create_object, etc.).
 */

import Anthropic from '@anthropic-ai/sdk';
import { BRITTNEY_TOOLS } from '@/lib/brittney/BrittneyTools';
import { STUDIO_API_TOOLS, STUDIO_API_TOOL_NAMES } from '@/lib/brittney/StudioAPITools';
import { executeStudioTool } from '@/lib/brittney/StudioAPIExecutor';
import { MCP_TOOLS, MCP_TOOL_NAMES } from '@/lib/brittney/MCPTools';
import { executeMCPTool } from '@/lib/brittney/MCPToolExecutor';
import { buildContextualPrompt } from '@/lib/brittney/systemPrompt';
import { rateLimit } from '@/lib/rateLimit';

const MAX_REQUESTS_PER_MIN = 20;

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
  return [...sceneTtools, ...apiTools, ...mcpTools];
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

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const limit = rateLimit(ip, MAX_REQUESTS_PER_MIN);
  if (!limit.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded', retryAfter: limit.retryAfter }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(limit.retryAfter || 60),
        'X-RateLimit-Limit': String(MAX_REQUESTS_PER_MIN),
        'X-RateLimit-Remaining': '0',
      },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return sseResponse([
      { type: 'error', payload: 'ANTHROPIC_API_KEY not configured' },
      { type: 'done', payload: null },
    ]);
  }

  let body: { messages?: Array<{ role: string; content: string }>; sceneContext?: string };
  try {
    body = await request.json();
  } catch {
    return sseResponse([
      { type: 'error', payload: 'Invalid JSON body' },
      { type: 'done', payload: null },
    ]);
  }

  const { messages, sceneContext } = body;
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

          const response = await client.messages.create({
            model: process.env.BRITTNEY_MODEL || 'claude-sonnet-4-20250514',
            max_tokens: 2048,
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

                  if (STUDIO_API_TOOL_NAMES.has(currentToolName) || MCP_TOOL_NAMES.has(currentToolName)) {
                    // Studio API or MCP tool — execute server-side and collect for tool_result
                    pendingToolCalls.push({
                      id: currentToolId,
                      name: currentToolName,
                      input: parsedArgs,
                    });
                    // Notify the client that a tool is being executed
                    send({
                      type: 'tool_call',
                      payload: { name: currentToolName, arguments: parsedArgs, serverExecuted: true },
                    });
                  } else {
                    // Scene manipulation tool — send to client for execution
                    send({ type: 'tool_call', payload: { name: currentToolName, arguments: parsedArgs } });
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
                  payload: { name: tc.name, success: result.success, data: result.data, error: result.error },
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
