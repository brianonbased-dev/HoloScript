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
import {
  isSceneMutationTool,
  verifySceneMutation,
  type SimContractCheckResult,
} from '@/lib/brittney/SimContractGate';
import {
  LOTUS_TOOLS,
  LOTUS_TOOL_NAMES,
  executeLotusTool,
  type LotusToolResult,
} from '@/lib/brittney/lotus/LotusTools';
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
  // LOTUS_TOOLS: Brittney's Paper 26 garden-tending toolset. Mutations
  // (bloom_petal/wilt_petal) gate against derivePetalBloomState — the
  // architectural-trust hook. Read-only tools (read_garden_state, tend_garden,
  // propose_evidence) always succeed.
  const lotusTools = LOTUS_TOOLS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool['input_schema'],
  }));
  return [...sceneTtools, ...apiTools, ...mcpTools, ...simTools, ...lotusTools];
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
    sessionId?: string;
    closeSession?: boolean;
    simContractCheck?: SimContractCheck | null;
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

  const { messages, sceneContext, sessionId: bodySessionId, closeSession, simContractCheck } = body;
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

  const client = new Anthropic({ apiKey });

  const claudeMessages: Anthropic.MessageParam[] = (messages ?? []).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  if (claudeMessages.length === 0) {
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

      const model = process.env.BRITTNEY_MODEL || 'claude-opus-4-7';
      const simContractCheckSafe: SimContractCheck | null = simContractCheck ?? null;

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
          // BRITTNEY mutation tools that fail SimulationContract grounding are
          // not emitted to the client; instead the rejection is fed back to
          // Claude as a tool_result with is_error so it can recover or reroute.
          const rejectedMutations: Array<{
            id: string;
            name: string;
            input: Record<string, unknown>;
            check: SimContractCheckResult;
          }> = [];
          // CAEL per-round accumulators. Track EVERY tool call Claude attempts
          // (server, client, sim, rejected) so tool_iters reflects real model
          // behavior, not just the server-execution subset.
          let roundText = '';
          const roundToolCalls: Array<{ name: string; input: unknown; result?: unknown }> = [];
          // Snapshot the message thread at round-start. The assistant turn for
          // this round isn't appended until after Claude completes (and only
          // when continuing for tool results), so this is the deterministic
          // L2 input that survives replay.
          const messagesAtRoundStart = roundMessages.map((m) => ({ ...m }));

          /**
           * Commit a CAEL record for this round and emit a caelChain SSE event.
           * Called once per round from both exit paths (continue / break) so the
           * chain extends per-round, not just per-request.
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

          const response = await client.messages.create({
            // Opus 4.7 default — most capable. Override via BRITTNEY_MODEL env
            // (e.g. 'claude-sonnet-4-6' for cost, 'claude-haiku-4-5' for speed).
            model,
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
                  roundText += event.delta.text;
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
                  // CAEL: record the call attempt regardless of branch (server,
                  // client, sim, rejected). Result attached later when known.
                  roundToolCalls.push({ name: currentToolName, input: parsedArgs });

                  if (
                    STUDIO_API_TOOL_NAMES.has(currentToolName) ||
                    MCP_TOOL_NAMES.has(currentToolName) ||
                    LOTUS_TOOL_NAMES.has(currentToolName)
                  ) {
                    // Studio API, MCP, or Lotus tool — execute server-side and
                    // collect for tool_result. Lotus tools route through
                    // executeLotusTool which gates `bloom_petal`/`wilt_petal`
                    // mutations against derivePetalBloomState (Paper 26 Gate 2 —
                    // architectural-trust enforcement).
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
                  } else if (isSceneMutationTool(currentToolName)) {
                    // BRITTNEY scene mutation — pre-validate against the
                    // SimulationContract declared by the scene before applying
                    // (Paper 26 gate 1 / Algebraic Trust application layer).
                    const check = verifySceneMutation(sceneContext, {
                      tool: currentToolName,
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
                        payload: { name: currentToolName, arguments: parsedArgs },
                      });
                    } else {
                      // Hold mutation back from the client; feed rejection to
                      // Claude as a tool_result(is_error:true) on the next round.
                      rejectedMutations.push({
                        id: currentToolId,
                        name: currentToolName,
                        input: parsedArgs,
                        check,
                      });
                    }
                  } else {
                    // BRITTNEY read-only tool (list_objects/get_object) or
                    // SIMULATION_TOOLS — pass through unchecked. Out-of-scope
                    // for the gate-1 contract (different verification path).
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

          // If Claude stopped for tool_use AND there is server-side work to feed
          // back (executed tools OR contract-rejected mutations), run another round.
          if (
            stopReason === 'tool_use' &&
            (pendingToolCalls.length > 0 || rejectedMutations.length > 0)
          ) {
            // Execute server-side tools in parallel — route to correct executor.
            // Lotus tools (sync) are wrapped in Promise.resolve so they share
            // the same Promise.all path; their gateRejected results propagate
            // back to the model as is_error tool_results just like MCP/Studio
            // failures. Per-call we ALSO emit a `lotusGardenEvent` so the
            // client UI sees garden mutations distinctly from generic tool_call
            // events (the lotus visualization can react in real time).
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

            // Build the assistant message with tool_use blocks + tool results.
            // Both executed and rejected tool_uses must round-trip so the
            // assistant→user pairing stays valid for the next Claude turn.
            const assistantContent: Anthropic.ContentBlockParam[] = [
              ...pendingToolCalls.map((tc) => ({
                type: 'tool_use' as const,
                id: tc.id,
                name: tc.name,
                input: tc.input as Record<string, unknown>,
              })),
              ...rejectedMutations.map((rm) => ({
                type: 'tool_use' as const,
                id: rm.id,
                name: rm.name,
                input: rm.input,
              })),
            ];

            const toolResultContent: Anthropic.ToolResultBlockParam[] = [
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
                is_error: true,
              })),
            ];

            roundMessages = [
              ...roundMessages,
              { role: 'assistant' as const, content: assistantContent },
              { role: 'user' as const, content: toolResultContent },
            ];
            // CAEL: commit the round's record before continuing — chain extends
            // per-round, not just per-request.
            commitCaelForRound();
            // Continue to next round — Claude will process the tool results
            continue;
          }

          // CAEL: text-only or client-side-tool round terminating the request.
          commitCaelForRound();
          // No more tool calls or all remaining are client-side — done
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
