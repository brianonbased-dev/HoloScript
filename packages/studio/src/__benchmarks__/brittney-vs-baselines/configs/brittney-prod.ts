import type { ConfigRunner, ConfigRunResult, SceneMutation, Task, TokenUsage } from '../types';

export interface BrittneyProdOptions {
  endpoint: string;
  authHeader?: string;
  cookie?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

interface SseEvent {
  type: string;
  payload: unknown;
}

function parseSseLine(line: string): SseEvent | null {
  if (!line.startsWith('data: ')) return null;
  const json = line.slice('data: '.length);
  try {
    return JSON.parse(json) as SseEvent;
  } catch {
    return null;
  }
}

async function readSseStream(
  response: Response,
  onEvent: (e: SseEvent) => void
): Promise<void> {
  const body = response.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split('\n')) {
        const ev = parseSseLine(line);
        if (ev) onEvent(ev);
      }
    }
  }
}

const SCENE_TOOL_NAMES = new Set([
  'create_object',
  'add_trait',
  'compose_traits',
  'remove_object',
  'set_property',
  'transform',
]);

export function makeBrittneyProd(opts: BrittneyProdOptions): ConfigRunner {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const model = opts.model ?? 'claude-opus-4-7';

  return {
    name: 'brittney-prod',
    async run(task: Task, signal: AbortSignal): Promise<ConfigRunResult> {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (opts.authHeader) headers['authorization'] = opts.authHeader;
      if (opts.cookie) headers['cookie'] = opts.cookie;

      let outputText = '';
      const mutations: SceneMutation[] = [];
      const usage: TokenUsage = { input_tokens: 0, output_tokens: 0 };
      let toolRounds = 0;
      let lastError: string | undefined;
      let lastWasToolUse = false;

      const response = await fetchImpl(opts.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: [{ role: 'user', content: task.prompt }] }),
        signal,
      });
      if (!response.ok) {
        return {
          output_text: '',
          tool_rounds: 0,
          usage,
          model_id: model,
          scene_mutations: [],
          error: `brittney http ${response.status}: ${await response.text().catch(() => '')}`,
        };
      }

      await readSseStream(response, (ev) => {
        switch (ev.type) {
          case 'text': {
            const t = ev.payload;
            if (typeof t === 'string') outputText += t;
            break;
          }
          case 'tool_call': {
            const p = ev.payload as { name?: string; arguments?: Record<string, unknown> };
            if (p?.name && SCENE_TOOL_NAMES.has(p.name)) {
              mutations.push({
                tool_name: p.name,
                input: p.arguments ?? {},
                sim_contract_passed: null,
              });
            }
            lastWasToolUse = true;
            break;
          }
          case 'sim_contract_check': {
            const p = ev.payload as {
              passed?: boolean;
              mutation?: string;
            };
            const last = mutations[mutations.length - 1];
            if (last && typeof p?.passed === 'boolean') {
              last.sim_contract_passed = p.passed;
            }
            break;
          }
          case 'tool_result': {
            if (lastWasToolUse) {
              toolRounds += 1;
              lastWasToolUse = false;
            }
            break;
          }
          case 'usage': {
            const p = ev.payload as Partial<TokenUsage>;
            if (typeof p?.input_tokens === 'number') usage.input_tokens += p.input_tokens;
            if (typeof p?.output_tokens === 'number') usage.output_tokens += p.output_tokens;
            break;
          }
          case 'error': {
            const p = ev.payload;
            lastError = typeof p === 'string' ? p : JSON.stringify(p);
            break;
          }
          case 'done':
            break;
        }
      });

      return {
        output_text: outputText,
        tool_rounds: toolRounds,
        usage,
        model_id: model,
        scene_mutations: mutations,
        error: lastError,
      };
    },
  };
}
