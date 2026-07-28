/**
 * Fara-7B browser dispatcher — Playwright execution layer.
 *
 * Pairs with FaraHandsTrait (packages/core/src/traits/FaraHandsTrait.ts):
 *   - FaraHandsTrait.think() → decides the next action (AI reasoning, no browser)
 *   - fara-dispatcher.ts    → executes that action via Playwright + builds receipts
 *
 * Entry point for agents and MCP tools: faraRun().
 *
 * Safety model:
 *   - Domain allow/block list evaluated before each navigate/visit_url step.
 *   - maxSteps hard cap prevents runaway loops.
 *   - Every step produces a BrowserAction with coordinateWitness for audit.
 *   - Full FaraRunReceipt (BrowserAbsorptionReceipt-compatible) returned on completion.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { browserPool } from './BrowserPool.js';
import { faraThink, FARA_DEFAULTS } from '../../../core/src/traits/FaraHandsTrait.js';
import type {
  FaraStepResult,
  FaraAction,
  FaraHandsConfig,
} from '../../../core/src/traits/FaraHandsTrait.js';

// ── Receipt types (BrowserAbsorptionReceipt-compatible) ──

export interface FaraBrowserAction {
  step: number;
  kind: string;
  timestamp: string;
  coordinateWitness?: [number, number];
  value?: string;
  url?: string;
  screenshotBeforeHash?: string;
  screenshotAfterHash?: string;
  durationMs?: number;
  thought: string;
}

export interface FaraRunPolicy {
  allowedDomains: string[];
  blockedDomains: string[];
  maxSteps: number;
  maxDurationMs: number;
  headless: boolean;
}

export interface FaraRunReceipt {
  id: string;
  sessionId: string;
  goal: string;
  startedAt: string;
  endedAt: string;
  policy: FaraRunPolicy;
  actions: FaraBrowserAction[];
  outcome: 'success' | 'failure' | 'timeout' | 'blocked_by_policy' | 'max_steps';
  memorized: string[];
  summary?: string;
  hash: string;
  hashAlgorithm: 'sha256';
  agentTier: 'fara';
}

// ── Policy helpers ──

function isDomainAllowed(url: string, policy: FaraRunPolicy): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return false;
  }
  if (policy.blockedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
    return false;
  }
  if (policy.allowedDomains.length > 0) {
    return policy.allowedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  }
  return true;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// ── Action execution ──

async function executeFaraAction(
  sessionId: string,
  action: FaraAction,
  policy: FaraRunPolicy
): Promise<{ blocked: boolean; reason?: string }> {
  const session = browserPool.getSession(sessionId);
  if (!session) throw new Error(`Browser session not found: ${sessionId}`);
  const page = session.page;

  switch (action.action) {
    case 'left_click':
      if (action.coordinate) {
        await page.mouse.click(action.coordinate[0], action.coordinate[1]);
      }
      break;

    case 'mouse_move':
      if (action.coordinate) {
        await page.mouse.move(action.coordinate[0], action.coordinate[1]);
      }
      break;

    case 'type':
      if (action.text) await page.keyboard.type(action.text);
      break;

    case 'key':
      if (action.key) await page.keyboard.press(action.key);
      break;

    case 'scroll': {
      const dx =
        action.direction === 'left'
          ? -(action.amount ?? 300)
          : action.direction === 'right'
            ? (action.amount ?? 300)
            : 0;
      const dy =
        action.direction === 'up'
          ? -(action.amount ?? 300)
          : action.direction === 'down'
            ? (action.amount ?? 300)
            : 0;
      if (action.coordinate) {
        await page.mouse.move(action.coordinate[0], action.coordinate[1]);
      }
      await page.mouse.wheel(dx, dy);
      break;
    }

    case 'visit_url':
      if (action.url) {
        if (!isDomainAllowed(action.url, policy)) {
          return { blocked: true, reason: `Domain blocked by policy: ${action.url}` };
        }
        await page.goto(action.url, { waitUntil: 'domcontentloaded' });
      }
      break;

    case 'web_search': {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(action.query ?? '')}`;
      if (!isDomainAllowed(searchUrl, policy)) {
        return { blocked: true, reason: 'Google search blocked by policy' };
      }
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
      break;
    }

    case 'history_back':
      await page.goBack();
      break;

    case 'wait':
      await new Promise((res) => setTimeout(res, action.duration ?? 1000));
      break;

    case 'pause_and_memorize_fact':
    case 'terminate':
      // handled at loop level
      break;
  }

  return { blocked: false };
}

// ── Main loop ──

export interface FaraRunOptions {
  sessionId: string;
  goal: string;
  policy?: Partial<FaraRunPolicy>;
  faraConfig?: Partial<FaraHandsConfig>;
}

const DEFAULT_POLICY: FaraRunPolicy = {
  allowedDomains: [],
  blockedDomains: [],
  maxSteps: 50,
  maxDurationMs: 300_000,
  headless: true,
};

export async function faraRun(opts: FaraRunOptions): Promise<FaraRunReceipt> {
  const policy: FaraRunPolicy = { ...DEFAULT_POLICY, ...opts.policy };
  const config: FaraHandsConfig = { ...FARA_DEFAULTS, ...opts.faraConfig };

  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const receiptId = `fara_${opts.sessionId}_${Date.now()}`;

  const actions: FaraBrowserAction[] = [];
  const history: FaraStepResult[] = [];
  const memorized: string[] = [];

  let outcome: FaraRunReceipt['outcome'] = 'failure';

  const session = browserPool.getSession(opts.sessionId);
  if (!session) throw new Error(`Browser session not found: ${opts.sessionId}`);

  for (let step = 0; step < policy.maxSteps; step++) {
    if (Date.now() - startMs > policy.maxDurationMs) {
      outcome = 'timeout';
      break;
    }

    // Screenshot before action
    const beforeBuf = await session.page.screenshot({ type: 'png' });
    const beforeB64 = beforeBuf.toString('base64');
    const beforeHash = sha256(beforeB64);

    // Fara reasoning
    const stepResult = await faraThink(beforeB64, opts.goal, history, config);
    history.push(stepResult);

    const { action } = stepResult;
    const stepTs = new Date().toISOString();
    const t0 = Date.now();

    // Handle terminal actions before execution
    if (action.action === 'terminate') {
      outcome = 'success';
      actions.push({
        step,
        kind: 'terminate',
        timestamp: stepTs,
        thought: stepResult.thought,
        screenshotBeforeHash: beforeHash,
      });
      break;
    }

    if (action.action === 'pause_and_memorize_fact' && action.fact) {
      memorized.push(action.fact);
      actions.push({
        step,
        kind: 'pause_and_memorize_fact',
        timestamp: stepTs,
        thought: stepResult.thought,
        value: action.fact,
        screenshotBeforeHash: beforeHash,
      });
      continue;
    }

    // Execute browser action
    const { blocked, reason } = await executeFaraAction(opts.sessionId, action, policy);
    if (blocked) {
      outcome = 'blocked_by_policy';
      actions.push({
        step,
        kind: action.action,
        timestamp: stepTs,
        thought: stepResult.thought,
        screenshotBeforeHash: beforeHash,
        value: reason,
        durationMs: Date.now() - t0,
      });
      break;
    }

    // Screenshot after action
    const afterBuf = await session.page.screenshot({ type: 'png' });
    const afterB64 = afterBuf.toString('base64');
    const afterHash = sha256(afterB64);

    actions.push({
      step,
      kind: action.action,
      timestamp: stepTs,
      thought: stepResult.thought,
      coordinateWitness: action.coordinate,
      value: action.text ?? action.key ?? action.url ?? action.query,
      url: action.url ?? (action.action === 'web_search' ? `google:${action.query}` : undefined),
      screenshotBeforeHash: beforeHash,
      screenshotAfterHash: afterHash,
      durationMs: Date.now() - t0,
    });

    if (step === policy.maxSteps - 1) {
      outcome = 'max_steps';
    }
  }

  const endedAt = new Date().toISOString();

  const receiptBody = `fara:${opts.sessionId}:${opts.goal}:${startedAt}:${actions.length}:${outcome}`;
  const hash = sha256(receiptBody);

  return {
    id: receiptId,
    sessionId: opts.sessionId,
    goal: opts.goal,
    startedAt,
    endedAt,
    policy,
    actions,
    outcome,
    memorized,
    summary: `Fara-7B: "${opts.goal}" — ${actions.length} steps, outcome=${outcome}`,
    hash,
    hashAlgorithm: 'sha256',
    agentTier: 'fara',
  };
}

// ── Zod schema for MCP tool ──

export const FaraRunSchema = z.object({
  sessionId: z.string().describe('Playwright browser session ID (from browser_launch)'),
  goal: z.string().describe('Natural-language goal for Fara-7B to accomplish in the browser'),
  maxSteps: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .default(50)
    .describe('Hard step cap before termination (default 50)'),
  endpoint: z
    .string()
    .optional()
    .default('http://localhost:11434/api/chat')
    .describe('Ollama chat endpoint for Fara-7B'),
  model: z
    .string()
    .optional()
    .default('hf.co/bartowski/microsoft_Fara-7B-GGUF:Q4_K_M')
    .describe('Fara model tag in Ollama'),
  allowedDomains: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Domains Fara may navigate to (empty = all permitted)'),
  blockedDomains: z
    .array(z.string())
    .optional()
    .default([])
    .describe('Domains Fara must never navigate to (overrides allowed)'),
  maxDurationMs: z
    .number()
    .optional()
    .default(300_000)
    .describe('Session time cap in milliseconds (default 5 min)'),
});
