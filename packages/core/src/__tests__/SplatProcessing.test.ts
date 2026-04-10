import { describe, it, expect } from 'vitest';
import { SplatProcessingService } from '../services/SplatProcessingService';

describe('SplatProcessingService', () => {
  const service = new SplatProcessingService();

  it('should parse a mock .splat buffer', async () => {
    // 32 bytes per splat. 2 splats = 64 bytes.
    const buffer = new ArrayBuffer(64);
    const view = new DataView(buffer);

    // Splat 1: Pos (0,0,0), Scale (1,1,1)
    view.setFloat32(0, 0, true);
    view.setFloat32(4, 0, true);
    view.setFloat32(8, 0, true);
    view.setFloat32(12, 1, true);
    view.setFloat32(16, 1, true);
    view.setFloat32(20, 1, true);

    // Splat 2: Pos (10,10,10), Scale (2,2,2)
    view.setFloat32(32, 10, true);
    view.setFloat32(36, 10, true);
    view.setFloat32(40, 10, true);
    view.setFloat32(44, 2, true);
    view.setFloat32(48, 2, true);
    view.setFloat32(52, 2, true);

    const data = await service.parseSplat(buffer);
    expect(data.count).toBe(2);
    expect(data.positions[0]).toBe(0);
    expect(data.positions[3]).toBe(10);
    expect(data.scales[0]).toBe(1);
    expect(data.scales[3]).toBe(2);
  });

  it('should sort splats far-to-near', async () => {
    const buffer = new ArrayBuffer(64);
    const view = new DataView(buffer);

    // Splat 0: (0,0,0) - Closer
    view.setFloat32(0, 0, true);
    // Splat 1: (10,10,10) - Further
    view.setFloat32(32, 10, true);

    const data = await service.parseSplat(buffer);

    // Camera at (0,0,0)
    const indices = service.sortSplat(data, [0, 0, 0] as any);

    // Far (Splat 1) should be at index 0, Near (Splat 0) at index 1
    expect(indices[0]).toBe(1);
    expect(indices[1]).toBe(0);
  });
});
