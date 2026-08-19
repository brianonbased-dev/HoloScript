/**
 * Bravura's input seam, driven by a machine wearing a headset.
 *
 * Field report 1 (GATES.md, 2026-08-13) ends with the finding this file exists
 * to act on:
 *
 *   "A gate proven on the desk is not proven on the face. Eight closed gates
 *    with receipts, and the first real user could not pass Lesson 1 — because
 *    the desk drivers feed one clean stream and a human stands there with two
 *    hands up. The input seam between the real device and the detector is its
 *    own surface and needs its own negative controls (dual-source,
 *    joint-dropout, handedness)."
 *
 * Those three negative controls are below. Each reproduces a shape that a
 * mouse-driven desk run cannot produce and that, until now, only Joseph's face
 * could reach.
 *
 * This does NOT replace the live instrumented run. The house method — read the
 * real session over adb, do not simulate it — remains the authority for
 * discovering what a person experiences. What these tests do is stop a defect
 * that has already been found and fixed from coming back silently. Discovery
 * stays live; regression moves here.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SyntheticHeadset } from '../../../../packages/core/src/xr/SyntheticHeadset';
import { startBravuraXR, type XRFrameData } from '../xrSession';

// ---------------------------------------------------------------------------
// The bits of a browser Bravura touches that are not the headset itself.
// ---------------------------------------------------------------------------

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

interface Fed {
  t: number;
  y: number;
  source: string;
  x?: number;
}

/** Start Bravura against whatever device is installed, capturing its input. */
async function startBravura(headset: SyntheticHeadset) {
  const beats: Fed[] = [];
  const free: Fed[] = [];
  const frames: XRFrameData[] = [];
  let ended = false;

  const handle = await startBravuraXR(
    fakeGl,
    () => headset.nowMs() / 1000,
    (t, y, source, x) => beats.push({ t, y, source, x }),
    (data) => frames.push(data),
    () => {
      ended = true;
    },
    (t, y, x) => free.push({ t, y, source: 'free', x })
  );

  return { handle, beats, free, frames, wasEnded: () => ended };
}

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

describe('Bravura runs against a machine-worn Quest 3', () => {
  it('enters a session and receives hand joints without anyone putting on hardware', async () => {
    const headset = new SyntheticHeadset({ model: 'meta_quest_3', handTracking: true });
    const uninstall = headset.install();

    try {
      const run = await startBravura(headset);
      headset.step(3);

      expect(headset.inSession()).toBe(true);
      expect(run.frames.length).toBeGreaterThan(0);

      // Stereo: two eyes, each with a real projection matrix and viewport.
      const frame = run.frames[run.frames.length - 1];
      expect(frame.views.length).toBe(2);
      for (const view of frame.views) {
        expect(view.proj.length).toBe(16);
        expect(Number.isFinite(view.proj[0])).toBe(true);
        expect(view.view.length).toBe(16);
        expect(view.viewport.width).toBeGreaterThan(0);
      }
      // The eyes are apart, not coincident.
      expect(frame.views[0].camPos[0]).not.toBeCloseTo(frame.views[1].camPos[0], 5);

      // Both hands report a full joint set.
      expect(frame.hands.right?.joints).toBe(25);
      expect(frame.hands.left?.joints).toBe(25);

      await run.handle.end();
      expect(run.wasEnded()).toBe(true);
    } finally {
      uninstall();
    }
  });

  it('conducts, and the beats reach the detector', async () => {
    const headset = new SyntheticHeadset({ model: 'meta_quest_3', handTracking: true });
    const uninstall = headset.install();

    try {
      const run = await startBravura(headset);
      headset.step(1);

      const beatTimes = headset.conduct({ hand: 'right', bpm: 90, beats: 8, amplitude: 0.16 });
      expect(beatTimes.length).toBe(8);

      // The detector received a moving hand, not a still one.
      expect(run.beats.length).toBeGreaterThan(50);
      const heights = run.beats.map((b) => b.y);
      const swing = Math.max(...heights) - Math.min(...heights);
      expect(swing).toBeGreaterThan(0.1);

      await run.handle.end();
    } finally {
      uninstall();
    }
  });
});

describe('negative control 1 — dual-source (field report 1, defect 1)', () => {
  it('feeds the conductor from exactly ONE hand per frame, with both hands up', async () => {
    // The original defect: `inputSources` enumerates left first on Quest, and
    // the loop fed the conductor per-source, so BOTH wrists fed every frame and
    // two different heights interleaved into one signal. Every human stands
    // with both hands up; no desk driver ever did.
    const headset = new SyntheticHeadset({ model: 'meta_quest_3', handTracking: true });
    const uninstall = headset.install();

    try {
      const run = await startBravura(headset);
      headset.step(1);

      // Both hands conducting at once, which is what a person actually does.
      headset.conduct({ hand: 'right', bpm: 90, beats: 4 });
      headset.conduct({ hand: 'left', bpm: 60, beats: 4 });

      expect(run.beats.length).toBeGreaterThan(0);

      // One feed per timestamp on the podium stream, from exactly one side.
      // Two feeds at one timestamp is the defect: two different heights
      // interleaved into one signal, and the detector reads garbage.
      //
      // Note this is deliberately NOT "one side for the whole run" — the sticky
      // podium is SUPPOSED to hand over when the incumbent goes still and the
      // other hand conducts, so a run that switches sides is correct. What must
      // never happen is two sides inside one frame.
      const sourcesAt = new Map<number, Set<string>>();
      for (const fed of run.beats) {
        const seen = sourcesAt.get(fed.t) ?? new Set<string>();
        seen.add(fed.source);
        sourcesAt.set(fed.t, seen);
      }
      const worst = Math.max(...[...sourcesAt.values()].map((s) => s.size));
      expect(worst).toBe(1);
      expect(run.beats.length).toBe(sourcesAt.size);
    } finally {
      uninstall();
    }
  });

  it('sends the other hand to its own stream, never into the podium signal', async () => {
    const headset = new SyntheticHeadset({ model: 'meta_quest_3', handTracking: true });
    const uninstall = headset.install();

    try {
      const run = await startBravura(headset);
      headset.step(1);
      headset.conduct({ hand: 'right', bpm: 90, beats: 4 });

      // Two hands, two instruments — gate from field report 2, fix 3.
      expect(run.free.length).toBeGreaterThan(0);
      expect(run.beats.every((b) => b.source.startsWith('hand-'))).toBe(true);
    } finally {
      uninstall();
    }
  });
});

describe('negative control 2 — joint dropout (field report 1, defect 1)', () => {
  it('feeds NOTHING from a wrist that lost tracking, never its stale height', async () => {
    // "A wrist that lost tracking mid-stroke kept feeding its stale frozen
    // height (fast motion is exactly when Quest drops joints)." The room then
    // hears stillness while the hand is moving. A gap is honest; a spike is not.
    const headset = new SyntheticHeadset({ model: 'meta_quest_3', handTracking: true });
    const uninstall = headset.install();

    try {
      const run = await startBravura(headset);
      headset.step(1);

      // Conduct, then drop the podium hand mid-stroke with the other hand down.
      headset.conduct({ hand: 'right', bpm: 90, beats: 2 });
      const before = run.beats.length;
      const lastHeight = run.beats[run.beats.length - 1].y;

      headset.loseTracking('right', 8);
      headset.step(8);

      const during = run.beats.slice(before);

      // Nothing may arrive claiming to be the lost hand.
      expect(during.every((f) => f.source !== 'hand-right')).toBe(true);
      // In particular, the frozen last height must not keep arriving.
      expect(during.some((f) => f.y === lastHeight && f.source === 'hand-right')).toBe(false);

      // And the hand comes back afterwards.
      expect(headset.isTracking('right')).toBe(true);
      const after = run.beats.length;
      headset.conduct({ hand: 'right', bpm: 90, beats: 1 });
      expect(run.beats.length).toBeGreaterThan(after);
    } finally {
      uninstall();
    }
  });

  it('never lets a dropped joint reach the renderer as a real position', async () => {
    const headset = new SyntheticHeadset({ model: 'meta_quest_3', handTracking: true });
    const uninstall = headset.install();

    try {
      const run = await startBravura(headset);
      headset.step(1);

      headset.loseTracking('left', 5);
      headset.step(2);

      const frame = run.frames[run.frames.length - 1];
      // Bravura marks an absent joint with NaN in x, and only counts a hand
      // when its wrist had a pose this frame.
      expect(frame.hands.left).toBeUndefined();
      expect(frame.hands.right?.joints).toBe(25);
    } finally {
      uninstall();
    }
  });
});

describe('negative control 3 — handedness (field report 1, defect 1)', () => {
  it('hands the podium to the left when the right goes still and the left conducts', async () => {
    // "The podium hand is sticky — the incumbent keeps it unless it goes still
    // while the other hand clearly bounces (~1.5 s), so left-handed conductors
    // take over naturally and a raised cue hand cannot steal the beat."
    const headset = new SyntheticHeadset({ model: 'meta_quest_3', handTracking: true });
    const uninstall = headset.install();

    try {
      const run = await startBravura(headset);
      headset.step(1);

      // Right hand conducts first and holds the podium.
      headset.conduct({ hand: 'right', bpm: 90, beats: 4 });
      expect(run.beats.every((b) => b.source === 'hand-right')).toBe(true);

      // Right goes still; left conducts for well over the handover window.
      const before = run.beats.length;
      headset.conduct({ hand: 'left', bpm: 90, beats: 12 });

      const after = run.beats.slice(before);
      expect(after.some((b) => b.source === 'hand-left')).toBe(true);
    } finally {
      uninstall();
    }
  });

  it('falls back to controllers only when no hand is tracked at all', async () => {
    const headset = new SyntheticHeadset({ model: 'meta_quest_3', handTracking: true });
    const uninstall = headset.install();

    try {
      const run = await startBravura(headset);
      headset.step(1);
      headset.conduct({ hand: 'right', bpm: 90, beats: 2 });

      const before = run.beats.length;
      headset.useControllers();
      headset.step(5);

      const after = run.beats.slice(before);
      expect(after.length).toBeGreaterThan(0);
      expect(after.every((b) => b.source.startsWith('controller-'))).toBe(true);
    } finally {
      uninstall();
    }
  });
});

describe('the room has to fit the body in it (field report 2)', () => {
  it('reports the wearer at their real height, not the device nominal', async () => {
    // Measured live on 2026-08-14: Joseph's head at 1.41 m against a room that
    // assumed ~1.6 m. A fixed height is wrong for every body but the author's.
    const headset = new SyntheticHeadset({
      model: 'meta_quest_3',
      handTracking: true,
      eyeHeight: 1.41,
    });
    const uninstall = headset.install();

    try {
      const run = await startBravura(headset);
      headset.step(2);

      const frame = run.frames[run.frames.length - 1];
      expect(frame.views[0].camPos[1]).toBeCloseTo(1.41, 5);

      // And a standing wearer is reported standing.
      headset.setEyeHeight(1.7);
      headset.step(1);
      const standing = run.frames[run.frames.length - 1];
      expect(standing.views[0].camPos[1]).toBeCloseTo(1.7, 5);
    } finally {
      uninstall();
    }
  });
});
