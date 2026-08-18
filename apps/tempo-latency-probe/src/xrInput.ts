/**
 * xrInput.ts
 *
 * Minimal WebXR input: an immersive-vr session that feeds vertical position
 * samples (audio-clock timestamps) from hand wrist joints when available,
 * controller grip poses otherwise. Same seam the studio's Quest hand-tracking
 * receipt uses; typed via the local structural webxr.d.ts (engine idiom).
 */

export interface XRSampleFeed {
  (t: number, y: number, source: string): void;
}

export interface XRHandle {
  end(): Promise<void>;
  readonly session: XRSessionLike;
}

export function xrAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.xr;
}

export async function startXR(
  feed: XRSampleFeed,
  audioNow: () => number,
  onEnd: () => void
): Promise<XRHandle> {
  if (!navigator.xr) throw new Error('WebXR not available in this browser');

  const session = await navigator.xr.requestSession('immersive-vr', {
    optionalFeatures: ['hand-tracking', 'local-floor'],
  });

  // A visible layer is required for a valid session even though the probe is
  // audio-first; a bare GL layer clears to near-black.
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { xrCompatible: true });
  if (!gl) throw new Error('WebGL unavailable');
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

  const onFrame = (_time: number, frame: XRFrameLike) => {
    if (ended) return;
    session.requestAnimationFrame(onFrame);

    gl.clearColor(0.02, 0.02, 0.05, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const t = audioNow();
    // Priority: right hand wrist, left hand wrist, right grip, left grip.
    let best: { y: number; source: string } | null = null;
    let bestRank = 99;
    for (const input of session.inputSources) {
      const handed = input.handedness === 'right' ? 0 : 1;
      if (input.hand) {
        const wrist = input.hand.get('wrist');
        if (wrist) {
          const pose = frame.getJointPose?.(wrist, refSpace);
          if (pose) {
            const rank = 0 + handed;
            if (rank < bestRank) {
              bestRank = rank;
              best = { y: pose.transform.position.y, source: `hand-${input.handedness}` };
            }
          }
        }
      } else if (input.gripSpace) {
        const pose = frame.getPose(input.gripSpace, refSpace);
        if (pose) {
          const rank = 2 + handed;
          if (rank < bestRank) {
            bestRank = rank;
            best = { y: pose.transform.position.y, source: `controller-${input.handedness}` };
          }
        }
      }
    }
    if (best) feed(t, best.y, best.source);
  };
  session.requestAnimationFrame(onFrame);

  return {
    session,
    end: async () => {
      if (!ended) await session.end();
    },
  };
}
