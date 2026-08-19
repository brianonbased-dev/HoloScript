/**
 * Machine headset — proof that it can be worn, and proof that it can say no.
 *
 * These tests drive the REAL `openXRHALHandler` from `../../traits/OpenXRHALTrait`.
 * Nothing about the HAL is mocked. If the device were not faithful, the HAL
 * would fall back to its own simulated session and every assertion about input
 * would be meaningless — so several tests pin `fallback_mode: 'error'`, which
 * makes the simulate path unavailable and forces the real one.
 */
import { describe, it, expect, vi } from 'vitest';
import { openXRHALHandler } from '../../traits/OpenXRHALTrait';
import type { HSPlusNode } from '../../types/HoloScriptPlus';
import { SyntheticHeadset, DEVICE_CATALOG } from '../SyntheticHeadset';

function node(id = 'xr-root'): HSPlusNode {
  return { id, name: id } as unknown as HSPlusNode;
}

interface Emitted {
  type: string;
  payload: Record<string, unknown>;
}

function collector() {
  const events: Emitted[] = [];
  return {
    events,
    context: {
      emit: (type: string, payload: Record<string, unknown>) => {
        events.push({ type, payload });
      },
    },
    of: (type: string) => events.filter((e) => e.type === type),
    saw: (type: string) => events.some((e) => e.type === type),
  };
}

/** Attach the real HAL to a node and open a session on whatever device is installed. */
async function wearAndEnterSession(
  headset: SyntheticHeadset,
  overrides: Record<string, unknown> = {}
) {
  const n = node();
  const c = collector();
  const config = {
    ...openXRHALHandler.defaultConfig!,
    // 'error' removes the simulate escape hatch: if the device is not good
    // enough for the real path, this test fails instead of quietly passing.
    fallback_mode: 'error' as const,
    ...overrides,
  };

  openXRHALHandler.onAttach!(n, config, c.context as never);
  openXRHALHandler.onEvent!(n, config, c.context as never, {
    type: 'request_xr_session',
    payload: { mode: 'immersive-vr' },
  } as never);

  // The HAL opens the session, probes features, and walks the reference-space
  // fallback chain across several promise turns. Let all of it settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  return { n, c, config };
}

/** The pose the app received for one hand, from the HAL's own event payload. */
function poseFor(c: ReturnType<typeof collector>, hand: 'left' | 'right') {
  const update = c
    .of('xr_input_source_update')
    .find((e) => (e.payload.source as { handedness?: string })?.handedness === hand);
  return (update?.payload.pose ?? null) as { position: number[]; rotation: number[] } | null;
}

/** The button states the app received for one hand. */
function buttonsFor(c: ReturnType<typeof collector>, hand: 'left' | 'right') {
  const data = c.of('controller_data').find((e) => e.payload.hand === hand);
  return (data?.payload.buttons ?? null) as Record<
    string,
    { pressed: boolean; touched: boolean; value: number }
  > | null;
}

describe('SyntheticHeadset — a machine can wear it', () => {
  it('presents at navigator.xr and the real HAL opens a session against it', async () => {
    const headset = new SyntheticHeadset({ model: 'meta_quest_3' });
    const uninstall = headset.install();

    try {
      const { c } = await wearAndEnterSession(headset);

      expect(c.saw('openxr_session_start')).toBe(true);
      expect(c.saw('openxr_error')).toBe(false);
      // The escape hatch was disabled, so reaching a session proves the real path ran.
      expect(c.saw('openxr_simulated')).toBe(false);
      expect(headset.inSession()).toBe(true);
    } finally {
      uninstall();
    }
  });

  it('restores whatever was at navigator.xr when the headset comes off', () => {
    const nav = { xr: { sentinel: true } } as Record<string, unknown>;
    const headset = new SyntheticHeadset();

    const uninstall = headset.install(nav);
    expect(nav.xr).not.toEqual({ sentinel: true });

    uninstall();
    expect(nav.xr).toEqual({ sentinel: true });
  });

  it('deletes navigator.xr again if there was nothing there before', () => {
    const nav = {} as Record<string, unknown>;
    const headset = new SyntheticHeadset();

    const uninstall = headset.install(nav);
    expect('xr' in nav).toBe(true);

    uninstall();
    expect('xr' in nav).toBe(false);
  });

  it('drives the HAL frame loop, so the app receives controller input it can use', async () => {
    const headset = new SyntheticHeadset({ model: 'meta_quest_3' });
    const uninstall = headset.install();

    try {
      const { n, c, config } = await wearAndEnterSession(headset);

      headset.walkTo({ x: 0, y: 0, z: -2 }, 5);
      headset.point('right', { x: 0, y: 1.5, z: -3 });
      headset.press('right', 'trigger');
      headset.step(1);

      openXRHALHandler.onUpdate!(n, config, c.context as never, 11);

      const updates = c.of('xr_input_source_update');
      expect(updates.length).toBeGreaterThan(0);

      // The button the machine pressed must arrive at the app as pressed.
      const buttons = buttonsFor(c, 'right');
      expect(buttons).not.toBeNull();
      expect(buttons!.trigger.pressed).toBe(true);
      expect(buttons!.trigger.value).toBe(1);
      expect(buttons!.grip.pressed).toBe(false);
    } finally {
      uninstall();
    }
  });

  it('delivers a usable controller position — three finite numbers, not undefined', async () => {
    // This is the assertion that only a faithful device can make. A hand-written
    // mock that hands the HAL a numeric array passes trivially; real hardware
    // hands it a DOMPointReadOnly. If this fails, it fails on a real Quest too.
    const headset = new SyntheticHeadset({ model: 'meta_quest_3' });
    const uninstall = headset.install();

    try {
      const { n, c, config } = await wearAndEnterSession(headset);

      headset.standAt({ x: 1, y: 0, z: -2 });
      headset.reach('right', { x: 1.2, y: 1.3, z: -2.4 }, 3);
      headset.step(1);

      openXRHALHandler.onUpdate!(n, config, c.context as never, 11);

      const pose = poseFor(c, 'right');
      expect(pose).not.toBeNull();

      for (const axis of pose!.position) {
        expect(typeof axis).toBe('number');
        expect(Number.isFinite(axis)).toBe(true);
      }
      for (const component of pose!.rotation) {
        expect(typeof component).toBe('number');
        expect(Number.isFinite(component)).toBe(true);
      }

      // And it must be where the machine actually put its hand.
      expect(pose!.position[0]).toBeCloseTo(1.2, 5);
      expect(pose!.position[1]).toBeCloseTo(1.3, 5);
      expect(pose!.position[2]).toBeCloseTo(-2.4, 5);
    } finally {
      uninstall();
    }
  });

  it('delivers hand-joint poses when the app asks for hand tracking', async () => {
    const headset = new SyntheticHeadset({ model: 'meta_quest_3', handTracking: true });
    const uninstall = headset.install();

    try {
      const { n, c, config } = await wearAndEnterSession(headset, {
        enable_hand_tracking: true,
      });

      headset.reach('right', { x: 0.3, y: 1.2, z: -0.5 }, 2);
      headset.step(1);
      openXRHALHandler.onUpdate!(n, config, c.context as never, 11);

      const handUpdates = c.of('hand_data');
      // Both hands report; the machine only moved the right one.
      expect(handUpdates.map((e) => e.payload.hand).sort()).toEqual(['left', 'right']);

      const rightHand = handUpdates.find((e) => e.payload.hand === 'right');
      const joints = rightHand!.payload.joints as Record<string, { position: number[] }>;
      expect(joints).toBeDefined();

      const wrist = joints.wrist;
      expect(wrist).toBeDefined();
      for (const axis of wrist.position) {
        expect(typeof axis).toBe('number');
        expect(Number.isFinite(axis)).toBe(true);
      }
      // The wrist must be where the machine actually put its hand — not at the
      // origin, which is what a joint pose that failed to read reports.
      expect(wrist.position[0]).toBeCloseTo(0.3, 5);
      expect(wrist.position[1]).toBeCloseTo(1.2, 5);
      expect(wrist.position[2]).toBeCloseTo(-0.5, 5);
    } finally {
      uninstall();
    }
  });
});

describe('SyntheticHeadset — the device refuses to flatter the build', () => {
  it('reports the input profiles real hardware reports, not ones our detector likes', () => {
    // If someone "fixes" a detection failure by editing this catalog to say
    // "meta quest 3", the device stops testing the real world. That is the one
    // change this test exists to block.
    expect(DEVICE_CATALOG.meta_quest_3.inputProfiles).toContain('meta-quest-touch-plus');
    expect(DEVICE_CATALOG.meta_quest_3.inputProfiles).not.toContain('meta quest 3');
  });

  it('rejects a refresh rate the real device does not offer', () => {
    expect(() => new SyntheticHeadset({ model: 'meta_quest_3', refreshRate: 144 })).toThrow(
      /does not run at 144Hz/
    );
    // 144Hz is real — on an Index, not a Quest.
    expect(() => new SyntheticHeadset({ model: 'valve_index', refreshRate: 144 })).not.toThrow();
  });

  it('refuses hand tracking on a device that has no hands', () => {
    expect(() => new SyntheticHeadset({ model: 'valve_index', handTracking: true })).toThrow(
      /no hand tracking/
    );
  });

  it('rejects a required feature the device cannot provide', async () => {
    const headset = new SyntheticHeadset({ model: 'valve_index' });
    const uninstall = headset.install();

    try {
      const xr = (globalThis as Record<string, unknown>).navigator as {
        xr: { requestSession: (m: string, i: unknown) => Promise<unknown> };
      };
      await expect(
        xr.xr.requestSession('immersive-vr', { requiredFeatures: ['hand-tracking'] })
      ).rejects.toThrow(/cannot provide required feature/);
    } finally {
      uninstall();
    }
  });

  it('returns no poses once the session has ended', async () => {
    const headset = new SyntheticHeadset();
    const uninstall = headset.install();

    try {
      const nav = (globalThis as Record<string, unknown>).navigator as {
        xr: { requestSession: (m: string) => Promise<{ end: () => Promise<void>; inputSources: unknown[] }> };
      };
      const session = await nav.xr.requestSession('immersive-vr');
      expect(session.inputSources.length).toBe(2);

      await session.end();
      expect(session.inputSources.length).toBe(0);
      expect(headset.inSession()).toBe(false);
    } finally {
      uninstall();
    }
  });
});

describe('witness receipt — what a human is handed', () => {
  it('passes, and says so in words a non-developer can act on', async () => {
    const appEvents: string[] = [];
    const headset = new SyntheticHeadset({ model: 'meta_quest_3' });
    const uninstall = headset.install();

    try {
      const { n, c, config } = await wearAndEnterSession(headset);

      headset.expect('the info panel reacts when I pull the trigger', () =>
        appEvents.includes('panel_open')
      );

      // Stand-in for the build under test: it listens to the HAL's input events.
      const drainIntoApp = () => {
        openXRHALHandler.onUpdate!(n, config, c.context as never, 11);
        const buttons = buttonsFor(c, 'right');
        if (buttons?.trigger?.pressed && !appEvents.includes('panel_open')) {
          appEvents.push('panel_open');
        }
      };

      headset.walkTo({ x: 0, y: 0, z: -2 }, 4);
      headset.lookAt({ x: 0, y: 1.5, z: -3 });
      headset.point('right', { x: 0, y: 1.5, z: -3 });
      headset.press('right', 'trigger');
      headset.step(1);
      drainIntoApp();

      const receipt = headset.witness();

      expect(receipt.verdict).toBe('pass');
      expect(receipt.sessionEntered).toBe(true);
      expect(receipt.device).toBe('Meta Quest 3');
      expect(receipt.plainLanguage).toContain('Meta Quest 3');
      expect(receipt.plainLanguage).toContain('the info panel reacts when I pull the trigger');

      // The paragraph is the only surface a non-developer reads, so it must
      // carry no machine detail: no file paths, no symbols, no stack frames,
      // and no coordinate tuples. Exact positions belong in `actions[].at`.
      expect(receipt.plainLanguage).not.toMatch(/\.ts|\.mjs|[A-Za-z]:\\|undefined|null/);
      expect(receipt.plainLanguage).not.toMatch(/\(-?\d+\.\d+,/);

      // ...and it must still be told in human terms.
      expect(receipt.plainLanguage).toMatch(/walked .* forward/);
      expect(receipt.plainLanguage).toContain('pulled the trigger');

      // The exact numbers are still on the record, for machines.
      const walk = receipt.actions.find((a) => a.did.startsWith('walked'));
      expect(walk?.at).toEqual({ x: 0, y: 0, z: -2 });

      expect(receipt.doesNotProve.length).toBeGreaterThan(0);
    } finally {
      uninstall();
    }
  });

  it('fails on a broken build, and names what did not happen', async () => {
    // Fault injection. The build under test is deliberately deaf to the trigger.
    // If the receipt cannot go red here, it cannot be trusted when it goes green.
    const appEvents: string[] = [];
    const headset = new SyntheticHeadset({ model: 'meta_quest_3' });
    const uninstall = headset.install();

    try {
      await wearAndEnterSession(headset);

      headset.expect(
        'the info panel reacts when I pull the trigger',
        () => appEvents.includes('panel_open'),
        'the panel never reacted'
      );

      headset.walkTo({ x: 0, y: 0, z: -2 }, 4);
      headset.point('right', { x: 0, y: 1.5, z: -3 });
      headset.click('right', 'trigger');

      const receipt = headset.witness();

      expect(receipt.verdict).toBe('fail');
      expect(receipt.expectations[0].met).toBe(false);
      expect(receipt.expectations[0].because).toBe('the panel never reacted');
      expect(receipt.plainLanguage).toContain('did not happen');
      expect(receipt.plainLanguage).toContain('not ready to try on');
    } finally {
      uninstall();
    }
  });

  it('says plainly when the build never started a session at all', () => {
    const headset = new SyntheticHeadset();
    headset.expect('the world loads', () => false);

    const receipt = headset.witness();

    expect(receipt.sessionEntered).toBe(false);
    expect(receipt.verdict).toBe('fail');
    expect(receipt.plainLanguage).toContain('never started a headset session');
  });

  it('refuses to call an unasked-for run a pass', async () => {
    const headset = new SyntheticHeadset();
    const uninstall = headset.install();
    try {
      await wearAndEnterSession(headset);
      headset.step(5);

      const receipt = headset.witness();
      expect(receipt.verdict).toBe('inconclusive');
      expect(receipt.plainLanguage).toContain('nothing to pass or fail');
    } finally {
      uninstall();
    }
  });

  it('counts an expectation that throws as a failure, not a pass', () => {
    const headset = new SyntheticHeadset();
    headset.expect('the score goes up', () => {
      throw new Error('the score was never wired up');
    });

    const receipt = headset.witness();
    expect(receipt.verdict).toBe('fail');
    expect(receipt.expectations[0].because).toContain('the check itself broke');
  });

  it('produces the same receipt twice for the same script', async () => {
    const run = async () => {
      const headset = new SyntheticHeadset({ model: 'meta_quest_3' });
      const uninstall = headset.install();
      try {
        await wearAndEnterSession(headset);
        headset.walkTo({ x: 1, y: 0, z: -3 }, 6);
        headset.lookAt({ x: 1, y: 1.5, z: -4 });
        headset.click('right', 'trigger');
        headset.expect('it does the thing', () => true);
        return headset.witness();
      } finally {
        uninstall();
      }
    };

    const first = await run();
    const second = await run();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('records the haptics the build asked the wearer to feel', async () => {
    const headset = new SyntheticHeadset({ model: 'meta_quest_3' });
    const uninstall = headset.install();

    try {
      const { n, c, config } = await wearAndEnterSession(headset);

      openXRHALHandler.onEvent!(n, config, c.context as never, {
        type: 'trigger_haptic',
        payload: { hand: 'right', intensity: 0.8, duration: 40 },
      } as never);

      const felt = headset.hapticsFelt('right');
      expect(felt.length).toBe(1);
      expect(felt[0].intensity).toBeCloseTo(0.8, 5);
      expect(headset.witness().hapticsFelt).toBe(1);
    } finally {
      uninstall();
    }
  });
});

describe('the wearer moves like a person', () => {
  it('walks continuously rather than teleporting', async () => {
    const headset = new SyntheticHeadset({ model: 'meta_quest_3' });
    const uninstall = headset.install();

    try {
      const nav = (globalThis as Record<string, unknown>).navigator as {
        xr: { requestSession: (m: string) => Promise<{ requestAnimationFrame: (cb: (t: number, f: unknown) => void) => number }> };
      };
      const session = await nav.xr.requestSession('immersive-vr');

      const seen: number[] = [];
      const loop = (_t: number, _f: unknown) => {
        seen.push(headset.headPose().position.z);
        session.requestAnimationFrame(loop);
      };
      session.requestAnimationFrame(loop);

      headset.walkTo({ x: 0, y: 0, z: -3 }, 10);

      expect(seen.length).toBe(10);
      // Strictly decreasing z: the app saw every step of the walk.
      for (let i = 1; i < seen.length; i++) {
        expect(seen[i]).toBeLessThan(seen[i - 1]);
      }
      expect(seen[seen.length - 1]).toBeCloseTo(-3, 5);
    } finally {
      uninstall();
    }
  });

  it('points the gaze ray where the head is looking', () => {
    const headset = new SyntheticHeadset({ model: 'meta_quest_3' });
    headset.standAt({ x: 0, y: 0, z: 0 });
    headset.lookAt({ x: 0, y: 1.6, z: -5 });

    const gaze = headset.gazeRay();
    expect(gaze).not.toBeNull();
    expect(gaze!.direction.z).toBeLessThan(-0.9);
    expect(Math.abs(gaze!.direction.x)).toBeLessThan(0.01);
  });

  it('keeps the device clock deterministic and tied to the refresh rate', () => {
    const headset = new SyntheticHeadset({ model: 'meta_quest_3', refreshRate: 90 });
    expect(headset.nowMs()).toBe(0);
    headset.step(90);
    expect(headset.nowMs()).toBeCloseTo(1000, 6);
  });
});
