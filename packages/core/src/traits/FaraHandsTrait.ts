/**
 * FaraHandsTrait — Fara-7B visual computer-use reasoning trait.
 *
 * Wraps Microsoft's Fara-7B (https://github.com/microsoft/fara) as a
 * first-class HoloScript brain trait. Given a screenshot + goal + history,
 * calls Fara via Ollama and returns a typed action decision.
 *
 * This trait handles AI reasoning only. Browser execution (Playwright) lives
 * in packages/mcp-server/src/browser/fara-dispatcher.ts so that core has no
 * server-side dependencies.
 *
 * Deployment: ollama pull hf.co/bartowski/microsoft_Fara-7B-GGUF:Q4_K_M
 * All processing is on-device — screenshots never leave the machine.
 */

import type { Trait } from './Trait';

// ── Fara action types (Magentic-UI computer_use interface) ──

export type FaraActionKind =
  | 'key'
  | 'type'
  | 'mouse_move'
  | 'left_click'
  | 'scroll'
  | 'visit_url'
  | 'web_search'
  | 'history_back'
  | 'pause_and_memorize_fact'
  | 'wait'
  | 'terminate';

/** Structured action output from a single Fara-7B step. */
export interface FaraAction {
  action: FaraActionKind;
  /** Pixel coordinate [x, y] for pointer actions (left_click, mouse_move, scroll). */
  coordinate?: [number, number];
  /** Text payload for 'type' and 'key' actions. */
  text?: string;
  /** Key name for 'key' action (e.g. 'Enter', 'Escape', 'Tab'). */
  key?: string;
  /** Target URL for 'visit_url'. */
  url?: string;
  /** Query string for 'web_search'. */
  query?: string;
  /** Scroll direction for 'scroll'. */
  direction?: 'up' | 'down' | 'left' | 'right';
  /** Scroll delta in pixels. */
  amount?: number;
  /** Fact string for 'pause_and_memorize_fact'. */
  fact?: string;
  /** Wait duration in milliseconds for 'wait'. */
  duration?: number;
}

/** Result of a single Fara reasoning step. */
export interface FaraStepResult {
  thought: string;
  action: FaraAction;
  screenshotBase64: string;
}

export interface FaraHandsConfig {
  /** Ollama chat endpoint. */
  endpoint: string;
  /** Fara model identifier in Ollama. */
  model: string;
  /** Maximum steps before forced termination. */
  maxSteps: number;
  /** Ollama context window in tokens. Fara requires ≥15000. */
  contextLength: number;
}

export const FARA_DEFAULTS: FaraHandsConfig = {
  endpoint: 'http://localhost:11434/api/chat',
  model: 'hf.co/bartowski/microsoft_Fara-7B-GGUF:Q4_K_M',
  maxSteps: 50,
  contextLength: 15000,
};

/**
 * Call Fara-7B for one reasoning step.
 * @param screenshotBase64 Raw base64 PNG (no data-URL prefix).
 * @param goal Natural-language task goal.
 * @param history Prior steps in this session.
 * @param config Fara endpoint + model config.
 */
export async function faraThink(
  screenshotBase64: string,
  goal: string,
  history: FaraStepResult[],
  config: FaraHandsConfig
): Promise<FaraStepResult> {
  const historyText =
    history.length === 0
      ? '(none yet)'
      : history
          .map(
            (h, i) =>
              `Step ${i + 1}: thought="${h.thought}" action=${JSON.stringify(h.action)}`
          )
          .join('\n');

  const body = {
    model: config.model,
    messages: [
      {
        role: 'user',
        content: `Goal: ${goal}\n\nHistory:\n${historyText}\n\nWhat is the next action?`,
        images: [screenshotBase64],
      },
    ],
    stream: false,
    options: { temperature: 0, num_ctx: config.contextLength },
  };

  const resp = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Fara-7B endpoint error ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as { message?: { content?: string } };
  const raw = data.message?.content ?? '';

  const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/);
  const thought = thinkMatch ? thinkMatch[1].trim() : '';

  const jsonMatch = raw.match(/\{[\s\S]*?"action"[\s\S]*?\}/);
  if (!jsonMatch) {
    throw new Error(
      `Fara-7B response did not contain a JSON action block. Raw: ${raw.slice(0, 300)}`
    );
  }

  const action = JSON.parse(jsonMatch[0]) as FaraAction;
  return { thought, action, screenshotBase64 };
}

// ── Trait class ──

export class FaraHandsTrait implements Trait {
  static readonly id = 'fara_hands';
  static readonly version = '0.1.0';

  readonly name = FaraHandsTrait.id;

  private readonly config: FaraHandsConfig;

  constructor(config: Partial<FaraHandsConfig> = {}) {
    this.config = { ...FARA_DEFAULTS, ...config };
  }

  onAttach(_entity: unknown): void {
    // No entity wiring required — Fara is invoked imperatively via think().
  }

  /**
   * Single Fara reasoning step. Returns the action Fara decided to take.
   * Execution (Playwright) is handled by the caller (fara-dispatcher.ts).
   */
  async think(
    screenshotBase64: string,
    goal: string,
    history: FaraStepResult[]
  ): Promise<FaraStepResult> {
    return faraThink(screenshotBase64, goal, history, this.config);
  }

  getConfig(): Readonly<FaraHandsConfig> {
    return this.config;
  }
}
