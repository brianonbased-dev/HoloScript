/**
 * Gaze addressing, end to end: a machine wears a Quest, looks at one section of
 * a hundred, conducts, and only that section answers.
 *
 * This is the gate the previous architecture could not reach. Two hands cannot
 * select among a hundred sections, so the selector had to become attention —
 * and until a machine could wear the headset, "does looking at a section
 * actually address it" was a question only a person in a headset could answer.
 *
 * Everything here runs through the real path: Bravura's own `startBravuraXR`,
 * the head pose out of an actual XR viewer pose, and the view matrix an app
 * would render with. Nothing reads the headset object for the answer.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SyntheticHeadset } from '../../../../packages/core/src/xr/SyntheticHeadset';
import { startBravuraXR, type XRFrameData } from '../xrSession';
import { Ensemble, gazeFromView, type SectionFamily } from '../sections';
import type { Vec3 } from '../cueing';

class FakeXRWebGLLayer {
  framebuffer = null;
  constructor(
    private session: unknown,
    private gl: unknown
  ) {}
  getViewport(view: { eye?: string }) {
    return { x: view?.eye === 'right' ? 2064 : 0, y: 0, width: 2064, height: 2208 };
  }
}

const fakeGl = { makeXRCompatible: async () => {} } as unknown as WebGLRenderingContext;

let restoreWindow: (() => void) | undefined;

beforeEach(() => {
  const g = globalThis as Record<string, unknown>;
  const had = 'window' in g;
  const previous = g.window;
  g.window = { XRWebGLLayer: FakeXRWebGLLayer };
  restoreWindow = () => {
    if (had) g.window = previous;
    else delete g.window;
  };
});

afterEach(() => {
  restoreWindow?.();
  restoreWindow = undefined;
});

const FAMILIES: SectionFamily[] = ['strings', 'woodwind', 'brass', 'percussion'];

/** An orchestra on an arc in front of a conductor standing at the origin. */
function seatOrchestra(count: number, headY: number): Ensemble {
  const ensemble = new Ensemble();
  for (let i = 0; i < count; i++) {
    const angle = -0.9 + (1.8 * i) / Math.max(1, count - 1);
    ensemble.add({
      id: `s${i}`,
      name: `section ${i}`,
      family: FAMILIES[i % FAMILIES.length],
      at: [Math.sin(angle) * 5, headY - 0.2, -Math.cos(angle) * 5],
    });
  }
  return ensemble;
}

/**
 * Wire a live ensemble to a machine-worn headset: every XR frame feeds the real
 * head pose into the ensemble's attention.
 */
async function conductorInHeadset(sectionCount: number) {
  const headset = new SyntheticHeadset({ model: 'meta_quest_3', handTracking: true });
  const uninstall = headset.install();
  const ensemble = seatOrchestra(sectionCount, 1.6);
  const frames: XRFrameData[] = [];

  const handle = await startBravuraXR(
    fakeGl,
    () => headset.nowMs() / 1000,
    () => {},
    (data) => {
      frames.push(data);
      // The address is updated from the XR frame, exactly as the app would.
      const view = data.views[0];
      if (!view) return;
      const { origin, dir } = gazeFromView(view.view, view.camPos as Vec3);
      ensemble.look(origin, dir, headset.nowMs());
    },
    () => {}
  );

  return { headset, ensemble, frames, handle, uninstall };
}

describe('a machine conducts a 100-section orchestra by looking at it', () => {
  it('addresses the section it looked at, out of a hundred', async () => {
    const room = await conductorInHeadset(100);
    try {
      room.headset.step(1);
      expect(room.ensemble.size).toBe(100);
      expect(room.ensemble.addressed().kind).toBe('tutti');

      // Look at one section and let the eyes settle. The pose travels through
      // the XR frame; nothing here tells the ensemble which section it is.
      const target = room.ensemble.get('s62')!;
      room.headset.lookAt({ x: target.at[0], y: target.at[1], z: target.at[2] });
      room.headset.step(60); // ~0.5 s at 120 Hz, past the 250 ms dwell

      const address = room.ensemble.addressed();
      expect(address.kind).toBe('section');
      expect(address.kind === 'section' && address.id).toBe('s62');
    } finally {
      await room.handle.end();
      room.uninstall();
    }
  });

  it('brings in only the section that was looked at, and the room says so', async () => {
    const room = await conductorInHeadset(100);
    try {
      room.headset.step(1);

      const target = room.ensemble.get('s20')!;
      room.headset.lookAt({ x: target.at[0], y: target.at[1], z: target.at[2] });
      room.headset.step(60);

      room.ensemble.gesture('bring-in', room.headset.nowMs());

      expect(room.ensemble.playing().map((s) => s.id)).toEqual(['s20']);
      expect(room.ensemble.describe()).toBe('1 of 100 sections are playing');
    } finally {
      await room.handle.end();
      room.uninstall();
    }
  });

  it('the same lift solos one section, or swells all hundred, by where the eyes were', async () => {
    const room = await conductorInHeadset(100);
    try {
      room.headset.step(1);

      // Everyone in first.
      room.ensemble.addressTutti();
      room.ensemble.gesture('bring-in', room.headset.nowMs());
      expect(room.ensemble.playing().length).toBe(100);

      // Look at one desk, then lift. One lift, one section out in front.
      const target = room.ensemble.get('s41')!;
      room.headset.lookAt({ x: target.at[0], y: target.at[1], z: target.at[2] });
      room.headset.step(60);
      room.ensemble.gesture('swell', room.headset.nowMs(), 1);

      expect(room.ensemble.soloist()?.id).toBe('s41');
      expect(room.ensemble.describe()).toContain('out in front');

      // Look away and up, wait for attention to widen, then the identical lift.
      room.headset.lookAt({ x: 0, y: 4, z: 0 });
      room.headset.step(200); // past the 1.2 s release
      expect(room.ensemble.addressed().kind).toBe('tutti');

      const before = room.ensemble.all().map((s) => s.level);
      room.ensemble.gesture('swell', room.headset.nowMs(), 1);

      expect(room.ensemble.soloist()).toBeNull();
      room.ensemble.all().forEach((s, i) => expect(s.level).toBeGreaterThanOrEqual(before[i]));
    } finally {
      await room.handle.end();
      room.uninstall();
    }
  });

  it('conducting with the hands does not disturb who is addressed', async () => {
    // Beat and address are separate channels: the hands keep time, the eyes
    // choose who. A conductor does not stop addressing the oboe to beat a bar.
    const room = await conductorInHeadset(40);
    try {
      room.headset.step(1);

      const target = room.ensemble.get('s7')!;
      room.headset.lookAt({ x: target.at[0], y: target.at[1], z: target.at[2] });
      room.headset.step(60);
      expect(room.ensemble.addressed().kind).toBe('section');

      room.headset.conduct({ hand: 'right', bpm: 90, beats: 6 });

      const address = room.ensemble.addressed();
      expect(address.kind === 'section' && address.id).toBe('s7');
    } finally {
      await room.handle.end();
      room.uninstall();
    }
  });

  it('follows the address when the conductor turns to a different desk', async () => {
    const room = await conductorInHeadset(60);
    try {
      room.headset.step(1);

      for (const id of ['s5', 's30', 's55']) {
        const s = room.ensemble.get(id)!;
        room.headset.lookAt({ x: s.at[0], y: s.at[1], z: s.at[2] });
        room.headset.step(60);
        const address = room.ensemble.addressed();
        expect(address.kind === 'section' && address.id).toBe(id);
        room.ensemble.gesture('bring-in', room.headset.nowMs());
      }

      expect(room.ensemble.playing().map((s) => s.id).sort()).toEqual(['s30', 's5', 's55']);
    } finally {
      await room.handle.end();
      room.uninstall();
    }
  });
});

describe('gazeFromView reads the view matrix, not a model matrix', () => {
  it('derives a ray that actually points where the head is looking', async () => {
    // A transpose error here yields a plausible-looking ray pointing somewhere
    // wrong, which would silently address the wrong section forever.
    const room = await conductorInHeadset(20);
    try {
      room.headset.step(1);
      const target = room.ensemble.get('s3')!;
      room.headset.lookAt({ x: target.at[0], y: target.at[1], z: target.at[2] });
      room.headset.step(2);

      const view = room.frames[room.frames.length - 1].views[0];
      const { origin, dir } = gazeFromView(view.view, view.camPos as Vec3);

      // The derived ray must agree with the device's own head pose.
      const truth = room.headset.gazeRay()!;
      expect(dir[0]).toBeCloseTo(truth.direction.x, 3);
      expect(dir[1]).toBeCloseTo(truth.direction.y, 3);
      expect(dir[2]).toBeCloseTo(truth.direction.z, 3);

      // And it must actually point at the section that was looked at.
      const to: Vec3 = [
        target.at[0] - origin[0],
        target.at[1] - origin[1],
        target.at[2] - origin[2],
      ];
      const len = Math.hypot(to[0], to[1], to[2]);
      const dot = (dir[0] * to[0] + dir[1] * to[1] + dir[2] * to[2]) / len;
      expect(dot).toBeGreaterThan(0.999);
    } finally {
      await room.handle.end();
      room.uninstall();
    }
  });
});
