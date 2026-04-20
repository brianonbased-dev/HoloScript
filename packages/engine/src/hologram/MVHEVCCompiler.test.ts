import { describe, expect, it } from 'vitest';
import { MVHEVCCompiler } from './MVHEVCCompiler';

describe('MVHEVCCompiler', () => {
  it('produces stereo views and multiview-hevc metadata', () => {
    const compiler = new MVHEVCCompiler();
    const result = compiler.compileMVHEVC({
      name: 'DemoSpatial',
      objects: [
        {
          traits: [
            {
              name: 'spatial_video',
              config: { ipd: 0.064, fps: 24, fov: 85 },
            },
          ],
        },
      ],
    });

    expect(result.views).toHaveLength(2);
    expect(result.views[0].eye).toBe('left');
    expect(result.views[1].eye).toBe('right');
    expect(result.views[0].cameraOffset).toBeLessThan(0);
    expect(result.views[1].cameraOffset).toBeGreaterThan(0);
    expect(result.metadata.stereoMode).toBe('multiview-hevc');
    expect(result.config.fps).toBe(24);
    expect(result.config.ipd).toBeCloseTo(0.064);
    expect(result.config.fovDegrees).toBe(85);
    expect(result.muxCommand).toContain('ffmpeg');
    expect(result.muxCommand).toContain('multiview_hevc');
    expect(result.swiftCode).toContain('MVHEVCCompiler output');
    expect(result.swiftCode).toContain('DemoSpatial');
  });

  it('compile() returns Swift source string', () => {
    const compiler = new MVHEVCCompiler();
    const swift = compiler.compile({ name: 'X', objects: [] }, 'token');
    expect(swift.length).toBeGreaterThan(100);
    expect(swift).toContain('RealityKit');
  });
});
