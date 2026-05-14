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
});
