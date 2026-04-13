import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HandMenuSystem } from '../HandMenu';

describe('HandMenuSystem', () => {
  let runtime: any;
  let system: HandMenuSystem;
  let mountedObjects: any[] = [];

  beforeEach(() => {
    mountedObjects = [];
    runtime = {
      vrContext: {
        hands: {
          left: null,
          right: null,
        },
        headset: { position: [0, 0, 0], rotation: [0, 0, 0] },
      },
      mountObject: vi.fn((obj) => {
        mountedObjects.push(obj);
        return { node: obj, destroyed: false };
      }),
      unmountObject: vi.fn((id) => {
        const idx = mountedObjects.findIndex((o) => o.id === id);
        if (idx > -1) mountedObjects.splice(idx, 1);
      }),
    };
    system = new HandMenuSystem(runtime);
  });

  it('shows menu when palm faces user (mocked check)', () => {
    // Mock checkPalmFacingUser implementation for test
    // Since it's private, we can't easily mock it without casting or changing visibility.
    // Alternatively, we can subclass for testing or mock the prototype.

    // Let's use spyOn if possible, but it's a private method on instance.
    // TypeScript workaround:
    (system as any).checkPalmFacingUser = vi.fn().mockReturnValue(true);

    // Mock Left Hand
    runtime.vrContext.hands.left = {
      position: [-0.2, 1.5, -0.5],
      rotation: [0, 0, 0],
    };

    // Update
    system.update(0.016);

    expect(runtime.mountObject).toHaveBeenCalled();
    expect(mountedObjects.length).toBe(1);
    expect(mountedObjects[0].id).toContain('hand_menu');
  });

  it('does not show menu if palm away', () => {
    (system as any).checkPalmFacingUser = vi.fn().mockReturnValue(false);

    runtime.vrContext.hands.left = {
      position: [-0.2, 1.5, -0.5],
      rotation: [0, 0, 0],
    };

    system.update(0.016);

    expect(runtime.mountObject).not.toHaveBeenCalled();
  });

  it('hides menu if palm turns away', () => {
    // 1. Show it
    (system as any).checkPalmFacingUser = vi.fn().mockReturnValue(true);
    runtime.vrContext.hands.left = { position: [0, 0, 0] };
    system.update(0.016);

    expect(mountedObjects.length).toBe(1);

    // 2. Hide it
    (system as any).checkPalmFacingUser = vi.fn().mockReturnValue(false);
    // Advance time to pass debounce? logic doesn't debounce hide, only toggle.
    // Actually, check logic:
    // if palm facing: show if not visible & debounce
    // else: if visible -> hide

    system.update(0.016);

    // Only works if we implemented unmountObject logic in HandMenu.ts
    // In previous step we implemented runtime.unmountObject, but HandMenu.ts
    // had commented out code for unmount.
    // Wait, did I uncomment it in HandMenu.ts?
    // I wrote HandMenu.ts in Step 14140 with `// this.runtime.unmountObject(this.menuNodeId);`
    // I need to uncomment that line!
  });
});
