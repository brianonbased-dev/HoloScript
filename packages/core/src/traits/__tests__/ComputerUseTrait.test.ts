/**
 * ComputerUseTrait.test.ts — v4.0
 * Uses injectable mock page factory — no Playwright import needed.
 */

import { describe, it, expect, vi } from 'vitest';
import { computerUseHandler } from '../ComputerUseTrait';
import type { ComputerUseConfig, PlaywrightPageLike } from '../ComputerUseTrait';

function makeCtx() {
  const events: { type: string; payload: unknown }[] = [];
  return {
    emit: (type: string, payload: unknown) => events.push({ type, payload }),
    events,
    of: (type: string) => events.filter(e => e.type === type),
  };
}

const BASE_CONFIG: ComputerUseConfig = {
  headless: true,
  viewport_width: 1280,
  viewport_height: 720,
  user_agent: 'HoloScript-Agent/4.0',
  max_actions_per_session: 100,
  allowed_domains: [],
  allow_shell: false,
  screenshot_quality: 80,
  default_timeout_ms: 5000,
  verbose: false,
};

/** Build a mock page that records calls */
function makeMockPage(): PlaywrightPageLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    goto: async (url: string) => { calls.push(`goto:${url}`); return { url: () => url }; },
    click: async (sel: string) => { calls.push(`click:${sel}`); },
    fill: async (sel: string, text: string) => { calls.push(`fill:${sel}:${text}`); },
    type: async (sel: string, text: string) => { calls.push(`type:${sel}:${text}`); },
    screenshot: async () => { calls.push('screenshot'); return Buffer.from('fake-png-data'); },
    $$: async (sel: string) => { calls.push(`$$:${sel}`); return [{}]; },
    $: async (sel: string) => { calls.push(`$:${sel}`); return {}; },
    textContent: async (sel: string) => { calls.push(`textContent:${sel}`); return `content of ${sel}`; },
    evaluate: async (fn: string) => { calls.push(`evaluate:${fn}`); return 'eval-result'; },
    waitForSelector: async (sel: string) => { calls.push(`waitForSelector:${sel}`); return {}; },
    url: () => 'https://example.com',
    title: async () => 'Example Page',
    close: async () => { calls.push('close'); },
  } as PlaywrightPageLike & { calls: string[] };
}

function attach(extra: Partial<ComputerUseConfig> = {}) {
  const node = {} as any;
  const ctx = makeCtx();
  const config = { ...BASE_CONFIG, ...extra };
  computerUseHandler.onAttach(node, config, ctx);
  return { node, ctx, config };
}

async function openBrowserWithMock(node: any, ctx: any, config: ComputerUseConfig) {
  const mockPage = makeMockPage();
  // Inject the factory before opening
  computerUseHandler.onEvent(node, config, ctx, {
    type: 'computer_use_inject_factory',
    payload: { factory: async () => mockPage },
  });
  computerUseHandler.onEvent(node, config, ctx, { type: 'browser_open', payload: { browserId: 'test-browser' } });
  // Wait for async page init
  await new Promise(r => setTimeout(r, 50));
  return { mockPage };
}

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('ComputerUseTrait — onAttach', () => {
  it('emits computer_use_ready', () => {
    const { ctx } = attach();
    expect(ctx.of('computer_use_ready').length).toBe(1);
  });

  it('initializes empty sessions', () => {
    const { node } = attach();
    expect(node.__computerUseState.sessions.size).toBe(0);
  });
});

// ─── browser_open ─────────────────────────────────────────────────────────────

describe('ComputerUseTrait — browser_open', () => {
  it('creates a browser session', async () => {
    const { node, ctx, config } = attach();
    await openBrowserWithMock(node, ctx, config);
    expect(node.__computerUseState.sessions.has('test-browser')).toBe(true);
    expect(ctx.of('browser_ready').length).toBe(1);
  });

  it('auto-navigates when url provided in open', async () => {
    const { node, ctx, config } = attach();
    const mockPage = makeMockPage();
    computerUseHandler.onEvent(node, config, ctx, { type: 'computer_use_inject_factory', payload: { factory: async () => mockPage } });
    computerUseHandler.onEvent(node, config, ctx, { type: 'browser_open', payload: { browserId: 'b2', url: 'https://holoscript.io' } });
    await new Promise(r => setTimeout(r, 100));
    expect(mockPage.calls).toContain('goto:https://holoscript.io');
  });

  it('increments totalSessions', async () => {
    const { node, ctx, config } = attach();
    await openBrowserWithMock(node, ctx, config);
    expect(node.__computerUseState.totalSessions).toBe(1);
  });
});

// ─── browser_action ───────────────────────────────────────────────────────────

describe('ComputerUseTrait — browser_action', () => {
  it('executes navigate action', async () => {
    const { node, ctx, config } = attach();
    const { mockPage } = await openBrowserWithMock(node, ctx, config);
    computerUseHandler.onEvent(node, config, ctx, {
      type: 'browser_action',
      payload: { browserId: 'test-browser', action: { type: 'navigate', url: 'https://example.com' } },
    });
    await new Promise(r => setTimeout(r, 50));
    expect(mockPage.calls).toContain('goto:https://example.com');
    expect(ctx.of('browser_navigated').length).toBe(1);
  });

  it('executes click action', async () => {
    const { node, ctx, config } = attach();
    const { mockPage } = await openBrowserWithMock(node, ctx, config);
    computerUseHandler.onEvent(node, config, ctx, {
      type: 'browser_action',
      payload: { browserId: 'test-browser', action: { type: 'click', selector: '#buy-button' } },
    });
    await new Promise(r => setTimeout(r, 50));
    expect(mockPage.calls).toContain('click:#buy-button');
    expect(ctx.of('action_executed').length).toBe(1);
  });

  it('executes type action', async () => {
    const { node, ctx, config } = attach();
    const { mockPage } = await openBrowserWithMock(node, ctx, config);
    computerUseHandler.onEvent(node, config, ctx, {
      type: 'browser_action',
      payload: { browserId: 'test-browser', action: { type: 'type', selector: '#search', text: 'holoscript' } },
    });
    await new Promise(r => setTimeout(r, 50));
    expect(mockPage.calls.some(c => c.includes('fill:#search:holoscript'))).toBe(true);
  });

  it('executes screenshot action', async () => {
    const { node, ctx, config } = attach();
    const { mockPage } = await openBrowserWithMock(node, ctx, config);
    computerUseHandler.onEvent(node, config, ctx, {
      type: 'browser_action',
      payload: { browserId: 'test-browser', action: { type: 'screenshot' } },
    });
    await new Promise(r => setTimeout(r, 50));
    expect(mockPage.calls).toContain('screenshot');
    const r = ctx.of('action_executed').find((e: any) => e.payload?.action === 'screenshot');
    expect(r).toBeDefined();
  });

  it('executes extract_text action', async () => {
    const { node, ctx, config } = attach();
    const { mockPage } = await openBrowserWithMock(node, ctx, config);
    computerUseHandler.onEvent(node, config, ctx, {
      type: 'browser_action',
      payload: { browserId: 'test-browser', action: { type: 'extract_text', selector: '.price' } },
    });
    await new Promise(r => setTimeout(r, 50));
    expect(mockPage.calls.some(c => c.startsWith('textContent:.price'))).toBe(true);
  });

  it('emits computer_use_error for actions on nonexistent session', () => {
    const { node, ctx, config } = attach();
    computerUseHandler.onEvent(node, config, ctx, {
      type: 'browser_action',
      payload: { browserId: 'ghost', action: { type: 'click', selector: '#x' } },
    });
    expect(ctx.of('computer_use_error').length).toBe(1);
  });

  it('enforces max_actions_per_session', async () => {
    const { node, ctx, config } = attach({ max_actions_per_session: 2 });
    await openBrowserWithMock(node, ctx, config);
    for (let i = 0; i < 5; i++) {
      computerUseHandler.onEvent(node, config, ctx, {
        type: 'browser_action',
        payload: { browserId: 'test-browser', action: { type: 'click', selector: `#btn${i}` } },
      });
    }
    await new Promise(r => setTimeout(r, 100));
    expect(ctx.of('computer_use_error').some((e: any) => e.payload.error.includes('max_actions'))).toBe(true);
  });

  it('enforces domain allowlist', async () => {
    const { node, ctx, config } = attach({ allowed_domains: ['holoscript.io'] });
    await openBrowserWithMock(node, ctx, config);
    computerUseHandler.onEvent(node, config, ctx, {
      type: 'browser_action',
      payload: { browserId: 'test-browser', action: { type: 'navigate', url: 'https://evil.com/steal' } },
    });
    await new Promise(r => setTimeout(r, 50));
    expect(ctx.of('computer_use_error').some((e: any) => e.payload.error.includes('Domain not allowed'))).toBe(true);
  });
});

// ─── browser_run_sequence ─────────────────────────────────────────────────────

describe('ComputerUseTrait — browser_run_sequence', () => {
  it('runs a sequence of actions', async () => {
    const { node, ctx, config } = attach();
    const { mockPage } = await openBrowserWithMock(node, ctx, config);
    computerUseHandler.onEvent(node, config, ctx, {
      type: 'browser_run_sequence',
      payload: {
        browserId: 'test-browser',
        actions: [
          { type: 'navigate', url: 'https://example.com' },
          { type: 'click', selector: '#btn' },
          { type: 'screenshot' },
        ],
      },
    });
    await new Promise(r => setTimeout(r, 150));
    expect(ctx.of('sequence_complete').length).toBe(1);
    expect((ctx.of('sequence_complete')[0].payload as any).count).toBe(3);
  });
});

// ─── browser_list ─────────────────────────────────────────────────────────────

describe('ComputerUseTrait — browser_list', () => {
  it('lists open sessions', async () => {
    const { node, ctx, config } = attach();
    await openBrowserWithMock(node, ctx, config);
    computerUseHandler.onEvent(node, config, ctx, { type: 'browser_list' });
    const sessions = (ctx.of('browser_sessions')[0].payload as any).sessions;
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe('test-browser');
  });
});

// ─── browser_close ────────────────────────────────────────────────────────────

describe('ComputerUseTrait — browser_close', () => {
  it('closes a browser session', async () => {
    const { node, ctx, config } = attach();
    await openBrowserWithMock(node, ctx, config);
    computerUseHandler.onEvent(node, config, ctx, { type: 'browser_close', payload: { browserId: 'test-browser' } });
    await new Promise(r => setTimeout(r, 50));
    expect(node.__computerUseState.sessions.has('test-browser')).toBe(false);
    expect(ctx.of('browser_closed').length).toBe(1);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('ComputerUseTrait — onDetach', () => {
  it('emits computer_use_stopped and clears state', () => {
    const { node, ctx, config } = attach();
    computerUseHandler.onDetach(node, config, ctx);
    expect(ctx.of('computer_use_stopped').length).toBe(1);
    expect(node.__computerUseState).toBeUndefined();
  });
});
