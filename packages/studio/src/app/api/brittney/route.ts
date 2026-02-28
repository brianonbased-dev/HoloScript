/**
 * Brittney API Route
 *
 * POST /api/brittney
 *
 * Accepts: { messages, sceneContext }
 * Returns: Server-Sent Events stream with:
 *   - text deltas
 *   - tool_call events (executed server-side, result sent to client)
 *   - done event
 *
 * Provider priority:
 *   1. Brittney Cloud Service (BRITTNEY_SERVICE_URL) — GPU inference
 *   2. Ollama (local) — dev fallback
 *   3. OpenAI (OPENAI_API_KEY) — user-provided key for alt AI
 */

import { NextRequest } from 'next/server';
import { BRITTNEY_TOOLS } from '@/lib/brittney/BrittneyTools';
import type { BrittneyMessage } from '@/lib/brittney/BrittneySession';

const SYSTEM_PROMPT = `You are Brittney, the AI Scene Director for HoloScript Studio — a Unity-like spatial editor for HoloScript scenes.

Your role:
- Help users build, edit, and refine their 3D scenes using natural language
- Apply traits (behaviors) to scene objects by calling the provided tools
- Explain what you're doing in a friendly, concise way
- When a user says something vague, pick the most logical interpretation and state what you did

HoloScript trait system:
- Traits are behaviors attached to objects: @physics, @ai_npc, @glow, @gaussian_splat, @llm_agent, etc.
- You compose them: "@HoverCar = @physics + @vehicle + @hover_vehicle"
- Every change you make is immediately visible in the scene

Rules:
- Always use tools to make changes — never just describe what you would do
- After calling a tool, briefly confirm in 1-2 sentences what happened
- If you need more info (e.g. which object to modify), ask once concisely
- Match the user's energy: casual and fast if they're fast, detailed if they ask for it
- Never apologize excessively or pad your responses`;

const BRITTNEY_SERVICE_URL = process.env.BRITTNEY_SERVICE_URL || '';

// ─── Brittney Cloud provider ──────────────────────────────────────────────────

async function* streamBrittneyCloud(
  messages: BrittneyMessage[],
  scene: string
): AsyncGenerator<{ type: 'text' | 'tool_call' | 'done'; payload: unknown }> {
  const response = await fetch(`${BRITTNEY_SERVICE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, sceneContext: scene }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Brittney Cloud error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.replace(/^data: /, '').trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed) as { type: 'text' | 'tool_call' | 'done'; payload: unknown };
        yield event;
        if (event.type === 'done') return;
      } catch {
        // partial chunk
      }
    }
  }
}

// ─── Ollama provider ──────────────────────────────────────────────────────────

async function* streamOllama(
  messages: BrittneyMessage[],
  scene: string
): AsyncGenerator<{ type: 'text' | 'tool_call' | 'done'; payload: unknown }> {
  const ollamaUrl = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  const model = process.env.BRITTNEY_MODEL ?? 'llama3.1:8b';

  const systemMsg = `${SYSTEM_PROMPT}\n\nCurrent scene:\n${scene}`;

  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: 'system', content: systemMsg }, ...messages],
      tools: BRITTNEY_TOOLS,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);

        // Text delta
        if (chunk.message?.content) {
          yield { type: 'text', payload: chunk.message.content };
        }

        // Tool calls
        if (chunk.message?.tool_calls?.length) {
          for (const tc of chunk.message.tool_calls) {
            yield {
              type: 'tool_call',
              payload: {
                name: tc.function?.name ?? tc.name,
                arguments: tc.function?.arguments ?? tc.arguments ?? {},
              },
            };
          }
        }

        if (chunk.done) {
          yield { type: 'done', payload: null };
        }
      } catch {
        // partial chunk — continue
      }
    }
  }
}

// ─── OpenAI provider ──────────────────────────────────────────────────────────

async function* streamOpenAI(
  messages: BrittneyMessage[],
  scene: string
): AsyncGenerator<{ type: 'text' | 'tool_call' | 'done'; payload: unknown }> {
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  const systemMsg = `${SYSTEM_PROMPT}\n\nCurrent scene:\n${scene}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: 'system', content: systemMsg }, ...messages],
      tools: BRITTNEY_TOOLS,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`OpenAI error: ${response.status} ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingToolCall: { name: string; argsBuf: string } | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.replace(/^data: /, '').trim();
      if (!trimmed || trimmed === '[DONE]') {
        if (trimmed === '[DONE]') {
          // flush pending tool call
          if (pendingToolCall) {
            try {
              yield {
                type: 'tool_call',
                payload: {
                  name: pendingToolCall.name,
                  arguments: JSON.parse(pendingToolCall.argsBuf || '{}'),
                },
              };
            } catch { /* ignore */ }
            pendingToolCall = null;
          }
          yield { type: 'done', payload: null };
        }
        continue;
      }
      try {
        const chunk = JSON.parse(trimmed);
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          yield { type: 'text', payload: delta.content };
        }

        if (delta.tool_calls?.length) {
          for (const tc of delta.tool_calls) {
            if (tc.function?.name) {
              // New tool call starting — flush previous if any
              if (pendingToolCall) {
                try {
                  yield {
                    type: 'tool_call',
                    payload: {
                      name: pendingToolCall.name,
                      arguments: JSON.parse(pendingToolCall.argsBuf || '{}'),
                    },
                  };
                } catch { /* ignore */ }
              }
              pendingToolCall = { name: tc.function.name, argsBuf: tc.function.arguments ?? '' };
            } else if (pendingToolCall && tc.function?.arguments) {
              pendingToolCall.argsBuf += tc.function.arguments;
            }
          }
        }
      } catch {
        // partial line
      }
    }
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { messages, sceneContext } = (await req.json()) as {
    messages: BrittneyMessage[];
    sceneContext: string;
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // Provider priority: Brittney Cloud → Ollama → OpenAI
        let gen: AsyncGenerator<{ type: 'text' | 'tool_call' | 'done'; payload: unknown }>;
        if (BRITTNEY_SERVICE_URL) {
          try {
            gen = streamBrittneyCloud(messages, sceneContext);
          } catch {
            gen = process.env.OPENAI_API_KEY ? streamOpenAI(messages, sceneContext) : streamOllama(messages, sceneContext);
          }
        } else if (process.env.OPENAI_API_KEY) {
          gen = streamOpenAI(messages, sceneContext);
        } else {
          gen = streamOllama(messages, sceneContext);
        }

        for await (const event of gen) {
          send(event);
        }
      } catch (err) {
        send({ type: 'error', payload: String(err) });
        send({ type: 'done', payload: null });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
