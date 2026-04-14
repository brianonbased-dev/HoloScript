/**
 * @holoscript/core Movement Predictor
 *
 * Predicts the player's path based on current velocity and orientation.
 * Used by the AssetStreamer to prioritize background loading.
 */
import { Vector3 } from '@holoscript/core';

export interface IntentSignal {
  target: Vector3;
  weight: number; // 0-1 (confidence in intent)
}

export interface PredictiveWindow {
  center: [number, number, number];
  radius: number;
  likelihood: number;
}

export class MovementPredictor {
  private lastPosition: Vector3 = [0, 0, 0];
  private velocity: Vector3 = [0, 0, 0];
  private history: Vector3[] = [];
  private maxHistory: number = 60; // 1 second at 60fps
  private intent: IntentSignal | null = null;

  /**
   * Convert Vector3 to tuple for consistent handling
   */
  private toTuple(v: Vector3): [number, number, number] {
    return [v[0], v[1], v[2]];
  }

  /**
   * Update internal state with current player transform
   */
  public update(position: Vector3, dt: number): void {
    const currentPos = this.toTuple(position);

    if (dt > 0) {
      const lastPos = this.toTuple(this.lastPosition);
      this.velocity = [
        (currentPos[0] - lastPos[0]) / dt,
        (currentPos[1] - lastPos[1]) / dt,
        (currentPos[2] - lastPos[2]) / dt,
      ];
    }

    this.lastPosition = [currentPos[0], currentPos[1], currentPos[2]];

    // Tier 2: Update history buffer
    this.history.push([currentPos[0], currentPos[1], currentPos[2]]);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Set the player's current intent signal (Tier 3)
   */
  public setIntent(intent: IntentSignal | null): void {
    this.intent = intent;
  }

  /**
   * Tier 1: Linear Extrapolation
   */
  private predictLinear(lookahead: number): [number, number, number] {
    const lastPosTuple = this.toTuple(this.lastPosition);
    const velTuple = this.toTuple(this.velocity);
    return [
      lastPosTuple[0] + velTuple[0] * lookahead,
      lastPosTuple[1] + velTuple[1] * lookahead,
      lastPosTuple[2] + velTuple[2] * lookahead,
    ];
  }

  /**
   * Tier 2: Non-linear pathing (Bezier-based extrapolation)
   * Analyzes path curvature to predict smooth turns.
   */
  private predictRecurrent(lookahead: number): [number, number, number] {
    if (this.history.length < 5) return this.predictLinear(lookahead);

    // Use last 3 points to determine quadratic Bezier control point
    const p2 = this.toTuple(this.history[this.history.length - 1]);
    const p1 = this.toTuple(this.history[this.history.length - 3]);
    const p0 = this.toTuple(this.history[this.history.length - 5]);

    // Calculate velocity and acceleration vectors
    const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const v0 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];

    // Predicted point based on constant velocity and acceleration
    // pos = p + v*t + 0.5*a*t^2
    const acc = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];

    return [
      p2[0] + v1[0] * lookahead + 0.5 * acc[0] * lookahead ** 2,
      p2[1] + v1[1] * lookahead + 0.5 * acc[1] * lookahead ** 2,
      p2[2] + v1[2] * lookahead + 0.5 * acc[2] * lookahead ** 2,
    ];
  }

  /**
   * Tier 3: Intent-based biasing
   */
  private predictIntent(lookahead: number): [number, number, number] {
    const recurrent = this.predictRecurrent(lookahead);
    if (!this.intent) return recurrent;

    const targetPos = this.intent.target;
    const weight = this.intent.weight;

    // Interpolate between recurrent path and intent target
    const targetPosTuple = this.toTuple(targetPos);
    return [
      recurrent[0] * (1 - weight) + targetPosTuple[0] * weight,
      recurrent[1] * (1 - weight) + targetPosTuple[1] * weight,
      recurrent[2] * (1 - weight) + targetPosTuple[2] * weight,
    ];
  }

  /**
   * Get predictive windows for asset pre-fetching.
   * Combines all tiers into a prioritized set of windows.
   */
  public getPredictiveWindows(lookaheadSeconds: number): PredictiveWindow[] {
    const windows: PredictiveWindow[] = [];

    // 1. Ambient window (Tier 0: Immediate surroundings)
    windows.push({
      center: this.toTuple(this.lastPosition),
      radius: 10,
      likelihood: 1.0,
    });

    const speed = Math.sqrt(
      this.velocity[0] ** 2 + this.velocity[1] ** 2 + this.velocity[2] ** 2
    );

    if (speed > 0.5) {
      // 2. Linear prediction (High confidence, short term)
      windows.push({
        center: this.predictLinear(lookaheadSeconds),
        radius: speed * lookaheadSeconds * 0.3 + 5,
        likelihood: 0.9,
      });

      // 3. Ensembled/Intent prediction (Tier 3)
      const ensembleCenter = this.predictIntent(lookaheadSeconds);
      windows.push({
        center: ensembleCenter,
        radius: speed * lookaheadSeconds * 0.6 + 8,
        likelihood: 0.7,
      });
    }

    return windows;
  }
}
