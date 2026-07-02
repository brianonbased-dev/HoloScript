import { describe, expect, it } from 'vitest';
import { generateWebGPUBrowserTemplate } from '../renderer';

describe('generateWebGPUBrowserTemplate', () => {
  it('strips TypeScript annotations without corrupting GPU enum values', () => {
    const html = generateWebGPUBrowserTemplate(
      `
const canvas = document.querySelector("canvas") as HTMLCanvasElement;
function createBuffer(device: GPUDevice, data: Float32Array, usage: number): GPUBuffer {
  return device.createBuffer({ size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST });
}
const texture = device.createTexture({ usage: GPUTextureUsage.RENDER_ATTACHMENT });
const clearColor: GPUColor = { r: 0, g: 0, b: 0, a: 1 };
`,
      'WebGPU Strip Test'
    );

    expect(html).toContain('usage: usage | GPUBufferUsage.COPY_DST');
    expect(html).toContain('usage: GPUTextureUsage.RENDER_ATTACHMENT');
    expect(html).toContain('function createBuffer(device, data, usage)');
    expect(html).toContain('const clearColor = { r: 0, g: 0, b: 0, a: 1 }');
    expect(html).not.toContain('as HTMLCanvasElement');
    expect(html).not.toContain(': GPUColor');
  });

  describe('prefers-reduced-motion gate (WCAG 2.3.3)', () => {
    const html = generateWebGPUBrowserTemplate('const x = 1;', 'Motion Gate Test');

    it('detects the OS-level reduced-motion preference via matchMedia', () => {
      expect(html).toContain('matchMedia');
      expect(html).toContain('prefers-reduced-motion: reduce');
    });

    it('does not unconditionally auto-start the render pipeline', () => {
      // The render-start logic must be reachable only through the conditional
      // gate, not invoked as a bare IIFE at the top level anymore.
      expect(html).not.toMatch(/\(async \(\) => \{[\s\S]*?\}\)\(\);/);
      expect(html).toContain('const startRender = async () =>');
      expect(html).toMatch(/if \(prefersReducedMotion\)/);
      expect(html).toContain('startRender()');
    });

    it('provides a click-to-view control gated behind the reduced-motion check', () => {
      expect(html).toContain('hs-motion-gate');
      expect(html).toContain('Reduced motion is on. Click to view this scene.');
    });
  });
});
