/**
 * Local capture handles: the runtime half of the tracking-source rule (Trust and Consent
 * POLICY.md section 3). `@face_tracking` / `@body_tracking` declared `source: "live_self"` pass
 * the validator without a grant, so at runtime the trait applies tracking data only when the
 * event carries a handle that a runtime capture adapter minted with `openLocalCapture` when it
 * opened the local device itself (camera, headset, body tracker). Anything else — no handle, a
 * copied or forged object, a closed handle, the wrong kind — is refused and the avatar falls back
 * to the generic one.
 *
 * What this verifies: the handle object is identity-checked (a module-private WeakMap), so it
 * cannot be forged from data (JSON, network messages, a replayed recording, a spread copy); it
 * must be open and of the right kind. What it does NOT verify: that the code which called
 * `openLocalCapture` really opened hardware. Any code in the same JS realm can mint a handle, and
 * no adapter in this repo calls it yet, so live_self tracking renders the generic avatar until a
 * host capture adapter adopts it. Device attestation (platform APIs) would be the next layer.
 */

export type LocalCaptureKind = 'face' | 'body';

export interface LocalCaptureHandle {
  readonly kind: LocalCaptureKind;
  readonly deviceLabel: string;
}

const open = new WeakMap<object, { kind: LocalCaptureKind; open: boolean }>();

/** For runtime capture adapters only: call when the runtime itself opened a local device. */
export function openLocalCapture(kind: LocalCaptureKind, deviceLabel = ''): LocalCaptureHandle {
  const handle: LocalCaptureHandle = Object.freeze({ kind, deviceLabel: String(deviceLabel) });
  open.set(handle, { kind, open: true });
  return handle;
}

/** Call when the adapter closes the device; later events with this handle are refused. */
export function closeLocalCapture(handle: LocalCaptureHandle): void {
  const entry = open.get(handle as object);
  if (entry) entry.open = false;
}

/** True only for an open handle minted by openLocalCapture for this kind. */
export function isLocalCapture(handle: unknown, kind: LocalCaptureKind): boolean {
  if (!handle || typeof handle !== 'object') return false;
  const entry = open.get(handle);
  return !!entry && entry.open && entry.kind === kind;
}

export type TrackingSource = 'live_self' | 'recording' | 'remote_user';

/**
 * Runtime gate for one tracking event. live_self needs a local capture handle; recording and
 * remote_user were gated by the validator (render_likeness yes) and apply as before; an absent
 * source keeps the pre-existing behavior (statically gated as a likeness). Any other declared
 * value is refused.
 */
export function trackingEventAllowed(
  source: unknown,
  capture: unknown,
  kind: LocalCaptureKind
): boolean {
  if (source === undefined || source === null) return true;
  if (source === 'live_self') return isLocalCapture(capture, kind);
  return source === 'recording' || source === 'remote_user';
}

/** The tracking event each kind feeds (FaceTrackingTrait / BodyTrackingTrait). */
export const LOCAL_CAPTURE_EVENT: Readonly<Record<LocalCaptureKind, string>> = Object.freeze({
  face: 'face_data_update',
  body: 'body_pose_update',
});

export interface LocalCaptureSession {
  readonly handle: LocalCaptureHandle;
  /** Event for the trait, stamped with this session's handle. Throws once the session ended. */
  event(data: Record<string, unknown>): Record<string, unknown>;
  end(): void;
}

/**
 * Host capture adapter. Call it from the code that itself opens a local face or body tracking
 * device or session (a WebXR/OpenXR face or body tracking session, an ARKit/ARCore face anchor
 * session, a webcam face-mesh pipeline). Call it when the device starts, build every event with
 * `event()`, and call `end()` when the device or session ends. Network, replay and remote paths
 * must not use it: their events carry no handle, so `live_self` traits refuse them.
 */
export function startLocalCaptureSession(
  kind: LocalCaptureKind,
  deviceLabel = ''
): LocalCaptureSession {
  const handle = openLocalCapture(kind, deviceLabel);
  let ended = false;
  return Object.freeze({
    handle,
    event(data: Record<string, unknown>) {
      if (ended) throw new Error(`local ${kind} capture session "${deviceLabel}" has ended`);
      return { ...data, type: LOCAL_CAPTURE_EVENT[kind], capture: handle };
    },
    end() {
      if (ended) return;
      ended = true;
      closeLocalCapture(handle);
    },
  });
}
