import { describe, it, expect } from 'vitest';
import { CpuPathTracer } from './CpuPathTracer';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

const prop = (key: string, value: unknown) => ({ key, value });
const obj = (name: string, props: Array<{ key: string; value: unknown }>): HoloObjectDecl =>
  ({ type: 'Object', name, properties: props, traits: [] }) as unknown as HoloObjectDecl;
const comp = (objects: HoloObjectDecl[], name = 'Scene'): HoloComposition =>
  ({ type: 'HoloComposition', name, objects }) as HoloComposition;

const avgLuma = (px: Uint8Array): number => {
  let s = 0;
  for (let i = 0; i < px.length; i += 4) s += (px[i] + px[i + 1] + px[i + 2]) / 3;
  return s / (px.length / 4);
};

describe('CpuPathTracer — sovereign no-GPU path tracer (runs anywhere Node runs)', () => {
  it('renders RGBA pixels of the correct size, opaque, on the CPU', () => {
    const img = new CpuPathTracer().render(comp([obj('S', [prop('mesh', 'sphere'), prop('emissive', '#ffffff')])]), {
      width: 48,
      height: 36,
      samples: 4,
      bounces: 3,
    });
    expect(img.width).toBe(48);
    expect(img.height).toBe(36);
    expect(img.pixels.length).toBe(48 * 36 * 4);
    // alpha channel fully opaque
    for (let i = 3; i < img.pixels.length; i += 4) expect(img.pixels[i]).toBe(255);
  });

  it('an emissive light makes the image brighter than an unlit diffuse scene', () => {
    const lit = new CpuPathTracer().render(
      comp([
        obj('Light', [prop('mesh', 'sphere'), prop('position', [0, 2, 0]), prop('emissive', '#ffffff'), prop('emissiveIntensity', 8)]),
        obj('Ball', [prop('mesh', 'sphere'), prop('position', [0, 0, 0]), prop('color', '#cccccc')]),
      ]),
      { width: 48, height: 36, samples: 12, bounces: 4 }
    );
    const dark = new CpuPathTracer().render(
      comp([obj('Ball', [prop('mesh', 'sphere'), prop('position', [0, 0, 0]), prop('color', '#111111')])]),
      { width: 48, height: 36, samples: 12, bounces: 4 }
    );
    expect(avgLuma(lit.pixels)).toBeGreaterThan(avgLuma(dark.pixels));
    // and the lit scene is genuinely illuminated (not black)
    expect(avgLuma(lit.pixels)).toBeGreaterThan(10);
  });

  it('is deterministic — same scene + params renders byte-identical (reproducible)', () => {
    const scene = comp([obj('S', [prop('mesh', 'sphere'), prop('emissive', '#ffffff')])]);
    const a = new CpuPathTracer().render(scene, { width: 32, height: 24, samples: 6, bounces: 3 });
    const b = new CpuPathTracer().render(scene, { width: 32, height: 24, samples: 6, bounces: 3 });
    expect(Buffer.from(a.pixels).equals(Buffer.from(b.pixels))).toBe(true);
  });

  it('encodes a valid PNG (signature + non-trivial size), zero third-party deps', () => {
    const img = new CpuPathTracer().render(comp([obj('S', [prop('mesh', 'sphere'), prop('emissive', '#ffffff')])]), {
      width: 32,
      height: 24,
      samples: 4,
      bounces: 2,
    });
    const png = CpuPathTracer.toPNG(img);
    // PNG magic bytes
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    // IHDR type appears right after the signature + length field
    expect(Buffer.from(png.subarray(12, 16)).toString('ascii')).toBe('IHDR');
    expect(png.length).toBeGreaterThan(100);
  });
});
