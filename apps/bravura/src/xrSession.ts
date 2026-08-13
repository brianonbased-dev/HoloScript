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
  feedBeat: (t: number, y: number, source: string) => void,
  onFrame: (data: XRFrameData) => void,
  onEnd: () => void
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

  const loop = (_t: number, frame: XRFrameLike) => {
    if (ended) return;
    session.requestAnimationFrame(loop);

    const pose = frame.getViewerPose(refSpace);
    const layer = session.renderState.baseLayer;
    if (!pose || !layer) return;

    const tAudio = audioNow();
    const hands: XRFrameData['hands'] = {};
    const controllers: XRFrameData['controllers'] = {};

    let beatFed = false;
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
        if (hf.joints > 0) {
          hands[side] = hf;
          // Right hand leads; left conducts only if right is absent.
          if (!beatFed && (side === 'right' || !hands.right)) {
            feedBeat(tAudio, hf.positions[1], `hand-${side}`);
            beatFed = side === 'right';
          }
        }
      } else if (input.gripSpace) {
        const gp = frame.getPose(input.gripSpace, refSpace);
        if (gp) {
          controllers[side] = gp.transform.matrix;
          if (!beatFed && !hands.right && !hands.left) {
            feedBeat(tAudio, gp.transform.position.y, `controller-${side}`);
            beatFed = side === 'right';
          }
        }
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
