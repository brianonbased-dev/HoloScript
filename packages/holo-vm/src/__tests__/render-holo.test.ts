/**
 * renderHolo end-to-end: `.holo` source text → native pixels in ONE call (D.083).
 *
 * This is the entry that closes the native pipeline. The native-renderer e2e proves
 * bytecode→VM→pixels; core's parser/compiler prove text→bytecode. renderHolo joins
 * them: it parses real `.holo` source, compiles it through HolobCompiler, executes
 * the bytecode in the HoloVM, and rasterizes the resulting world natively — no
 * three.js, no react, no cannon anywhere on the path.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { renderHolo } from '../render/render-holo';
import type { RGBA } from '../render/native-renderer';

const RED: RGBA = { r: 255, g: 0, b: 0, a: 255 };
const CLEAR: RGBA = { r: 18, g: 18, b: 22, a: 255 };

describe('renderHolo: .holo text → native pixels (one call)', () => {
  // renderHolo lazily dynamic-imports the full @holoscript/core barrel on first use;
  // that cold load can exceed the default 5s per-test budget. Warm it once here so the
  // individual cases time only the render path, not the one-off module load.
  beforeAll(async () => {
    await import('@holoscript/core');
  }, 60_000);

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

  it('preserves source-authored @grabbable as a stable native trait id', async () => {
    const source = `composition "GrabbableNative" {
      object "Handle" @grabbable {
        shape: "cube"
        position: [0, 0, 0]
        color: "#0000ff"
      }
    }`;

    const { framebuffer, stats } = await renderHolo(source, {
      width: 64,
      height: 64,
      camera: { pixelsPerUnit: 8 },
      clear: CLEAR,
    });

    expect(stats.grabbableEntities).toEqual([1]);
    expect(framebuffer.pixel(32, 32)).toEqual({ r: 40, g: 40, b: 255, a: 255 });
  });

  it('preserves source-authored @synced as native sync metadata without requiring transport', async () => {
    const source = `composition "SyncedNative" {
      object "Replica" @synced {
        shape: "cube"
        position: [0, 0, 0]
        color: "#ff0000"
      }
    }`;

    const { framebuffer, stats } = await renderHolo(source, {
      width: 64,
      height: 64,
      camera: { pixelsPerUnit: 8 },
      clear: CLEAR,
    });

    expect(stats.syncedEntities).toEqual([1]);
    expect(framebuffer.pixel(32, 32)).toEqual(RED);
  });

  it('preserves source-authored @glowing as a native emissive visual signal', async () => {
    const source = `composition "GlowingNative" {
      object "Lamp" @glowing {
        shape: "cube"
        position: [0, 0, 0]
        color: "#000080"
      }
    }`;

    const { framebuffer, stats } = await renderHolo(source, {
      width: 64,
      height: 64,
      camera: { pixelsPerUnit: 8 },
      clear: CLEAR,
    });

    expect(stats.glowingEntities).toEqual([1]);
    expect(framebuffer.pixel(32, 32)).toEqual({ r: 80, g: 80, b: 208, a: 255 });
  });

  it('preserves source-authored @state_machine as native runtime metadata', async () => {
    const source = `composition "StateMachineNative" {
      object "Actor" @state_machine {
        shape: "cube"
        position: [0, 0, 0]
        color: "#ff0000"
      }
    }`;

    const { framebuffer, stats } = await renderHolo(source, {
      width: 64,
      height: 64,
      camera: { pixelsPerUnit: 8 },
      clear: CLEAR,
    });

    expect(stats.stateMachineEntities).toEqual([1]);
    expect(framebuffer.pixel(32, 32)).toEqual(RED);
  });

  it('propagates a parse failure from the strict front (malformed composition)', async () => {
    // An unterminated composition block is a real syntax error: the strict parser
    // front rejects it, and renderHolo surfaces that rejection rather than rendering.
    await expect(renderHolo('composition "Broken" {')).rejects.toThrow(/parse/i);
  });

  // Regression: HolobCompiler used to drop an object's scale (the builder's
  // transform() only accepted x/y/z), so every object rendered at unit size.
  // With scale carried through, a scaled cube must cover pixels a unit cube can't.
  it('propagates object scale through the compiler — the drawn quad grows', async () => {
    const mk = (scale: string) => `composition "Scaled" {
      object "Hero" {
        shape: "cube"
        position: [0, 0, 0]
        scale: ${scale}
        color: "#ff0000"
      }
    }`;
    const opts = { width: 96, height: 96, camera: { pixelsPerUnit: 8 }, clear: CLEAR } as const;

    const unit = await renderHolo(mk('[1, 1, 1]'), opts);
    const big = await renderHolo(mk('[3, 3, 3]'), opts);

    // center = 48, pixelsPerUnit = 8: unit half-extent = 4px → x∈[44,52];
    // scale-3 half-extent = 12px → x∈[36,60]. Pixel x=58 is reached ONLY when
    // scale propagates.
    expect(unit.framebuffer.pixel(48, 48)).toEqual(RED); // both draw their center
    expect(big.framebuffer.pixel(48, 48)).toEqual(RED);
    expect(unit.framebuffer.pixel(58, 48)).toEqual(CLEAR); // unit cube stops short
    expect(big.framebuffer.pixel(58, 48)).toEqual(RED); // scaled cube reaches it
  });

  // Regression: HolobCompiler added each light entity twice (once in defineEntities,
  // again in compileLight), inflating the entity count and spawning orphans.
  it('does not double-count light entities', async () => {
    const source = `composition "Lit" {
      object "Hero" {
        shape: "cube"
        position: [0, 0, 0]
        color: "#ff0000"
      }
      light "Sun" directional {
        intensity: 1.0
      }
    }`;

    const { entityCount, stats } = await renderHolo(source, {
      width: 64,
      height: 64,
      camera: { pixelsPerUnit: 8 },
      clear: CLEAR,
    });

    // 1 object + 1 light = exactly 2 entities (pre-fix this was 3).
    expect(entityCount).toBe(2);
    // The light carries no geometry/material, so only the object is drawn.
    expect(stats.entitiesDrawn).toBe(1);
  });
});
