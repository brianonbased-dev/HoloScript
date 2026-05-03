export const maxDuration = 300;

/**
 * POST /api/brittney — Brittney AI chat endpoint.
 *
 * Streams LLM responses as SSE events via the unified provider surface
 * from @holoscript/llm-provider (D.025 Phase 3). Supports tool use for
 * scene manipulation (add_trait, create_object, etc.).
 *
 * Provider routing (BRITTNEY_PROVIDER env gate):
 *   - anthropic (default when ANTHROPIC_API_KEY set) → Claude via AnthropicAdapter
 *   - ollama (when OLLAMA_HOST set or BRITTNEY_PROVIDER=ollama) → local model
 *     via LocalLLMAdapter (Ollama-compatible OpenAI endpoint)
 *   - Error if neither is configured (downloaded apps must set OLLAMA_HOST)
 *
 * The stream yields LLMStreamChunk events which the route translates to the
 * same SSE format the client already consumes — identical bytes for the
 * Anthropic cloud path (regression-safe), same CAEL/SimContractGate/tool-loop
 * semantics.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  type LLMMessage,
  type ToolSpec,
  type ToolUseBlock,
  type ToolResultBlock,
  type TextBlock,
  type LLMCompletionRequest,
} from '@holoscript/llm-provider';
import { resolveBrittneyProvider } from '@/lib/brittney/provider';
import { BRITTNEY_TOOLS } from '@/lib/brittney/BrittneyTools';
import { STUDIO_API_TOOLS, STUDIO_API_TOOL_NAMES } from '@/lib/brittney/StudioAPITools';
import { MCP_TOOLS, MCP_TOOL_NAMES } from '@/lib/brittney/MCPTools';
import { SIMULATION_TOOLS } from '@/lib/brittney/SimulationTools';
import { isSceneMutationTool, verifySceneMutation, type SimContractCheckResult } from '@/lib/brittney/SimContractGate';
import {
  LOTUS_TOOLS,
  LOTUS_TOOL_NAMES,
  executeLotusTool,
  type LotusToolResult,
} from '@/lib/brittney/lotus/LotusTools';
import { executeMCPTool } from '@/lib/brittney/MCPToolExecutor';
import { EMBODIED_TOOLS, EMBODIED_TOOL_NAMES } from '@/lib/brittney/EmbodiedTools';
import { executeEmbodiedTool } from '@/lib/brittney/EmbodiedTools';
import { executeStudioTool } from '@/lib/brittney/StudioAPIExecutor';
import { buildContextualPrompt } from '@/lib/brittney/systemPrompt';
import { rateLimit } from '@/lib/rate-limiter';
import { checkCredits, deductCredits } from '@/lib/creditGate';
import { requireAuth } from '@/lib/api-auth';
import { corsHeaders } from '../_lib/cors';
import { readJsonBody } from '../_lib/body-size';
import {
  attachChain,
  buildBrittneyCaelRecord,
  closeChain,
  commitRound,
  deriveSessionId,
  extractEvidencePaths,
  type SimContractCheck,
} from '@/lib/brittney/cael';

const MAX_REQUESTS_PER_MIN = 20;
// SEC-T03: cap per-message input size to bound LLM spend from a single request.
const MAX_MESSAGE_CHARS = 4000;

/**
 * All tool names that the Brittney route handles server-side
 * (Studio API, MCP, Lotus, Embodied). Used to distinguish
 * server-executed tools from client-side-only tools.
 */
const SERVER_EXECUTED_TOOL_NAMES = new Set([
  ...STUDIO_API_TOOL_NAMES,
  ...MCP_TOOL_NAMES,
  ...LOTUS_TOOL_NAMES,
  ...EMBODIED_TOOL_NAMES,
]);

/**
 * Convert Brittney's tool definitions to the provider-agnostic ToolSpec shape.
 *
 * Brittney's tool definitions use { name, description, parameters }
 * (same as OpenAI function-calling format). ToolSpec uses the same
 * shape with `input_schema` instead of `parameters`. This function
 * performs that rename.
 */
function convertToolsToProviderFormat(): ToolSpec[] {
  const allDefs = [
    ...BRITTNEY_TOOLS,
    ...STUDIO_API_TOOLS,
    ...MCP_TOOLS,
    ...SIMULATION_TOOLS,
    ...LOTUS_TOOLS,
    ...EMBODIED_TOOLS,
  ];

  return allDefs.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as ToolSpec['input_schema'],
  }));
}

/* System prompt lives in @/lib/brittney/systemPrompt.ts */

/**
 * Resolve the base URL for internal API calls.
 * In production Next.js, internal fetch needs the full origin.
 */
function getBaseUrl(request: Request): string {
  const proto = request.headers.get('x-forwarded-proro') || 'http';
  const host = request.headers.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

export async function POST(request: NextRequest) {
  // SEC-T03: gate on authenticated session before any LLM spend.
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;

  const limit = rateLimit(
    request,
    { max: MAX_REQUESTS_PER_MIN, label: 'Rate limit exceeded' },
    'brittney'
  );
  if (!limit.ok) {
    return limit.response;
  }

  // Resolve provider via BRITTNEY_PROVIDER env gate (D.025 Phase 3).
  // Throws a clear error if no provider is configured.
  let resolved: ReturnType<typeof resolveBrittneyProvider>;
  try {
    resolved = resolveBrittneyProvider();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return sseResponse([
      { type: 'error', payload: msg },
      { type: 'done', payload: null },
    ]);
  }

  const { provider, model, maxTokens, providerName } = resolved;

  // SEC-T17: cap body bytes before parsing. Per-message content is capped
  // below at MAX_MESSAGE_CHARS (4KB); 32KB body budget covers multi-turn
  // history + sceneContext without exposing the 300s maxDuration to abuse.
  const parsed = await readJsonBody<{
    messages?: Array<{ role: string; content: string }>;
    sceneContext?: string;
    sessionId?: string;
    closeSession?: boolean;
    simContractCheck?: SimContractCheck | null;
    systemPrompt?: string;
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

  const { messages, sceneContext, sessionId: bodySessionId, closeSession, simContractCheck, systemPrompt: bodySystemPrompt } = body;
  const sessionId =
    typeof bodySessionId === 'string' && bodySessionId.length > 0
      ? bodySessionId
      : deriveSessionId(messages ?? []);

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

  // Convert client messages to LLMMessage[] (provider-agnostic).
  // The client sends simple { role, content } objects; for the tool-loop
  // rounds, we build structured content arrays (text + tool_use + tool_result).
  const llmMessages: LLMMessage[] = (messages ?? []).map((m) => ({
    role: m.role as LLMMessage['role'],
    content: m.content,
  }));

  if (llmMessages.length === 0) {
    if (closeSession) {
      const result = closeChain(sessionId, { stopReason: 'client-close' });
      return sseResponse([
        {
          type: 'caelChain',
          payload: { chainId: sessionId, fnv1a: result.finalChain, closed: true },
        },
        { type: 'done', payload: null },
      ]);
    }
    return sseResponse([
      { type: 'error', payload: 'No messages provided' },
      { type: 'done', payload: null },
    ]);
  }

  // SEC-T03: credit check before first LLM token (pricing op = Brittney chat).
  const gate = await checkCredits(request, 'studio_chat');
  if (gate.error) return gate.error;

  const systemPrompt = bodySystemPrompt ?? buildContextualPrompt(sceneContext);
  const baseUrl = getBaseUrl(request);

  // Forward auth-related headers so Studio API calls inherit the session
  const forwardHeaders: Record<string, string> = {};
  const cookie = request.headers.get('cookie');
  if (cookie) forwardHeaders['cookie'] = cookie;
  const authHeader = request.headers.get('authorization');
  if (authHeader) forwardHeaders['authorization'] = authHeader;

  // Build tools in provider-agnostic format (ToolSpec[]).
  // Same shape as Anthropic's { name, description, input_schema } — the
  // conversion just renames `parameters` → `input_schema`.
  const tools = convertToolsToProviderFormat();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: { type: string; payload: unknown }) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      // CAEL: attach chain for this session. prevChain may carry over from a
      // prior request on the same process; first request in a fresh process
      // starts with prev=null. Honest semantics — never claim more continuity
      // than we can prove.
      const attached = attachChain(sessionId);
      let prevChain: string | null = attached.prevChain;
      send({
        type: 'caelChain',
        payload: {
          chainId: attached.chainId,
          fnv1a: attached.prevChain,
          isNew: attached.isNew,
        },
      });

      const simContractCheckSafe: SimContractCheck | null = simContractCheck ?? null;

      try {
        const MAX_TOOL_ROUNDS = 5;
        let roundMessages = [
          // Prepend system prompt as a system message for the provider.
          // The Anthropic adapter handles this internally via
          // separateSystemMessages(); Ollama and others include it inline.
          { role: 'system' as const, content: systemPrompt },
          ...llmMessages,
        ];
        let debited = false;

        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          // Tool-call accumulators for this round.
          let currentToolName = '';
          let currentToolId = '';
          let currentToolInput = '';
          const pendingToolCalls: Array<{
            id: string;
            name: string;
            input: Record<string, unknown>;
          }> = [];
          // BRITTNEY mutation tools that fail SimulationContract grounding are
          // not emitted to the client; instead the rejection is fed back to
          // the model as a tool_result with is_error so it can recover.
          const rejectedMutations: Array<{
            id: string;
            name: string;
            input: Record<string, unknown>;
            check: SimContractCheckResult;
          }> = [];
          // CAEL per-round accumulators.
          let roundText = '';
          const roundToolCalls: Array<{ name: string; input: unknown; result?: unknown }> = [];
          // Snapshot the message thread at round-start.
          const messagesAtRoundStart = roundMessages.map((m) => ({ ...m }));

          /**
           * Commit a CAEL record for this round and emit a caelChain SSE event.
           */
          const commitCaelForRound = (): void => {
            const record = buildBrittneyCaelRecord({
              sessionId,
              round,
              model,
              messages: messagesAtRoundStart,
              finalText: roundText,
              toolCalls: roundToolCalls,
              evidencePaths: extractEvidencePaths(roundToolCalls),
              simContractCheck: simContractCheckSafe,
              prevChain,
            });
            commitRound(sessionId, record);
            send({
              type: 'caelChain',
              payload: {
                chainId: sessionId,
                fnv1a: record.fnv1a_chain,
                round,
                tool_iters: record.tool_iters,
              },
            });
            prevChain = record.fnv1a_chain;
          };

          if (!debited) {
            debited = true;
            deductCredits(gate.userId, 'studio_chat').catch(() => {});
          }

          // Stream the LLM response via the unified provider surface.
          // LLMStreamChunk events are translated to SSE events that the
          // client already consumes — identical format regardless of backend.
          const request: LLMCompletionRequest = {
            messages: roundMessages,
            maxTokens,
            model,
            tools: tools.length > 0 ? tools : undefined,
            stream: true,
          };

          let stopReason: string | null = null;

          const streamIter = provider.streamCompletion(request, model);

          for await (const chunk of streamIter) {
            switch (chunk.type) {
              case 'text_delta': {
                roundText += chunk.text;
                send({ type: 'text', payload: chunk.text });
                break;
              }

              case 'tool_use_start': {
                currentToolName = chunk.name;
                currentToolId = chunk.id;
                currentToolInput = '';
                break;
              }

              case 'tool_use_input_delta': {
                currentToolInput += chunk.partialJson;
                break;
              }

              case 'tool_use_end': {
                // tool_use_end carries the fully-parsed input.
                const parsedArgs: Record<string, unknown> = chunk.input && Object.keys(chunk.input).length > 0
                  ? chunk.input
                  : (currentToolInput ? (JSON.parse(currentToolInput) as Record<string, unknown>) : {});
                // CAEL: record the call attempt regardless of branch.
                roundToolCalls.push({ name: currentToolName || chunk.name, input: parsedArgs });

                if (SERVER_EXECUTED_TOOL_NAMES.has(currentToolName || chunk.name)) {
                  // Studio API, MCP, Lotus, or Embodied tool — execute server-side.
                  pendingToolCalls.push({
                    id: chunk.id,
                    name: currentToolName || chunk.name,
                    input: parsedArgs,
                  });
                  send({
                    type: 'tool_call',
                    payload: {
                      name: currentToolName || chunk.name,
                      arguments: parsedArgs,
                      serverExecuted: true,
                    },
                  });
                } else if (isSceneMutationTool(currentToolName || chunk.name)) {
                  // BRITTNEY scene mutation — pre-validate against SimulationContract.
                  const check = verifySceneMutation(sceneContext, {
                    tool: currentToolName || chunk.name,
                    input: parsedArgs,
                  });
                  send({
                    type: 'simContractCheck',
                    payload: {
                      passed: check.passed,
                      contractId: check.contractId,
                      mutation: check.mutation,
                      ...(check.reason ? { reason: check.reason } : {}),
                    },
                  });
                  if (check.passed) {
                    send({
                      type: 'tool_call',
                      payload: { name: currentToolName || chunk.name, arguments: parsedArgs },
                    });
                  } else {
                    rejectedMutations.push({
                      id: chunk.id,
                      name: currentToolName || chunk.name,
                      input: parsedArgs,
                      check,
                    });
                  }
                } else {
                  // BRITTNEY read-only tool or SIMULATION_TOOLS — pass through.
                  send({
                    type: 'tool_call',
                    payload: { name: currentToolName || chunk.name, arguments: parsedArgs },
                  });
                }
                currentToolName = '';
                currentToolInput = '';
                currentToolId = '';
                break;
              }

              case 'message_stop': {
                stopReason = chunk.finishReason;
                break;
              }
            }
          }

          // If the model stopped for tool_use AND there is server-side work
          // to feed back (executed tools OR contract-rejected mutations),
          // run another round.
          if (
            stopReason === 'tool_use' &&
            (pendingToolCalls.length > 0 || rejectedMutations.length > 0)
          ) {
            // Execute server-side tools in parallel.
            const results =
              pendingToolCalls.length > 0
                ? await Promise.all(
                    pendingToolCalls.map(async (tc) => {
                      let result: { success: boolean; data?: unknown; error?: string };
                      if (LOTUS_TOOL_NAMES.has(tc.name)) {
                        const lotus: LotusToolResult = executeLotusTool(tc.name, tc.input);
                        result = {
                          success: lotus.success,
                          data: lotus.data,
                          error: lotus.error,
                        };
                        send({
                          type: 'lotusGardenEvent',
                          payload: {
                            tool: tc.name,
                            paperId: lotus.paperId,
                            newState: lotus.newState,
                            accepted: lotus.success,
                            gateRejected: lotus.gateRejected ?? false,
                            reason: lotus.error,
                          },
                        });
                      } else if (MCP_TOOL_NAMES.has(tc.name)) {
                        result = await executeMCPTool(tc.name, tc.input);
                      } else if (EMBODIED_TOOL_NAMES.has(tc.name)) {
                        const emb = await executeEmbodiedTool(tc.name, tc.input);
                        result = { success: emb.success, data: emb.data, error: emb.error };
                      } else {
                        result = await executeStudioTool(tc.name, tc.input, baseUrl, forwardHeaders);
                      }
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
                  )
                : [];

            // Build the assistant message with tool_use blocks + tool results
            // in LLMMessage format (provider-agnostic).
            const assistantContent: Array<TextBlock | ToolUseBlock> = [
              ...(roundText ? [{ type: 'text' as const, text: roundText }] : []),
              ...pendingToolCalls.map((tc) => ({
                type: 'tool_use' as const,
                id: tc.id,
                name: tc.name,
                input: tc.input,
              })),
              ...rejectedMutations.map((rm) => ({
                type: 'tool_use' as const,
                id: rm.id,
                name: rm.name,
                input: rm.input,
              })),
            ];

            const toolResultContent: ToolResultBlock[] = [
              ...results.map((r) => ({
                type: 'tool_result' as const,
                tool_use_id: r.id,
                content: JSON.stringify(
                  r.result.success ? r.result.data : { error: r.result.error }
                ),
              })),
              ...rejectedMutations.map((rm) => ({
                type: 'tool_result' as const,
                tool_use_id: rm.id,
                content: `SimulationContract grounding rejected this mutation: ${rm.check.reason ?? 'contract violation'} (contractId: ${rm.check.contractId})`,
                is_error: true as const,
              })),
            ];

            roundMessages = [
              ...roundMessages,
              { role: 'assistant' as const, content: assistantContent },
              { role: 'user' as const, content: toolResultContent },
            ];
            // CAEL: commit the round's record before continuing.
            commitCaelForRound();
            // Reset round text for next round.
            roundText = '';
            // Continue to next round.
            continue;
          }

          // CAEL: text-only or client-side-tool round terminating the request.
          commitCaelForRound();
          // No more tool calls or all remaining are client-side — done.
          break;
        }

        // CAEL: explicit client-signaled session close after a round completes.
        if (closeSession) {
          const closed = closeChain(sessionId, { stopReason: 'client-close' });
          send({
            type: 'caelChain',
            payload: { chainId: sessionId, fnv1a: closed.finalChain, closed: true },
          });
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
      'X-LLM-Provider': providerName,
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