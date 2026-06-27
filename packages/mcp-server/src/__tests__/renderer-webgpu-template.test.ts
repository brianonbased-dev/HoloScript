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
});
