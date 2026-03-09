/**
 * ComputerUseTrait — v4.0
 *
 * Browser automation + system access for HoloScript agents.
 * Direct competitor to OpenClaw's agent-browser skill.
 *
 * Powered by Playwright (already in dev-deps via ai-validator).
 * Vision-aware: screenshots → LLM → understand & act.
 *
 * Events emitted:
 *  browser_ready         { node, browserId }
 *  browser_navigated     { node, browserId, url, title }
 *  screenshot_captured   { node, browserId, dataUrl, width, height }
 *  element_found         { node, browserId, selector, count }
 *  element_not_found     { node, browserId, selector }
 *  text_extracted        { node, browserId, text, selector }
 *  action_executed       { node, browserId, action, result }
 *  browser_closed        { node, browserId }
 *  computer_use_error    { node, browserId, error }
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type BrowserAction =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'type'; selector: string; text: string }
  | { type: 'screenshot' }
  | { type: 'extract_text'; selector: string }
  | { type: 'wait'; ms: number }
  | { type: 'wait_for'; selector: string; timeout_ms?: number }
  | { type: 'scroll'; x: number; y: number }
  | { type: 'evaluate'; script: string }
  | { type: 'close' };

export interface ComputerUseConfig {
  /** Run browser headless */
  headless: boolean;
  /** Viewport width */
  viewport_width: number;
  /** Viewport height */
  viewport_height: number;
  /** User agent */
  user_agent: string;
  /** Max actions per session */
  max_actions_per_session: number;
  /** Allowed domains (empty = all) */
  allowed_domains: string[];
  /** Enable sandboxed shell commands */
  allow_shell: boolean;
  /** Screenshot quality (0-100) */
  screenshot_quality: number;
  /** Default timeout for element waits */
  default_timeout_ms: number;
  /** Log all actions */
  verbose: boolean;
}

export interface BrowserSession {
  id: string;
  createdAt: number;
  actionCount: number;
  currentUrl: string;
  /** The actual Playwright page or a mock for testing */
  page: PlaywrightPageLike | null;
}

/** Minimal Playwright-compatible page interface for testability */
export interface PlaywrightPageLike {
  goto(url: string, opts?: object): Promise<{ url(): string } | null>;
  click(selector: string, opts?: object): Promise<void>;
  fill(selector: string, text: string): Promise<void>;
  type(selector: string, text: string, opts?: object): Promise<void>;
  screenshot(opts?: object): Promise<Buffer | Uint8Array>;
  $$(selector: string): Promise<unknown[]>;
  $(selector: string): Promise<unknown | null>;
  textContent(selector: string): Promise<string | null>;
  evaluate<T>(fn: string | ((arg?: unknown) => T), arg?: unknown): Promise<T>;
  waitForSelector(selector: string, opts?: object): Promise<unknown>;
  url(): string;
  title(): Promise<string>;
  close(): Promise<void>;
}

export interface ComputerUseState {
  isReady: boolean;
  sessions: Map<string, BrowserSession>;
  totalSessions: number;
  totalActions: number;
  /** Factory for creating pages (injected for testability) */
  pageFactory: PageFactory | null;
}

export type PageFactory = () => Promise<PlaywrightPageLike>;

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: ComputerUseConfig = {
  headless: true,
  viewport_width: 1280,
  viewport_height: 720,
  user_agent: 'HoloScript-Agent/4.0 (compatible; AppleWebKit)',
  max_actions_per_session: 100,
  allowed_domains: [],
  allow_shell: false,
  screenshot_quality: 80,
  default_timeout_ms: 10_000,
  verbose: false,
};

// ─── Domain guard ─────────────────────────────────────────────────────────────

function isDomainAllowed(url: string, allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return true;
  try {
    const { hostname } = new URL(url);
    return allowedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const computerUseHandler = {
  defaultConfig: DEFAULT_CONFIG,

  onAttach(node: any, _config: ComputerUseConfig, ctx: any): void {
    const state: ComputerUseState = {
      isReady: true,
      sessions: new Map(),
      totalSessions: 0,
      totalActions: 0,
      pageFactory: null,
    };
    node.__computerUseState = state;
    ctx.emit('computer_use_ready', { node });
  },

  onDetach(node: any, _config: ComputerUseConfig, ctx: any): void {
    const state: ComputerUseState | undefined = node.__computerUseState;
    if (!state) return;
    // Close all open sessions
    const closures = [...state.sessions.values()].map((s) => s.page?.close().catch(() => {}));
    Promise.allSettled(closures ?? []);
    ctx.emit('computer_use_stopped', {
      node,
      totalSessions: state.totalSessions,
      totalActions: state.totalActions,
    });
    delete node.__computerUseState;
  },

  onEvent(node: any, config: ComputerUseConfig, ctx: any, event: any): void {
    const state: ComputerUseState | undefined = node.__computerUseState;
    if (!state?.isReady) return;

    switch (event.type) {
      case 'browser_open':
        this._openBrowser(state, node, config, ctx, event.payload);
        break;
      case 'browser_action':
        this._executeAction(state, node, config, ctx, event.payload);
        break;
      case 'browser_run_sequence':
        this._runSequence(state, node, config, ctx, event.payload);
        break;
      case 'browser_close': {
        const session = state.sessions.get(event.payload?.browserId);
        if (session) {
          session.page?.close().catch(() => {});
          state.sessions.delete(session.id);
          ctx.emit('browser_closed', { node, browserId: session.id });
        }
        break;
      }
      case 'browser_list':
        ctx.emit('browser_sessions', {
          node,
          sessions: [...state.sessions.values()].map((s) => ({
            id: s.id,
            createdAt: s.createdAt,
            actionCount: s.actionCount,
            currentUrl: s.currentUrl,
          })),
        });
        break;
      case 'computer_use_inject_factory':
        // For testing: inject a mock page factory
        state.pageFactory = event.payload?.factory ?? null;
        break;
    }
  },

  onUpdate(_node: any, _config: ComputerUseConfig, _ctx: any, _dt: number): void {
    /* async */
  },

  _openBrowser(
    state: ComputerUseState,
    node: any,
    config: ComputerUseConfig,
    ctx: any,
    payload: any
  ): void {
    const browserId = payload?.browserId ?? `browser_${Date.now()}`;
    state.totalSessions++;

    const session: BrowserSession = {
      id: browserId,
      createdAt: Date.now(),
      actionCount: 0,
      currentUrl: 'about:blank',
      page: null,
    };
    state.sessions.set(browserId, session);

    this._initPage(state, config, session)
      .then((page) => {
        session.page = page;
        ctx.emit('browser_ready', { node, browserId });
        if (payload?.url) {
          this._executeAction(state, node, config, ctx, {
            browserId,
            action: { type: 'navigate', url: payload.url },
          });
        }
      })
      .catch((err: Error) => {
        state.sessions.delete(browserId);
        ctx.emit('computer_use_error', {
          node,
          browserId,
          error: `Failed to open browser: ${err.message}`,
        });
      });
  },

  async _initPage(
    state: ComputerUseState,
    config: ComputerUseConfig,
    _session: BrowserSession
  ): Promise<PlaywrightPageLike> {
    // Use injected factory (for testing) or real Playwright
    if (state.pageFactory) return state.pageFactory();

    try {
      const { chromium } = await import('playwright');
      const browser = await chromium.launch({
        headless: config.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage({
        viewport: { width: config.viewport_width, height: config.viewport_height },
        userAgent: config.user_agent,
      });
      return page as unknown as PlaywrightPageLike;
    } catch {
      throw new Error('Playwright not available. Install with: npm install playwright');
    }
  },

  _executeAction(
    state: ComputerUseState,
    node: any,
    config: ComputerUseConfig,
    ctx: any,
    payload: any
  ): void {
    const session = state.sessions.get(payload?.browserId);
    if (!session?.page) {
      ctx.emit('computer_use_error', {
        node,
        browserId: payload?.browserId,
        error: 'No open browser session',
      });
      return;
    }
    if (session.actionCount >= config.max_actions_per_session) {
      ctx.emit('computer_use_error', {
        node,
        browserId: session.id,
        error: 'max_actions_per_session reached',
      });
      return;
    }

    session.actionCount++;
    state.totalActions++;

    this._doAction(session.page, config, payload?.action ?? {})
      .then((result) => {
        if ((payload?.action as BrowserAction)?.type === 'navigate') {
          session.currentUrl = (payload.action as { url: string }).url;
          session.page!.title().then((title) => {
            ctx.emit('browser_navigated', {
              node,
              browserId: session.id,
              url: session.currentUrl,
              title,
            });
          });
        } else {
          ctx.emit('action_executed', {
            node,
            browserId: session.id,
            action: payload?.action?.type,
            result,
          });
        }
      })
      .catch((err: Error) => {
        ctx.emit('computer_use_error', { node, browserId: session.id, error: err.message });
      });
  },

  async _doAction(
    page: PlaywrightPageLike,
    config: ComputerUseConfig,
    action: BrowserAction
  ): Promise<unknown> {
    switch (action.type) {
      case 'navigate': {
        if (
          config.allowed_domains.length > 0 &&
          !isDomainAllowed(action.url, config.allowed_domains)
        ) {
          throw new Error(`Domain not allowed: ${new URL(action.url).hostname}`);
        }
        await page.goto(action.url, { timeout: config.default_timeout_ms });
        return { url: action.url };
      }
      case 'click':
        await page.click(action.selector, { timeout: config.default_timeout_ms });
        return { clicked: action.selector };
      case 'type':
        await page.fill(action.selector, action.text);
        return { typed: action.text.length };
      case 'screenshot': {
        const buf = await page.screenshot({ type: 'jpeg', quality: config.screenshot_quality });
        const dataUrl = `data:image/jpeg;base64,${Buffer.from(buf).toString('base64')}`;
        return { dataUrl, size: buf.length };
      }
      case 'extract_text': {
        const text = await page.textContent(action.selector);
        return { text: text ?? '' };
      }
      case 'wait':
        await new Promise((r) => setTimeout(r, action.ms));
        return { waited: action.ms };
      case 'wait_for':
        await page.waitForSelector(action.selector, {
          timeout: action.timeout_ms ?? config.default_timeout_ms,
        });
        return { found: action.selector };
      case 'evaluate': {
        const result = await page.evaluate(action.script);
        return { result };
      }
      case 'close':
        await page.close();
        return { closed: true };
      default:
        throw new Error(`Unknown action type: ${(action as any).type}`);
    }
  },

  _runSequence(
    state: ComputerUseState,
    node: any,
    config: ComputerUseConfig,
    ctx: any,
    payload: any
  ): void {
    const { browserId, actions = [] } = payload ?? {};
    const session = state.sessions.get(browserId);
    if (!session?.page) {
      ctx.emit('computer_use_error', { node, browserId, error: 'No open browser session' });
      return;
    }

    const run = async () => {
      for (const action of actions) {
        await this._doAction(session.page!, config, action);
        session.actionCount++;
        state.totalActions++;
        ctx.emit('action_executed', { node, browserId, action: action.type, result: 'ok' });
      }
      ctx.emit('sequence_complete', { node, browserId, count: actions.length });
    };

    run().catch((err: Error) => {
      ctx.emit('computer_use_error', { node, browserId, error: err.message });
    });
  },
} as const;
