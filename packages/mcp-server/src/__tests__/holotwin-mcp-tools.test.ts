import { describe, expect, it } from 'vitest';

import {
  handleHoloTwinTool,
  holotwinToolDefinitions,
  isHoloTwinToolName,
} from '../holotwin-mcp-tools';

const HOLOTWIN_CODE = `composition "Tiny HoloTwin" {
  object "TemperatureSensor" {
    @quilt {
      device: "go"
      views: 4
      columns: 2
      rows: 2
      resolution: [128, 128]
      baseline: 0.02
      focusDistance: 0.15
    }
    geometry: "sphere"
    color: "#FF6B6B"
  }
}`;

describe('holotwin mcp tools', () => {
  it('defines and identifies the HoloTwin tool cluster', () => {
    const names = holotwinToolDefinitions.map((tool) => tool.name);
    expect(names).toContain('holo_holotwin_connect');
    expect(names).toContain('holo_holotwin_compile_quilt');
    expect(names).toContain('holo_holotwin_stream');
    expect(isHoloTwinToolName('holo_holotwin_compile_quilt')).toBe(true);
    expect(isHoloTwinToolName('holo_hologram_compile_quilt')).toBe(false);
  });

  it('compiles holoCode through QuiltCompiler and renders a real PNG receipt', async () => {
    const connect = (await handleHoloTwinTool('holo_holotwin_connect', {
      physicalId: 'farm-001',
      protocol: 'mqtt',
      connectionString: 'memory://farm-001',
      displayDevice: 'go',
    })) as Record<string, unknown>;
    const sessionId = String(connect.sessionId);

    await handleHoloTwinTool('holo_holotwin_map_sensor', {
      sessionId,
      mappings: [
        {
          sensor_key: 'temperature',
          scene_property: 'TemperatureSensor.emissiveIntensity',
          transform: 'emissive',
          min: 10,
          max: 40,
        },
      ],
    });

    const compiled = (await handleHoloTwinTool('holo_holotwin_compile_quilt', {
      sessionId,
      holoCode: HOLOTWIN_CODE,
      deviceOverride: 'go',
      quiltConfig: {
        views: 4,
        columns: 2,
        rows: 2,
        resolution: [128, 128],
        baseline: 0.02,
        focusDistance: 0.15,
      },
    })) as Record<string, unknown>;

    expect(compiled.stub).toBe(false);
    expect(compiled.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(compiled.url).toMatch(/^data:image\/png;base64,/);

    const quilt = compiled.quilt as Record<string, unknown>;
    expect(quilt.rendererRuntime).toBe('BrowserQuiltRenderer');
    const receipt = quilt.receipt as Record<string, unknown>;
    expect(receipt.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.pngBase64).toMatch(/^iVBOR/);
    expect(receipt.bytes).toBeGreaterThan(100);

    const status = (await handleHoloTwinTool('holo_holotwin_status', {
      sessionId,
    })) as Record<string, unknown>;
    expect(status.quiltHash).toBe(compiled.hash);
    expect(status.quiltBytes).toBe(receipt.bytes);

    const stream = (await handleHoloTwinTool('holo_holotwin_stream', {
      sessionId,
      recompileIntervalMs: 100,
      autoStop: true,
    })) as Record<string, unknown>;
    expect(stream.streaming).toBe(true);
    expect(stream.lastFrameHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    await handleHoloTwinTool('holo_holotwin_disconnect', { sessionId });
  });
});
