/**
 * xrSession.ts — Bravura's WebXR loop: stereo views straight from XR
 * matrices, full hand-joint poses for rendering, wrist Y feeding the
 * conductor, controller grips as the no-hands fallback.
 */

export const JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  'index-finger-metacarpal',
  'index-finger-phalanx-proximal',
  'index-finger-phalanx-intermediate',
  'index-finger-phalanx-distal',
  'index-finger-tip',
  'middle-finger-metacarpal',
  'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-distal',
  'middle-finger-tip',
  'ring-finger-metacarpal',
  'ring-finger-phalanx-proximal',
  'ring-finger-phalanx-intermediate',
  'ring-finger-phalanx-distal',
  'ring-finger-tip',
  'pinky-finger-metacarpal',
  'pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-intermediate',
  'pinky-finger-phalanx-distal',
  'pinky-finger-tip',
] as const;

export interface HandFrame {
  /** xyz per joint, JOINT_NAMES order; NaN where a joint had no pose. */
  positions: Float32Array;
  radii: Float32Array;
  joints: number; // how many joints had poses this frame
}

export interface XRViewFrame {
  viewport: { x: number; y: number; width: number; height: number };
  proj: Float32Array;
  view: Float32Array;
  camPos: [number, number, number];
}

export interface XRFrameData {
  views: XRViewFrame[];
  hands: { left?: HandFrame; right?: HandFrame };
  /** grip pose matrix (column-major, world) per controller when no hand is tracked */
  controllers: { left?: Float32Array; right?: Float32Array };
  framebuffer: WebGLFramebuffer | null;
}

export interface BravuraXRHandle {
  end(): Promise<void>;
}

export async function startBravuraXR(
  gl: WebGLRenderingContext,
  audioNow: () => number,
  feedBeat: (t: number, y: number, source: string, x?: number) => void,
  onFrame: (data: XRFrameData) => void,
  onEnd: () => void,
  /** The non-podium hand's stream — its own instrument, its own detector. */
  feedFree: (t: number, y: number, x?: number) => void = () => {}
): Promise<BravuraXRHandle> {
  if (!navigator.xr) throw new Error('WebXR not available in this browser');
  const session = await navigator.xr.requestSession('immersive-vr', {
    optionalFeatures: ['hand-tracking', 'local-floor'],
  });

  await gl.makeXRCompatible?.();
  session.updateRenderState({ baseLayer: new window.XRWebGLLayer(session, gl) });

  let refSpace: XRSpaceLike;
  try {
    refSpace = await session.requestReferenceSpace('local-floor');
  } catch {
    refSpace = await session.requestReferenceSpace('local');
  }

  let ended = false;
  session.addEventListener('end', () => {
    ended = true;
    onEnd();
  });

  const handBufs: Record<'left' | 'right', HandFrame> = {
    left: { positions: new Float32Array(25 * 3), radii: new Float32Array(25), joints: 0 },
    right: { positions: new Float32Array(25 * 3), radii: new Float32Array(25), joints: 0 },
  };

  // Which hand holds the podium. Sticky: the incumbent keeps it unless it
  // goes still while the other hand clearly bounces (~1.5 s of motion), so
  // left-handed conductors take over and a raised cue hand cannot steal the
  // beat from a hand that is actively conducting.
  let beatSide: 'left' | 'right' = 'right';
  const act = { left: 0, right: 0 };
  const lastY = { left: NaN, right: NaN };
  const lastFreshT = { left: -1, right: -1 };

  const loop = (_t: number, frame: XRFrameLike) => {
    if (ended) return;
    session.requestAnimationFrame(loop);

    const pose = frame.getViewerPose(refSpace);
    const layer = session.renderState.baseLayer;
    if (!pose || !layer) return;

    const tAudio = audioNow();
    const hands: XRFrameData['hands'] = {};
    const controllers: XRFrameData['controllers'] = {};

    // Collect every tracked input first; the conductor is fed from exactly
    // ONE source per frame afterwards. Feeding both hands (how every human
    // naturally stands) interleaves two different heights into one signal
    // and the detector reads garbage.
    for (const input of session.inputSources) {
      const side = input.handedness === 'left' ? 'left' : 'right';
      if (input.hand) {
        const hf = handBufs[side];
        hf.joints = 0;
        for (let j = 0; j < JOINT_NAMES.length; j++) {
          const jointSpace = input.hand.get(JOINT_NAMES[j]);
          const jp = jointSpace ? frame.getJointPose?.(jointSpace, refSpace) : null;
          if (jp) {
            hf.positions[j * 3 + 0] = jp.transform.position.x;
            hf.positions[j * 3 + 1] = jp.transform.position.y;
            hf.positions[j * 3 + 2] = jp.transform.position.z;
            hf.radii[j] = jp.radius ?? 0.008;
            hf.joints++;
          } else {
            hf.positions[j * 3] = NaN;
          }
        }
        if (hf.joints > 0) hands[side] = hf;
      } else if (input.gripSpace) {
        const gp = frame.getPose(input.gripSpace, refSpace);
        if (gp) controllers[side] = gp.transform.matrix;
      }
    }

    // A hand only counts when its WRIST has a fresh pose this frame — a
    // lost wrist would otherwise feed a stale frozen height (the room hears
    // stillness while the hand moves) and a NaN x poisons the lateral stats.
    for (const side of ['left', 'right'] as const) {
      const hf = hands[side];
      const y = hf && !Number.isNaN(hf.positions[0]) ? hf.positions[1] : NaN;
      if (!Number.isNaN(y)) {
        if (!Number.isNaN(lastY[side])) {
          act[side] = act[side] * 0.92 + Math.abs(y - lastY[side]) * 0.08;
        }
        lastY[side] = y;
        lastFreshT[side] = tAudio;
      } else {
        lastY[side] = NaN;
      }
    }
    const fresh = (s: 'left' | 'right') => lastFreshT[s] === tAudio;
    const other = beatSide === 'right' ? 'left' : 'right';
    if (
      fresh(other) &&
      ((!fresh(beatSide) && tAudio - lastFreshT[beatSide] > 0.4) ||
        (act[other] > 0.008 && act[beatSide] < 0.002))
    ) {
      beatSide = other;
    }
    if (fresh(beatSide)) {
      const p = hands[beatSide]!.positions;
      feedBeat(tAudio, p[1], `hand-${beatSide}`, p[0]);
      // The OTHER hand is its own instrument (chimes) — a separate stream to
      // a separate detector. Two hands, two instruments; never two heights
      // interleaved into one signal, which is what broke the first run.
      if (fresh(other)) {
        const q = hands[other]!.positions;
        feedFree(tAudio, q[1], q[0]);
      }
    } else if (!fresh(other)) {
      // No hands at all — controllers carry the beat (right first). A hand
      // lost for under 0.4 s feeds nothing: a short gap is honest, the idle
      // hand's height spiking the signal is not.
      const m = controllers.right ?? controllers.left;
      if (m) {
        const src = controllers.right ? 'controller-right' : 'controller-left';
        feedBeat(tAudio, m[13], src, m[12]);
      }
    }

    const views: XRViewFrame[] = pose.views.map((v) => ({
      viewport: layer.getViewport(v),
      proj: v.projectionMatrix,
      view: v.transform.inverse.matrix,
      camPos: [v.transform.position.x, v.transform.position.y, v.transform.position.z] as [
        number,
        number,
        number,
      ],
    }));

    onFrame({ views, hands, controllers, framebuffer: layer.framebuffer });
  };
  session.requestAnimationFrame(loop);

  return {
    end: async () => {
      if (!ended) await session.end();
    },
  };
}
