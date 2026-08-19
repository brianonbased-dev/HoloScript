/**
 * Browser Control MCP Tools for HoloScript
 * Enables AI agents to launch, control, and interact with HoloScript browser preview
 */

import { z } from 'zod';
import path from 'path';
import { browserPool } from './BrowserPool.js';
import type { ScreenshotOptions, BrowserExecuteResult } from './types.js';
import { faraRun, FaraRunSchema } from './fara-dispatcher.js';

/**
 * Schema for browser_launch tool
 */
export const BrowserLaunchSchema = z.object({
  holoscriptFile: z.string().describe('Path to HoloScript file to preview'),
  width: z.number().optional().default(1280).describe('Browser viewport width'),
  height: z.number().optional().default(720).describe('Browser viewport height'),
  headless: z.boolean().optional().default(false).describe('Run in headless mode'),
});

/**
 * Schema for browser_execute tool
 */
export const BrowserExecuteSchema = z.object({
  sessionId: z.string().describe('Browser session ID from browser_launch'),
  script: z.string().describe('JavaScript code to execute in browser context'),
  captureConsole: z.boolean().optional().default(true).describe('Capture console logs'),
});

/**
 * Schema for browser_screenshot tool
 */
export const BrowserScreenshotSchema = z.object({
  sessionId: z.string().describe('Browser session ID from browser_launch'),
  outputPath: z.string().optional().describe('Optional output path for screenshot'),
  type: z.enum(['png', 'jpeg']).optional().default('png').describe('Screenshot format'),
  quality: z.number().min(0).max(100).optional().default(90).describe('JPEG quality (0-100)'),
  fullPage: z.boolean().optional().default(false).describe('Capture full page'),
});

const BrowserTypedActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), selector: z.string().min(1) }),
  z.object({ type: z.literal('fill'), selector: z.string().min(1), value: z.string() }),
  z.object({ type: z.literal('press'), selector: z.string().min(1), key: z.string().min(1) }),
  z.object({
    type: z.literal('scroll'),
    deltaX: z.number().finite().optional().default(0),
    deltaY: z.number().finite(),
  }),
  z.object({ type: z.literal('wait'), milliseconds: z.number().int().min(0).max(30_000) }),
]);

const LeasedBrowserOperationSchema = z.object({
  sessionId: z.string().min(1),
  leaseToken: z.string().min(32),
});

export const BrowserSessionSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('open'),
    ownerId: z.string().min(1),
    url: z.string().url(),
    width: z.number().int().min(320).max(7680).optional().default(1280),
    height: z.number().int().min(240).max(4320).optional().default(720),
    headless: z.boolean().optional().default(false),
    leaseTtlMs: z.number().int().min(10_000).max(3_600_000).optional().default(300_000),
    allowedOrigins: z.array(z.string().min(1)).max(32).optional(),
  }),
  LeasedBrowserOperationSchema.extend({ operation: z.literal('navigate'), url: z.string().url() }),
  LeasedBrowserOperationSchema.extend({
    operation: z.literal('act'),
    action: BrowserTypedActionSchema,
  }),
  LeasedBrowserOperationSchema.extend({
    // Read-only DOM/console/network instrumentation — never clicks, types, fills, scrolls,
    // or navigates. CDP/BiDi-backed read-only observation adapter (HOLOCLAW_BROWSER_
    // TERMINAL_GAP_MATRIX_2026-06-30.md P0 row 2): "Visible Chrome tabs, console, network,
    // DOM, screenshots, downloads, and authenticated app context are exposed as source-owned
    // read tools, then consent-gated action tools" — this is the read-tools half; 'act' above
    // remains the sole consent-gated mutation path on the same leased session.
    operation: z.literal('observe'),
    includeDom: z.boolean().optional().default(true),
    includeConsole: z.boolean().optional().default(true),
    includeNetwork: z.boolean().optional().default(true),
    consoleLimit: z.number().int().min(1).max(200).optional().default(50),
    networkLimit: z.number().int().min(1).max(200).optional().default(50),
    domTextLimit: z.number().int().min(0).max(20_000).optional().default(4000),
  }),
  LeasedBrowserOperationSchema.extend({
    operation: z.literal('screenshot'),
    type: z.enum(['png', 'jpeg']).optional().default('png'),
    quality: z.number().int().min(0).max(100).optional().default(90),
    fullPage: z.boolean().optional().default(false),
  }),
  LeasedBrowserOperationSchema.extend({ operation: z.literal('takeover') }),
  LeasedBrowserOperationSchema.extend({
    operation: z.literal('resume'),
    expectedControlEpoch: z.number().int().min(1),
  }),
  LeasedBrowserOperationSchema.extend({ operation: z.literal('status') }),
  LeasedBrowserOperationSchema.extend({ operation: z.literal('close') }),
]);

function assertBrowserSessionProtocol(url: string): void {
  const protocol = new URL(url).protocol;
  if (!['http:', 'https:', 'data:', 'file:'].includes(protocol)) {
    throw new Error(`Browser session protocol is not allowed: ${protocol}`);
  }
}

function browserOrigin(url: string): string {
  const parsed = new URL(url);
  return parsed.origin === 'null' ? parsed.protocol : parsed.origin;
}

function assertBrowserSessionOrigin(url: string, allowedOrigins: string[]): void {
  const origin = browserOrigin(url);
  if (!allowedOrigins.includes(origin)) {
    throw new Error(`Browser session origin is not leased: ${origin}`);
  }
}

interface DomObservation {
  url: string;
  title: string;
  bodyText: string;
  elementCount: number;
}

/**
 * Best-effort DOM read for the 'observe' operation. Defensive against a page object
 * missing a method entirely (not just a rejecting promise) so a partial test double or a
 * future Playwright API change degrades to empty fields instead of throwing the whole
 * observe call — observation must never be able to break the session it's watching.
 */
async function buildDomObservation(
  page: { url(): string; title?: () => Promise<string>; evaluate?: <T>(fn: () => T) => Promise<T> },
  domTextLimit: number
): Promise<DomObservation> {
  const url = page.url();
  const title = typeof page.title === 'function' ? await page.title().catch(() => '') : '';
  const bodyText =
    typeof page.evaluate === 'function'
      ? await page
          .evaluate(() => document.body?.innerText ?? '')
          .then((text) => text.slice(0, domTextLimit))
          .catch(() => '')
      : '';
  const elementCount =
    typeof page.evaluate === 'function'
      ? await page
          .evaluate(() => document.querySelectorAll('*').length)
          .catch(() => 0)
      : 0;
  return { url, title, bodyText, elementCount };
}

/**
 * Sovereign managed-browser session lifecycle. One narrow MCP surface owns the
 * full open -> navigate -> observe -> act -> screenshot -> takeover -> resume -> close
 * sequence while the existing preview tools remain backward compatible.
 */
export async function browserSession(args: z.infer<typeof BrowserSessionSchema>) {
  if (args.operation === 'open') {
    assertBrowserSessionProtocol(args.url);
    const initialOrigin = browserOrigin(args.url);
    const allowedOrigins = args.allowedOrigins?.length ? args.allowedOrigins : [initialOrigin];
    if (!allowedOrigins.includes(initialOrigin)) {
      throw new Error(`Browser session initial origin is not leased: ${initialOrigin}`);
    }
    const { session, leaseToken } = await browserPool.createLeasedSession({
      ownerId: args.ownerId,
      leaseTtlMs: args.leaseTtlMs,
      allowedOrigins,
      config: {
        width: args.width,
        height: args.height,
        headless: args.headless,
      },
    });
    try {
      await session.page.goto(args.url, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      await browserPool.destroySession(session.id);
      throw error;
    }
    const receipt = browserPool.recordOperation(session, 'open', { url: session.page.url() });
    return {
      success: true,
      operation: args.operation,
      leaseToken,
      session: browserPool.snapshot(session),
      receipt,
    };
  }

  const session = browserPool.requireLease(args.sessionId, args.leaseToken, {
    allowHumanControl: ['resume', 'status', 'close'].includes(args.operation),
  });

  if (args.operation === 'navigate') {
    assertBrowserSessionProtocol(args.url);
    assertBrowserSessionOrigin(args.url, session.allowedOrigins);
    const beforeUrl = session.page.url();
    await session.page.goto(args.url, { waitUntil: 'domcontentloaded' });
    const receipt = browserPool.recordOperation(session, 'navigate', {
      beforeUrl,
      afterUrl: session.page.url(),
    });
    return {
      success: true,
      operation: args.operation,
      session: browserPool.snapshot(session),
      receipt,
    };
  }

  if (args.operation === 'observe') {
    const dom = args.includeDom ? await buildDomObservation(session.page, args.domTextLimit) : undefined;
    const consoleEntries = args.includeConsole
      ? session.observation.console.slice(-args.consoleLimit)
      : undefined;
    const networkEntries = args.includeNetwork
      ? session.observation.network.slice(-args.networkLimit)
      : undefined;
    const receipt = browserPool.recordOperation(session, 'observe', {
      includeDom: args.includeDom,
      includeConsole: args.includeConsole,
      includeNetwork: args.includeNetwork,
      consoleEntryCount: consoleEntries?.length ?? 0,
      networkEntryCount: networkEntries?.length ?? 0,
      cdpAttached: Boolean(session.cdpSession),
      mutatesPage: false,
    });
    return {
      success: true,
      operation: args.operation,
      permissionEnvelope: 'read_only',
      session: browserPool.snapshot(session),
      dom,
      console: consoleEntries,
      network: networkEntries,
      receipt,
    };
  }

  if (args.operation === 'act') {
    const beforeUrl = session.page.url();
    const action = args.action;
    if (action.type === 'click') await session.page.click(action.selector);
    else if (action.type === 'fill') await session.page.fill(action.selector, action.value);
    else if (action.type === 'press') await session.page.press(action.selector, action.key);
    else if (action.type === 'scroll') await session.page.mouse.wheel(action.deltaX, action.deltaY);
    else await session.page.waitForTimeout(action.milliseconds);
    const receipt = browserPool.recordOperation(session, 'act', {
      action: action.type,
      beforeUrl,
      afterUrl: session.page.url(),
    });
    return {
      success: true,
      operation: args.operation,
      session: browserPool.snapshot(session),
      receipt,
    };
  }

  if (args.operation === 'screenshot') {
    const screenshot = await session.page.screenshot({
      type: args.type,
      quality: args.type === 'jpeg' ? args.quality : undefined,
      fullPage: args.fullPage,
    });
    const receipt = browserPool.recordOperation(session, 'screenshot', {
      format: args.type,
      size: screenshot.length,
    });
    return {
      success: true,
      operation: args.operation,
      session: browserPool.snapshot(session),
      image: `data:image/${args.type};base64,${screenshot.toString('base64')}`,
      receipt,
    };
  }

  if (args.operation === 'takeover') {
    const result = browserPool.takeOver(args.sessionId, args.leaseToken);
    return { success: true, operation: args.operation, ...result };
  }
  if (args.operation === 'resume') {
    assertBrowserSessionOrigin(session.page.url(), session.allowedOrigins);
    const result = browserPool.resume(args.sessionId, args.leaseToken, args.expectedControlEpoch);
    return { success: true, operation: args.operation, ...result };
  }
  if (args.operation === 'status') {
    return {
      success: true,
      operation: args.operation,
      session: browserPool.snapshot(session),
      lastReceipt: session.receipts.at(-1) ?? null,
    };
  }

  const closed = await browserPool.closeLeasedSession(args.sessionId, args.leaseToken);
  return { success: closed.closed && !closed.residue, operation: args.operation, ...closed };
}

/**
 * Launch HoloScript preview in browser
 *
 * This tool opens a browser window showing the HoloScript file in the 3D preview.
 * Returns a session ID that can be used with other browser tools.
 */
export async function browserLaunch(args: z.infer<typeof BrowserLaunchSchema>) {
  try {
    // Create browser session
    const session = await browserPool.createSession({
      width: args.width,
      height: args.height,
      headless: args.headless,
    });

    // Determine the preview URL
    // Resolve relative to HoloScript root (up 2 dirs from packages/mcp-server)
    const previewUrl = args.holoscriptFile.startsWith('http')
      ? args.holoscriptFile
      : `file://${path.resolve(__dirname, '../../../../examples/browser-preview.html')}?file=${encodeURIComponent(args.holoscriptFile)}`;

    // Navigate to preview
    await session.page.goto(previewUrl, {
      waitUntil: args.holoscriptFile.startsWith('http') ? 'domcontentloaded' : 'networkidle',
    });

    // Wait for Three.js scene to initialize
    if (!args.holoscriptFile.startsWith('http')) {
      await session.page.waitForFunction(
        () => {
          return (
            (window as unknown as { holoscriptRenderer?: { initialized: boolean } })
              .holoscriptRenderer?.initialized === true
          );
        },
        { timeout: 10000 }
      );
    }

    return {
      success: true,
      sessionId: session.id,
      url: previewUrl,
      viewport: {
        width: args.width,
        height: args.height,
      },
      message: `HoloScript preview launched: ${args.holoscriptFile}`,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Execute JavaScript in the browser context
 *
 * This tool allows agents to run arbitrary JavaScript in the HoloScript preview
 * to inspect scene state, validate traits, or interact with the 3D environment.
 */
export async function browserExecute(args: z.infer<typeof BrowserExecuteSchema>) {
  try {
    const session = browserPool.getSession(args.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${args.sessionId}`);
    }

    const logs: string[] = [];

    // Capture console if requested
    if (args.captureConsole) {
      session.page.on('console', (msg) => logs.push(msg.text()));
    }

    // Execute script
    const result = await session.page.evaluate(args.script);

    return {
      success: true,
      result,
      logs: args.captureConsole ? logs : undefined,
    };
  } catch (error) {
    const executeResult: BrowserExecuteResult = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(executeResult, null, 2),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Take a screenshot of the HoloScript preview
 *
 * This tool captures the current state of the 3D preview as an image.
 * Useful for visual regression testing and debugging.
 */
export async function browserScreenshot(args: z.infer<typeof BrowserScreenshotSchema>) {
  try {
    const session = browserPool.getSession(args.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${args.sessionId}`);
    }

    const screenshotOptions: ScreenshotOptions = {
      type: args.type,
      quality: args.type === 'jpeg' ? args.quality : undefined,
      fullPage: args.fullPage,
    };

    // Take screenshot
    const screenshot = await session.page.screenshot({
      ...screenshotOptions,
      path: args.outputPath,
    });

    // Convert to base64 if no output path
    const base64 = args.outputPath ? undefined : screenshot.toString('base64');

    return {
      success: true,
      sessionId: args.sessionId,
      outputPath: args.outputPath,
      format: args.type,
      size: screenshot.length,
      base64: base64 ? `data:image/${args.type};base64,${base64}` : undefined,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Run Fara-7B visual computer-use agent in an existing browser session.
 *
 * Fara-7B (https://github.com/microsoft/fara) is a 7B-parameter, MIT-licensed,
 * on-device computer-use agent. It observes the browser via screenshots and
 * predicts mouse/keyboard actions to complete a natural-language goal.
 * All screenshots stay on-device — pixel sovereignty guaranteed.
 *
 * Requires Ollama running locally with the Fara GGUF model:
 *   ollama pull hf.co/bartowski/microsoft_Fara-7B-GGUF:Q4_K_M
 */
export async function holoshellFaraStep(args: z.infer<typeof FaraRunSchema>) {
  const receipt = await faraRun({
    sessionId: args.sessionId,
    goal: args.goal,
    policy: {
      allowedDomains: args.allowedDomains,
      blockedDomains: args.blockedDomains,
      maxSteps: args.maxSteps,
      maxDurationMs: args.maxDurationMs,
    },
    faraConfig: {
      endpoint: args.endpoint,
      model: args.model,
    },
  });

  return receipt;
}

/**
 * Export MCP tool definitions
 */
export const browserTools = {
  browser_session: {
    description: 'Operate a leased, takeover-safe sovereign browser session with causal receipts',
    inputSchema: BrowserSessionSchema,
    handler: browserSession,
  },
  browser_launch: {
    description: 'Launch HoloScript file in browser preview with AI control',
    inputSchema: BrowserLaunchSchema,
    handler: browserLaunch,
  },
  browser_execute: {
    description: 'Execute JavaScript in browser to inspect or control HoloScript scene',
    inputSchema: BrowserExecuteSchema,
    handler: browserExecute,
  },
  browser_screenshot: {
    description: 'Take screenshot of HoloScript preview for visual validation',
    inputSchema: BrowserScreenshotSchema,
    handler: browserScreenshot,
  },
  holoshell_fara_step: {
    description:
      'Run Fara-7B visual computer-use agent to accomplish a browser goal. Fara observes the ' +
      'live browser via screenshots and executes mouse/keyboard actions until done. ' +
      'Pixel-sovereign: all processing stays on-device via local Ollama.',
    inputSchema: FaraRunSchema,
    handler: holoshellFaraStep,
  },
};
