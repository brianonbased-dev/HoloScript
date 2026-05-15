import { describe, expect, it, vi } from 'vitest';
import { PuppeteerRenderer } from '../PuppeteerRenderer';

describe('PuppeteerRenderer', () => {
  it('does not force Chromium into single-process mode', () => {
    const renderer = new PuppeteerRenderer();
    const options = (renderer as unknown as { options: { args: string[] } }).options;

    expect(options.args).not.toContain('--single-process');
  });

  it('does not let page cleanup failures mask render failures', async () => {
    const renderer = new PuppeteerRenderer();
    const releasePage = (renderer as unknown as {
      releasePage: (page: {
        goto: (url: string) => Promise<void>;
        close: () => Promise<void>;
      }) => Promise<void>;
    }).releasePage.bind(renderer);

    const page = {
      goto: vi.fn().mockRejectedValue(new Error('detached frame')),
      close: vi.fn().mockResolvedValue(undefined),
    };

    await expect(releasePage(page)).resolves.toBeUndefined();
    expect(page.goto).toHaveBeenCalledWith('about:blank');
    expect(page.close).toHaveBeenCalledTimes(1);
  });

  it('generates render HTML with nested object parsing and a ready signal', () => {
    const renderer = new PuppeteerRenderer();
    const generateRenderHTML = (renderer as unknown as {
      generateRenderHTML: (code: string) => string;
    }).generateRenderHTML.bind(renderer);

    const html = generateRenderHTML(`
      object "Panel" {
        geometry: "cube"
        position: { x: 1, y: 2, z: -3 }
        scale: { x: 2, y: 1, z: 0.1 }
      }
    `);

    expect(html).toContain("__HOLOSCRIPT_RENDER_READY__");
    expect(html).toContain("extractBlocks(code, 'object')");
    expect(html).toContain("extractVector(body, 'position')");
  });

  it('continues to render readiness after a setContent navigation timeout', async () => {
    const renderer = new PuppeteerRenderer();
    const setRenderContent = (renderer as unknown as {
      setRenderContent: (
        page: {
          setContent: (html: string, options?: { waitUntil?: string; timeout?: number }) => Promise<void>;
          evaluate: (fn: (timeoutMs: number) => Promise<void>, timeoutMs: number) => Promise<void>;
        },
        html: string,
        waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2',
        timeout?: number
      ) => Promise<void>;
    }).setRenderContent.bind(renderer);

    const page = {
      setContent: vi.fn().mockRejectedValue(new Error('Navigation timeout of 30000 ms exceeded')),
      evaluate: vi.fn().mockResolvedValue(undefined),
    };

    await expect(setRenderContent(page, '<html></html>', 'domcontentloaded', 30_000)).resolves.toBeUndefined();
    expect(page.evaluate).toHaveBeenCalledTimes(1);
  });

  it('does not swallow non-navigation setContent failures', async () => {
    const renderer = new PuppeteerRenderer();
    const setRenderContent = (renderer as unknown as {
      setRenderContent: (
        page: {
          setContent: (html: string, options?: { waitUntil?: string; timeout?: number }) => Promise<void>;
          evaluate: (fn: (timeoutMs: number) => Promise<void>, timeoutMs: number) => Promise<void>;
        },
        html: string,
        waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2',
        timeout?: number
      ) => Promise<void>;
    }).setRenderContent.bind(renderer);

    const page = {
      setContent: vi.fn().mockRejectedValue(new Error('bad markup')),
      evaluate: vi.fn().mockResolvedValue(undefined),
    };

    await expect(setRenderContent(page, '<html></html>')).rejects.toThrow('bad markup');
    expect(page.evaluate).not.toHaveBeenCalled();
  });
});
