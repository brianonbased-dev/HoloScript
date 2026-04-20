import { describe, expect, it } from 'vitest';
import { webgpuBytesPerRowRgba8 } from './WebCodecsDepthPipeline';

describe('WebCodecsDepthPipeline helpers', () => {
  it('webgpuBytesPerRowRgba8 aligns rows to 256 bytes', () => {
    expect(webgpuBytesPerRowRgba8(1)).toBe(256);
    expect(webgpuBytesPerRowRgba8(64)).toBe(256);
    expect(webgpuBytesPerRowRgba8(65)).toBe(512);
    expect(webgpuBytesPerRowRgba8(128)).toBe(512);
  });
});
