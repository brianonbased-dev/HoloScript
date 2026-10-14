import { describe, expect, it, vi } from 'vitest';
import {
  InferenceRouter,
  isProviderAllowed,
  NEEDS_CREDITS_NOT_ENABLED,
  type ChatRequest,
  type InferenceProvider,
  type StreamEvent,
} from '../InferenceRouter';

function fake(name: string, available: boolean) {
  const stream = vi.fn(async function* (): AsyncGenerator<StreamEvent> {
    yield { type: 'text', payload: `from ${name}` };
    yield { type: 'done', payload: null };
  });
  const p: InferenceProvider = { name, isAvailable: async () => available, stream };
  return { p, stream };
}

async function collect(gen: AsyncGenerator<StreamEvent>) {
  const out: StreamEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

function routerWith(providers: InferenceProvider[], pro: InferenceProvider) {
  const r = new InferenceRouter();
  (r as unknown as { providers: InferenceProvider[] }).providers = providers;
  (r as unknown as { proProvider: InferenceProvider }).proProvider = pro;
  return r;
}

const base: ChatRequest = {
  messages: [{ role: 'user', content: 'hi' }] as ChatRequest['messages'],
};

describe('InferenceRouter local-only runtime gate (PR-5)', () => {
  it('classifies only ollama as local', () => {
    for (const n of ['fireworks', 'kimi', 'together', 'fleet']) {
      expect(isProviderAllowed(n, 'local-only')).toBe(false);
      expect(isProviderAllowed(n, 'any')).toBe(true);
    }
    expect(isProviderAllowed('ollama', 'local-only')).toBe(true);
  });

  it('routes a local-only request to ollama even when paid providers are up', async () => {
    const fw = fake('fireworks', true);
    const fleet = fake('fleet', true);
    const ollama = fake('ollama', true);
    const kimi = fake('kimi', true);
    const r = routerWith([fw.p, fleet.p, ollama.p], kimi.p);
    const ev = await collect(r.chat({ ...base, tier: 'pro', runtimePolicy: 'local-only' }));
    expect(ev[0]).toEqual({ type: 'text', payload: 'from ollama' });
    expect(fw.stream).not.toHaveBeenCalled();
    expect(fleet.stream).not.toHaveBeenCalled();
    expect(kimi.stream).not.toHaveBeenCalled();
  });

  it('refuses with needs_credits_not_enabled instead of falling through to paid/Vast', async () => {
    const fw = fake('fireworks', true);
    const fleet = fake('fleet', true);
    const ollama = fake('ollama', false);
    const r = routerWith([fw.p, fleet.p, ollama.p], fake('kimi', true).p);
    const ev = await collect(r.chat({ ...base, runtimePolicy: 'local-only' }));
    expect(ev[0]).toEqual({ type: 'error', payload: { ...NEEDS_CREDITS_NOT_ENABLED } });
    expect(ev[1]).toEqual({ type: 'done', payload: null });
    expect(fw.stream).not.toHaveBeenCalled();
    expect(fleet.stream).not.toHaveBeenCalled();
  });

  it('leaves default routing unchanged when no policy is set', async () => {
    process.env.BRITTNEY_PROVIDER = 'fireworks';
    const fw = fake('fireworks', true);
    const r = new InferenceRouter();
    (r as unknown as { providers: InferenceProvider[] }).providers = [fw.p, fake('ollama', true).p];
    const ev = await collect(r.chat(base));
    expect(ev[0]).toEqual({ type: 'text', payload: 'from fireworks' });
    delete process.env.BRITTNEY_PROVIDER;
  });
});
