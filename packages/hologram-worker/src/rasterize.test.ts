import { describe, it, expect } from 'vitest';
import sharp from 'sharp';

import { prepareRasterPng } from './rasterize.js';

describe('prepareRasterPng', () => {
  it('writes a PNG and reports dimensions for a tiny image', async () => {
    const png = await sharp({
      create: { width: 8, height: 6, channels: 3, background: { r: 200, g: 100, b: 50 } },
    })
      .png()
      .toBuffer();

    const r = await prepareRasterPng(new Uint8Array(png), 'image');
    try {
      expect(r.width).toBe(8);
      expect(r.height).toBe(6);
      expect(r.pngPath).toMatch(/\.png$/);
    } finally {
      await r.dispose();
    }
  });
});
