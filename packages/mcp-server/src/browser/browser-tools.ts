/**
 * Browser Control MCP Tools for HoloScript
 * Enables AI agents to launch, control, and interact with HoloScript browser preview
 */

import { z } from 'zod';
import path from 'path';
import { browserPool } from './BrowserPool.js';
import type { ScreenshotOptions, BrowserExecuteResult } from './types.js';

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
          return (window as any).holoscriptRenderer?.initialized === true;
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
 * Export MCP tool definitions
 */
export const browserTools = {
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
};
