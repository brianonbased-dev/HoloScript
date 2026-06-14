/**
 * readThumbsticks — pure helper to read controller thumbsticks from an XRSession.
 *
 * Returns dead-zoned {left,right} stick vectors so a locomotion controller can
 * stay input-source agnostic and be unit-tested without a live XR session.
 * Quest/Touch report the thumbstick on gamepad.axes[2] (x) / axes[3] (y); the
 * older trackpad axes[0,1] are a fallback. Extracted from the studio
 * ImmersiveViewer locomotion block so every consumer reads input identically.
 */

export interface StickVector {
  x: number;
  y: number;
}

export interface StickState {
  left: StickVector;
  right: StickVector;
  /**
   * Right-controller primary face button (A on Quest Touch right / X on left)
   * pressed. Additive + optional — existing {left,right} consumers are
   * unaffected. Used by XRLocomotionController to bind teleport.
   */
  rightPrimary?: boolean;
  /** Left-controller primary face button (X) pressed. */
  leftPrimary?: boolean;
}

function deadZone(value: number, dz: number): number {
  return Math.abs(value) < dz ? 0 : value;
}

/**
 * Read left/right thumbsticks from a live XRSession's input sources.
 * Right-handed source -> right stick; everything else -> left stick.
 */
export function readThumbsticks(
  session: XRSession | null | undefined,
  leftDeadZone = 0.12,
  rightDeadZone = 0.15
): StickState {
  const out: StickState = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
  if (!session) return out;
  for (const source of session.inputSources) {
    const gp = source.gamepad;
    if (!gp || gp.axes.length < 4) continue;
    const x = gp.axes[2];
    const y = gp.axes[3];
    // Quest Touch: buttons[4] = A (right) / X (left). Guard for shorter mappings.
    const primary = gp.buttons.length > 4 ? gp.buttons[4]?.pressed === true : false;
    if (source.handedness === 'right') {
      out.right.x = deadZone(x, rightDeadZone);
      out.right.y = deadZone(y, rightDeadZone);
      out.rightPrimary = primary;
    } else {
      out.left.x = deadZone(x, leftDeadZone);
      out.left.y = deadZone(y, leftDeadZone);
      out.leftPrimary = primary;
    }
  }
  return out;
}
