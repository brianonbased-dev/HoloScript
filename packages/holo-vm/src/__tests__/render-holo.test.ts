/**
 * renderHolo end-to-end: `.holo` source text → native pixels in ONE call (D.083).
 *
 * This is the entry that closes the native pipeline. The native-renderer e2e proves
 * bytecode→VM→pixels; core's parser/compiler prove text→bytecode. renderHolo joins
 * them: it parses real `.holo` source, compiles it through HolobCompiler, executes
 * the bytecode in the HoloVM, and rasterizes the resulting world natively — no
 * three.js, no react, no cannon anywhere on the path.
 */
import { describe, it, expect } from 'vitest';
import { renderHolo } from '../render/render-holo';
import type { RGBA } from '../render/native-renderer';

const RED: RGBA = { r: 255, g: 0, b: 0, a: 255 };
const CLEAR: RGBA = { r: 18, g: 18, b: 22, a: 255 };

describe('renderHolo: .holo text → native pixels (one call)', () => {
  it('parses, compiles, executes, and natively rasterizes a single object', async () => {
    const source = `composition "NativeChain" {
      object "Hero" {
        shape: "cube"
        position: [0, 0, 0]
        color: "#ff0000"
      }
    }`;

    const { framebuffer, stats, entityCount, width, height } = await renderHolo(source, {
      width: 64,
      height: 64,
      camera: { pixelsPerUnit: 8 },
      clear: CLEAR,
    });

    expect(width).toBe(64);
    expect(height).toBe(64);
    // The VM materialized exactly the one object the source declared...
    expect(entityCount).toBe(1);
    // ...and the native renderer drew it.
    expect(stats.entitiesDrawn).toBe(1);
    // Object sits at world origin → framebuffer center; material "#ff0000" → red pixels.
    expect(framebuffer.pixel(32, 32)).toEqual(RED);
    // Background away from the object stays the clear color (nothing bled).
    expect(framebuffer.pixel(2, 2)).toEqual(CLEAR);
  });

  it('composites two objects side by side, each in its own color', async () => {
    const source = `composition "TwoUp" {
      object "Left" {
        shape: "cube"
        position: [-2, 0, 0]
        color: "#ff0000"
      }
      object "Right" {
        shape: "cube"
        position: [2, 0, 0]
        color: "#0000ff"
      }
    }`;

    const { framebuffer, stats, entityCount } = await renderHolo(source, {
      width: 64,
      height: 64,
      camera: { pixelsPerUnit: 8 },
      clear: CLEAR,
    });

    expect(entityCount).toBe(2);
    expect(stats.entitiesDrawn).toBe(2);
    // pixelsPerUnit 8, center 32: world x=-2 → px 16, world x=+2 → px 48.
    expect(framebuffer.pixel(16, 32)).toEqual(RED);
    expect(framebuffer.pixel(48, 32)).toEqual({ r: 0, g: 0, b: 255, a: 255 });
  });

  it('propagates a parse failure from the strict front (malformed composition)', async () => {
    // An unterminated composition block is a real syntax error: the strict parser
    // front rejects it, and renderHolo surfaces that rejection rather than rendering.
    await expect(renderHolo('composition "Broken" {')).rejects.toThrow(/parse/i);
  });
});
