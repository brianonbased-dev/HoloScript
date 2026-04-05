/**
 * HapticFeedback — Pulse patterns, intensity curves, spatial haptics
 *
 * @version 1.0.0
 */

export type HapticHand = 'left' | 'right' | 'both';

export interface HapticPulse {
  hand: HapticHand;
  intensity: number; // 0-1
  durationMs: number;
  frequency: number; // Hz
}

export interface HapticPattern {
  name: string;
  pulses: HapticPulse[];
  loop: boolean;
}

export class HapticFeedback {
  private patterns: Map<string, HapticPattern> = new Map();
  private activePulses: { hand: HapticHand; pulse: HapticPulse; startTime: number }[] = [];
  private enabled: boolean = true;
  private globalIntensity: number = 1;

  constructor() {
    this.registerPresets();
  }

  private registerPresets(): void {
    this.registerPattern({
      name: 'tap',
      loop: false,
      pulses: [{ hand: 'right', intensity: 0.5, durationMs: 50, frequency: 200 }],
    });
    this.registerPattern({
      name: 'grab',
      loop: false,
      pulses: [
        { hand: 'right', intensity: 0.3, durationMs: 30, frequency: 150 },
        { hand: 'right', intensity: 0.7, durationMs: 100, frequency: 250 },
      ],
    });
    this.registerPattern({
      name: 'impact',
      loop: false,
      pulses: [{ hand: 'both', intensity: 1.0, durationMs: 150, frequency: 300 }],
    });
    this.registerPattern({
      name: 'heartbeat',
      loop: true,
      pulses: [
        { hand: 'both', intensity: 0.6, durationMs: 80, frequency: 100 },
        { hand: 'both', intensity: 0.3, durationMs: 60, frequency: 100 },
      ],
    });
  }

  /**
   * Register a haptic pattern
   */
  registerPattern(pattern: HapticPattern): void {
    this.patterns.set(pattern.name, pattern);
  }

  /**
   * Play a named pattern
   */
  play(patternName: string, hand?: HapticHand): boolean {
    if (!this.enabled) return false;
    const pattern = this.patterns.get(patternName);
    if (!pattern) return false;

    const now = Date.now();
    for (const pulse of pattern.pulses) {
      const effective = {
        ...pulse,
        hand: hand ?? pulse.hand,
        intensity: pulse.intensity * this.globalIntensity,
      };
      this.activePulses.push({ hand: effective.hand, pulse: effective, startTime: now });
    }
    return true;
  }

  /**
   * Fire a single custom pulse
   */
  pulse(hand: HapticHand, intensity: number, durationMs: number, frequency: number = 200): void {
    if (!this.enabled) return;
    const p: HapticPulse = {
      hand,
      intensity: intensity * this.globalIntensity,
      durationMs,
      frequency,
    };
    this.activePulses.push({ hand, pulse: p, startTime: Date.now() });
  }

  /**
   * Stop all active haptics
   */
  stopAll(): void {
    this.activePulses = [];
  }

  /**
   * Get active pulse count
   */
  getActivePulseCount(): number {
    return this.activePulses.length;
  }
  getPatternCount(): number {
    return this.patterns.size;
  }
  getPattern(name: string): HapticPattern | undefined {
    return this.patterns.get(name);
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  isEnabled(): boolean {
    return this.enabled;
  }
  setGlobalIntensity(v: number): void {
    this.globalIntensity = Math.max(0, Math.min(1, v));
  }
  getGlobalIntensity(): number {
    return this.globalIntensity;
  }
}
