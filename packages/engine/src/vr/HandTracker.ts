/**
 * HandTracker — Joint positions, gesture recognition, pinch/grab/point
 *
 * @version 1.0.0
 */

export type HandSide = 'left' | 'right';
export type GestureType = 'none' | 'pinch' | 'grab' | 'point' | 'fist' | 'open' | 'thumbsUp';

export interface JointPosition {
  x: number;
  y: number;
  z: number;
}

export interface HandState {
  side: HandSide;
  tracked: boolean;
  joints: Map<string, JointPosition>;
  gesture: GestureType;
  confidence: number;
  pinchStrength: number;
  gripStrength: number;
}

export class HandTracker {
  private hands: Map<HandSide, HandState> = new Map();
  private gestureHistory: { side: HandSide; gesture: GestureType; timestamp: number }[] = [];
  private maxHistory: number = 100;

  constructor() {
    this.hands.set('left', this.createDefaultState('left'));
    this.hands.set('right', this.createDefaultState('right'));
  }

  private createDefaultState(side: HandSide): HandState {
    return {
      side,
      tracked: false,
      joints: new Map(),
      gesture: 'none',
      confidence: 0,
      pinchStrength: 0,
      gripStrength: 0,
    };
  }

  /**
   * Update joint positions for a hand
   */
  updateJoints(side: HandSide, joints: Record<string, JointPosition>): void {
    const state = this.hands.get(side)!;
    state.tracked = true;
    state.joints.clear();
    for (const [name, pos] of Object.entries(joints)) {
      state.joints.set(name, pos);
    }
    // Auto-detect gesture
    state.gesture = this.detectGesture(state);
    this.gestureHistory.push({ side, gesture: state.gesture, timestamp: Date.now() });
    if (this.gestureHistory.length > this.maxHistory) this.gestureHistory.shift();
  }

  /**
   * Update pinch/grip strength
   */
  updateStrength(side: HandSide, pinch: number, grip: number): void {
    const state = this.hands.get(side)!;
    state.pinchStrength = pinch;
    state.gripStrength = grip;
  }

  /**
   * Detect gesture from joint positions
   */
  private detectGesture(state: HandState): GestureType {
    if (state.pinchStrength > 0.8) return 'pinch';
    if (state.gripStrength > 0.8) return 'grab';

    const thumb = state.joints.get('thumb_tip');
    const index = state.joints.get('index_tip');
    const middle = state.joints.get('middle_tip');

    if (thumb && index && middle) {
      const indexDist = Math.sqrt(
        (thumb[0] - index[0]) ** 2 + (thumb[1] - index[1]) ** 2 + (thumb[2] - index[2]) ** 2
      );
      if (indexDist > 0.1 && state.gripStrength < 0.3) return 'point';
    }

    if (state.gripStrength > 0.6) return 'fist';
    if (state.gripStrength < 0.2 && state.pinchStrength < 0.2) return 'open';
    return 'none';
  }

  getHand(side: HandSide): HandState {
    return this.hands.get(side)!;
  }
  isTracked(side: HandSide): boolean {
    return this.hands.get(side)!.tracked;
  }
  getGesture(side: HandSide): GestureType {
    return this.hands.get(side)!.gesture;
  }
  getGestureHistory(): typeof this.gestureHistory {
    return [...this.gestureHistory];
  }
  getJoint(side: HandSide, joint: string): JointPosition | undefined {
    return this.hands.get(side)!.joints.get(joint);
  }
}
