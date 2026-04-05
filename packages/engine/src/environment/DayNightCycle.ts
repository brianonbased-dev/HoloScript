/**
 * DayNightCycle.ts
 *
 * Time of day simulation: sun/moon position, ambient lighting,
 * time scale control, and time-based events.
 *
 * @module environment
 */

// =============================================================================
// TYPES
// =============================================================================

export type TimeOfDay =
  | 'dawn'
  | 'morning'
  | 'noon'
  | 'afternoon'
  | 'dusk'
  | 'evening'
  | 'night'
  | 'midnight';

export interface DayNightState {
  time: number; // 0-24 hours
  sunAngle: number; // degrees
  moonAngle: number;
  sunIntensity: number; // 0-1
  moonIntensity: number;
  ambientColor: { r: number; g: number; b: number };
  ambientIntensity: number;
  period: TimeOfDay;
  dayCount: number;
}

// =============================================================================
// DAY NIGHT CYCLE
// =============================================================================

export class DayNightCycle {
  private time = 8; // Start at 8 AM
  private timeScale = 1; // 1 = real-time, 60 = 1 min per real second
  private dayCount = 0;
  private paused = false;
  private listeners: Array<(period: TimeOfDay, state: DayNightState) => void> = [];
  private lastPeriod: TimeOfDay = 'morning';

  // ---------------------------------------------------------------------------
  // Time Control
  // ---------------------------------------------------------------------------

  setTime(hours: number): void {
    this.time = ((hours % 24) + 24) % 24;
    this.lastPeriod = this.getPeriod();
  }

  setTimeScale(scale: number): void {
    this.timeScale = Math.max(0, scale);
  }
  getTimeScale(): number {
    return this.timeScale;
  }
  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
  }
  isPaused(): boolean {
    return this.paused;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    if (this.paused) return;

    const hourStep = (dt * this.timeScale) / 3600; // dt in seconds, scale to hours
    this.time += hourStep;

    while (this.time >= 24) {
      this.time -= 24;
      this.dayCount++;
    }

    const newPeriod = this.getPeriod();
    if (newPeriod !== this.lastPeriod) {
      this.lastPeriod = newPeriod;
      for (const l of this.listeners) l(newPeriod, this.getState());
    }
  }

  // ---------------------------------------------------------------------------
  // Sun / Moon
  // ---------------------------------------------------------------------------

  getSunAngle(): number {
    // Sun: rises at 6, sets at 18. Angle 0 at 6, 180 at 18.
    if (this.time >= 6 && this.time <= 18) {
      return ((this.time - 6) / 12) * 180;
    }
    return -1; // Below horizon
  }

  getMoonAngle(): number {
    // Moon: rises at 18, sets at 6.
    if (this.time >= 18 || this.time <= 6) {
      const moonTime = this.time >= 18 ? this.time - 18 : this.time + 6;
      return (moonTime / 12) * 180;
    }
    return -1;
  }

  getSunIntensity(): number {
    const angle = this.getSunAngle();
    if (angle < 0) return 0;
    return Math.sin((angle / 180) * Math.PI);
  }

  getMoonIntensity(): number {
    const angle = this.getMoonAngle();
    if (angle < 0) return 0;
    return Math.sin((angle / 180) * Math.PI) * 0.3;
  }

  // ---------------------------------------------------------------------------
  // Ambient
  // ---------------------------------------------------------------------------

  getAmbientColor(): { r: number; g: number; b: number } {
    const intensity = this.getSunIntensity();
    if (intensity > 0.7) return { r: 1, g: 0.95, b: 0.9 }; // Day
    if (intensity > 0.3) return { r: 1, g: 0.7, b: 0.4 }; // Sunset/Sunrise
    if (intensity > 0) return { r: 0.6, g: 0.3, b: 0.3 }; // Twilight
    return { r: 0.1, g: 0.1, b: 0.2 }; // Night
  }

  // ---------------------------------------------------------------------------
  // Period
  // ---------------------------------------------------------------------------

  getPeriod(): TimeOfDay {
    if (this.time >= 5 && this.time < 7) return 'dawn';
    if (this.time >= 7 && this.time < 11) return 'morning';
    if (this.time >= 11 && this.time < 13) return 'noon';
    if (this.time >= 13 && this.time < 17) return 'afternoon';
    if (this.time >= 17 && this.time < 19) return 'dusk';
    if (this.time >= 19 && this.time < 22) return 'evening';
    if (this.time >= 22 || this.time < 1) return 'night';
    return 'midnight';
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  onPeriodChange(listener: (period: TimeOfDay, state: DayNightState) => void): void {
    this.listeners.push(listener);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getTime(): number {
    return this.time;
  }
  getDayCount(): number {
    return this.dayCount;
  }

  getState(): DayNightState {
    return {
      time: this.time,
      sunAngle: this.getSunAngle(),
      moonAngle: this.getMoonAngle(),
      sunIntensity: this.getSunIntensity(),
      moonIntensity: this.getMoonIntensity(),
      ambientColor: this.getAmbientColor(),
      ambientIntensity: Math.max(this.getSunIntensity(), this.getMoonIntensity()),
      period: this.getPeriod(),
      dayCount: this.dayCount,
    };
  }

  getFormattedTime(): string {
    const h = Math.floor(this.time);
    const m = Math.floor((this.time % 1) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }
}

