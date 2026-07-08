import { describe, it, expect } from 'vitest';
import { MediaPipelineCompiler } from './MediaPipelineCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

const prop = (key: string, value: unknown) => ({ key, value });
const obj = (name: string, props: Array<{ key: string; value: unknown }>): HoloObjectDecl =>
  ({ type: 'Object', name, properties: props, traits: [] }) as unknown as HoloObjectDecl;
const comp = (objects: HoloObjectDecl[], name = 'Scene'): HoloComposition =>
  ({ type: 'HoloComposition', name, objects }) as HoloComposition;

const scene = () =>
  comp([
    obj('A', [prop('mesh', 'sphere'), prop('position', [2, 0, 0]), prop('color', '#ff4040')]),
    obj('B', [prop('mesh', 'cube'), prop('position', [-2, 0, 0]), prop('color', '#40a0ff')]),
    obj('L', [prop('mesh', 'sphere'), prop('position', [0, 2, 0]), prop('emissive', '#ffffff'), prop('emissiveIntensity', 6)]),
  ]);

describe('MediaPipelineCompiler — sovereign media pipeline (.holo → animated turntable)', () => {
  it('renders the requested number of turntable frames at the right size', () => {
    const clip = new MediaPipelineCompiler().render(scene(), { width: 80, height: 60, frames: 8, fps: 12 });
    expect(clip.width).toBe(80);
    expect(clip.height).toBe(60);
    expect(clip.fps).toBe(12);
    expect(clip.frames).toHaveLength(8);
    for (const f of clip.frames) expect(f.length).toBe(80 * 60 * 4);
  });

  it('the camera actually orbits — frames a quarter-turn apart differ', () => {
    const clip = new MediaPipelineCompiler().render(scene(), { width: 80, height: 60, frames: 8 });
    const a = clip.frames[0];
    const b = clip.frames[2]; // quarter turn
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
    expect(diff).toBeGreaterThan(0);
  });

  it('encodes a valid APNG (signature + acTL animation-control chunk + IDAT)', () => {
    const clip = new MediaPipelineCompiler().render(scene(), { width: 48, height: 36, frames: 4, fps: 10 });
    const apng = MediaPipelineCompiler.toAPNG(clip);
    // PNG magic
    expect(Array.from(apng.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const buf = Buffer.from(apng);
    // APNG requires an acTL chunk with the frame count, plus IDAT and fdAT chunks.
    expect(buf.includes(Buffer.from('acTL', 'ascii'))).toBe(true);
    expect(buf.includes(Buffer.from('IDAT', 'ascii'))).toBe(true);
    expect(buf.includes(Buffer.from('fdAT', 'ascii'))).toBe(true);
    // acTL declares 4 frames (the 4 bytes right after the 'acTL' type tag).
    const acIdx = buf.indexOf(Buffer.from('acTL', 'ascii'));
    expect(buf.readUInt32BE(acIdx + 4)).toBe(4);
  });

  it('a light-less scene still renders (background fill, no crash)', () => {
    const clip = new MediaPipelineCompiler().render(comp([obj('X', [prop('mesh', 'cube')])]), {
      width: 40,
      height: 30,
      frames: 3,
    });
    expect(clip.frames).toHaveLength(3);
    expect(clip.frames[0].length).toBe(40 * 30 * 4);
  });
});
