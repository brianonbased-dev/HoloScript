/**
 * WebXR body (and face, if exposed) tracking as a local capture host (Trust and Consent
 * POLICY s3). The session owner (WebXRManager) is the code that opens the local device, so it is
 * the one place allowed to stamp tracking events with a LocalCapture handle:
 *
 * - start(session): when the UA granted 'body-tracking' (Meta Quest Browser, XRFrame.body), open a
 *   local body capture session. No grant -> no session -> live_self traits show the generic avatar.
 * - frameEvents(frame, space): each XRFrame's body joints -> one stamped body_pose_update event.
 * - end(): on session end; later events (or stored copies) are refused by the traits.
 *
 * Face: WebXR exposes no face-tracking feature or per-frame face data today (Quest face tracking
 * is OpenXR XR_FB_face_tracking2, native only), so nothing is requested or stamped for face.
 *
 * Never call this for data that arrives over the network or from a replay; those paths emit
 * plain events without a handle.
 */
import { startLocalCaptureSession, type LocalCaptureSession } from '@holoscript/core';

/** Optional (never required) features; sessions start fine without them. */
export const WEBXR_TRACKING_OPTIONAL_FEATURES = ['body-tracking'] as const;

/** Meta WebXR body-tracking joint names -> BodyTrackingTrait joints. */
const JOINTS: Record<string, string> = {
  head: 'head',
  neck: 'neck',
  chest: 'spine_chest',
  'spine-middle': 'spine_mid',
  'spine-lower': 'spine_base',
  hips: 'hips',
  'left-arm-upper': 'shoulder_left',
  'right-arm-upper': 'shoulder_right',
  'left-arm-lower': 'elbow_left',
  'right-arm-lower': 'elbow_right',
  'left-hand-wrist': 'wrist_left',
  'right-hand-wrist': 'wrist_right',
  'left-hand-palm': 'hand_left',
  'right-hand-palm': 'hand_right',
  'left-upper-leg': 'hip_left',
  'right-upper-leg': 'hip_right',
  'left-lower-leg': 'knee_left',
  'right-lower-leg': 'knee_right',
  'left-foot-ankle': 'ankle_left',
  'right-foot-ankle': 'ankle_right',
  'left-foot-ball': 'foot_left',
  'right-foot-ball': 'foot_right',
};

interface PoseLike {
  transform: { position: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } };
  emulatedPosition?: boolean;
}
interface FrameLike {
  body?: Iterable<[string, unknown]> | null;
  getPose?(space: unknown, base: unknown): PoseLike | null | undefined;
}
interface SessionLike {
  enabledFeatures?: readonly string[];
}

export class WebXRTrackingCapture {
  private body: LocalCaptureSession | null = null;

  /** Call once the session is live. Returns which local captures were opened. */
  start(session: SessionLike): { body: boolean; face: boolean } {
    this.end();
    const enabled = session.enabledFeatures ?? [];
    if (enabled.includes('body-tracking')) {
      this.body = startLocalCaptureSession('body', 'webxr body-tracking');
    }
    return { body: !!this.body, face: false };
  }

  /** Stamped tracking events for this frame (empty when no capture or no data). */
  frameEvents(frame: unknown, baseSpace: unknown): Record<string, unknown>[] {
    const f = frame as FrameLike;
    if (!this.body || !f || !f.body || typeof f.getPose !== 'function') return [];
    const joints: Record<string, unknown> = {};
    for (const [name, space] of f.body) {
      const joint = JOINTS[name];
      if (!joint) continue;
      const pose = f.getPose(space, baseSpace);
      if (!pose) continue;
      const p = pose.transform.position;
      const o = pose.transform.orientation;
      joints[joint] = {
        position: [p.x, p.y, p.z],
        rotation: { x: o.x, y: o.y, z: o.z, w: o.w },
        confidence: pose.emulatedPosition ? 0.5 : 1,
      };
    }
    if (Object.keys(joints).length === 0) return [];
    return [this.body.event({ joints })];
  }

  end(): void {
    this.body?.end();
    this.body = null;
  }

  get active(): { body: boolean; face: boolean } {
    return { body: !!this.body, face: false };
  }
}
