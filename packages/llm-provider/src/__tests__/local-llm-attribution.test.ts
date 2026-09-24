/**
 * Inference requests must say who made them.
 *
 * THE GAP. The HoloLlama proxy on the Jetson records one receipt per request and reads the
 * caller from an `X-Holo-Agent` header, falling back to the literal string 'unattributed'.
 * Measured 2026-09-10 across the last five days of receipts:
 *
 *     2,180 unattributed      876 brittney-eval-runner
 *
 * and of those 2,180, **2,172 came from 192.168.0.119 — the Jetson calling itself**. The
 * source is holoscript-agent.service, running `holoscript-agent run jetson-orin-brain.hsplus`
 * continuously since 2026-08-20; its runner reaches inference through provider.complete(),
 * which lands here, and this adapter sent only Content-Type.
 *
 * WHY IT MATTERS BEYOND TIDINESS: every request is also captured as a (user, target) capsule
 * into the live-trace corpus — 14,143 of them. Rows nobody attributed cannot be shown to be
 * product traffic rather than someone's benchmark, so they cannot safely be curated into
 * training data. The attribution IS what makes the corpus usable.
 *
 * NEVER INVENT A NAME. An adapter with no configured identity omits the header entirely and
 * stays honestly 'unattributed', because a generic label like 'llm-provider' would read as
 * real attribution while telling a curator nothing about which agent produced the row —
 * strictly worse than admitting we do not know.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LocalLLMAdapter } from '../adapters/local-llm.js';

const HEADER = 'X-Holo-Agent';

function captureHeaders() {
  const seen: Array<Record<string, string>> = [];
  const fake = vi.fn(async (_url: string, init: { headers?: Record<string, string> }) => {
    seen.push({ ...(init.headers ?? {}) });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'ok', role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        model: 'test',
      }),
    };
  });
  vi.stubGlobal('fetch', fake);
  return seen;
}

const ask = (adapter: LocalLLMAdapter) =>
  adapter.complete({ messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 8 });

describe('local-llm adapter attribution', () => {
  const envBefore = { ...process.env };
  beforeEach(() => {
    delete process.env.HOLO_INFERENCE_CALLER;
    delete process.env.HOLOMESH_HANDLE;
    delete process.env.HOLOSCRIPT_AGENT_HANDLE;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...envBefore };
  });

  it('sends the configured caller on a completion', async () => {
    const seen = captureHeaders();
    await ask(
      new LocalLLMAdapter({ baseURL: 'http://localhost:18080', callerId: 'jetson-orin-brain' })
    );
    expect(seen).toHaveLength(1);
    expect(seen[0][HEADER]).toBe('jetson-orin-brain');
  });

  it('falls back to HOLO_INFERENCE_CALLER, then HOLOMESH_HANDLE', async () => {
    process.env.HOLO_INFERENCE_CALLER = 'from-explicit-env';
    process.env.HOLOMESH_HANDLE = 'from-handle';
    let seen = captureHeaders();
    await ask(new LocalLLMAdapter({ baseURL: 'http://localhost:18080' }));
    expect(seen[0][HEADER]).toBe('from-explicit-env');

    delete process.env.HOLO_INFERENCE_CALLER;
    vi.unstubAllGlobals();
    seen = captureHeaders();
    await ask(new LocalLLMAdapter({ baseURL: 'http://localhost:18080' }));
    expect(seen[0][HEADER]).toBe('from-handle');
  });

  // The Jetson edge agent sets HOLOSCRIPT_AGENT_HANDLE and nothing else, so this is the
  // fallback that actually attributes production traffic. Installing llm-provider alone is
  // then enough — which matters because the agent package cannot be installed from a plain
  // npm pack tarball (workspace:^ deps, EUNSUPPORTEDPROTOCOL).
  it('falls back to HOLOSCRIPT_AGENT_HANDLE, which the edge agent already sets', async () => {
    process.env.HOLOSCRIPT_AGENT_HANDLE = 'jetson-orin-super';
    const seen = captureHeaders();
    await ask(new LocalLLMAdapter({ baseURL: 'http://localhost:18080' }));
    expect(seen[0][HEADER]).toBe('jetson-orin-super');
  });

  it('prefers the more specific vars over HOLOSCRIPT_AGENT_HANDLE', async () => {
    process.env.HOLOSCRIPT_AGENT_HANDLE = 'generic-handle';
    process.env.HOLO_INFERENCE_CALLER = 'specific';
    const seen = captureHeaders();
    await ask(new LocalLLMAdapter({ baseURL: 'http://localhost:18080' }));
    expect(seen[0][HEADER]).toBe('specific');
  });

  it('explicit config beats the environment', async () => {
    process.env.HOLO_INFERENCE_CALLER = 'ambient';
    const seen = captureHeaders();
    await ask(new LocalLLMAdapter({ baseURL: 'http://localhost:18080', callerId: 'explicit' }));
    expect(seen[0][HEADER]).toBe('explicit');
  });

  // TEETH: unknown must stay unknown. Omitting the header keeps the receipt honestly
  // 'unattributed'; a placeholder would look like attribution and mean nothing.
  it('omits the header entirely when no identity is configured', async () => {
    const seen = captureHeaders();
    await ask(new LocalLLMAdapter({ baseURL: 'http://localhost:18080' }));
    expect(seen[0][HEADER]).toBeUndefined();
    expect(Object.keys(seen[0]).some((k) => k.toLowerCase() === 'x-holo-agent')).toBe(false);
  });

  it('ignores a blank or whitespace-only identity rather than sending an empty name', async () => {
    process.env.HOLO_INFERENCE_CALLER = '   ';
    const seen = captureHeaders();
    await ask(new LocalLLMAdapter({ baseURL: 'http://localhost:18080', callerId: '' }));
    expect(seen[0][HEADER]).toBeUndefined();
  });

  it('still sends Content-Type alongside the attribution', async () => {
    const seen = captureHeaders();
    await ask(new LocalLLMAdapter({ baseURL: 'http://localhost:18080', callerId: 'x' }));
    expect(seen[0]['Content-Type']).toBe('application/json');
  });
});
