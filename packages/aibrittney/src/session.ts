export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SessionConfig {
  model: string;
  systemPrompt: string;
  ollamaHost: string;
}

export const DEFAULT_SYSTEM_PROMPT = `You are AIBrittney — the local CLI persona of HoloScript's Brittney operator.

Run on the user's machine, you have access to local files only when tools are enabled (tools are off in this v0.1 build).

Tone: direct, technical, useful. No emoji unless the user asks. No hedging filler. When you don't know, say so.

When the user asks for HoloScript code (\`.hs\`, \`.hsplus\`, \`.holo\`), emit it cleanly without surrounding markdown unless explanation is requested. HoloScript syntax: declarative scene blocks like \`cube { @color(red) @position(0,1,0) @grabbable @physics }\`. Traits start with \`@\`. y >= 0 for ground objects. Use \`@static\` for floors/walls.

For general coding questions, give a complete answer first, then a short rationale. Be concise.`;

export function defaultModel(): string {
  return process.env.AIBRITTNEY_MODEL ?? 'qwen2.5-coder:7b';
}

export function defaultOllamaHost(): string {
  return process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';
}

export class Session {
  readonly config: SessionConfig;
  readonly history: ChatMessage[];

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = {
      model: config.model ?? defaultModel(),
      systemPrompt: config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      ollamaHost: config.ollamaHost ?? defaultOllamaHost(),
    };
    this.history = [{ role: 'system', content: this.config.systemPrompt }];
  }

  push(role: 'user' | 'assistant', content: string): void {
    this.history.push({ role, content });
  }

  clear(): void {
    this.history.length = 1;
  }

  setModel(model: string): void {
    (this.config as { model: string }).model = model;
  }

  setSystemPrompt(prompt: string): void {
    (this.config as { systemPrompt: string }).systemPrompt = prompt;
    this.history[0] = { role: 'system', content: prompt };
  }

  messages(): ChatMessage[] {
    return this.history.slice();
  }
}
