import { describe, it, expect, vi } from 'vitest';
import { visionHandler } from '../traits/VisionTrait';

describe('Computer Vision (Phase 73)', () => {
  it('should scan scene and detect objects', () => {
    const node = { id: 'robot_eye', properties: {} };
    const context = { emit: vi.fn() } as any;
    const config = { ...visionHandler.defaultConfig, auto_scan: false };

    visionHandler.onAttach!(node as any, config, context);

    // Manually trigger scan
    visionHandler.performScan(node, config, context);

    // Expect batch event
    expect(context.emit).toHaveBeenCalledWith(
      'vision_scan_complete',
      expect.objectContaining({
        detected: expect.arrayContaining([
          expect.objectContaining({ label: 'chair' }),
          expect.objectContaining({ label: 'table' }),
        ]),
      })
    );

    // Expect individual events
    expect(context.emit).toHaveBeenCalledWith(
      'vision_object_detected',
      expect.objectContaining({
        object: expect.objectContaining({ label: 'chair' }),
      })
    );
  });

  it('should auto-scan on update', () => {
    const node = { id: 'security_cam', properties: {} };
    const context = { emit: vi.fn() } as any;
    const config = { ...visionHandler.defaultConfig, auto_scan: true, scan_interval: 100 };

    visionHandler.onAttach!(node as any, config, context);

    // Sim time passing (less than interval)
    visionHandler.onUpdate!(node as any, config, context, 0.05); // 50ms
    expect(context.emit).not.toHaveBeenCalledWith('vision_scan_complete', expect.any(Object));

    // Sim time passing (exceed interval)
    visionHandler.onUpdate!(node as any, config, context, 0.06); // +60ms = 110ms total
    expect(context.emit).toHaveBeenCalledWith('vision_scan_complete', expect.any(Object));
  });
});
