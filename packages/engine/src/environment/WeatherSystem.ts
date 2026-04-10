/**
 * WeatherSystem.ts
 *
 * Dynamic weather: types, transitions, intensity,
 * wind, and environmental effects.
 *
 * @module environment
 */

// =============================================================================
// TYPES
// =============================================================================

export type WeatherType = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog' | 'sandstorm';

export interface WeatherState {
  type: WeatherType;
  intensity: number; // 0-1
  wind: { x: number; y: number; z: number; speed: number };
  temperature: number;
  humidity: number;
  visibility: number; // 0-1
  precipitation: number; // 0-1
}

export interface WeatherTransition {
  from: WeatherType;
  to: WeatherType;
  duration: number;
  elapsed: number;
}

// =============================================================================
// WEATHER SYSTEM
// =============================================================================

const WEATHER_DEFAULTS: Record<WeatherType, Partial<WeatherState>> = {
  clear: { intensity: 0, visibility: 1, precipitation: 0, humidity: 0.3 },
  cloudy: { intensity: 0.3, visibility: 0.9, precipitation: 0, humidity: 0.5 },
  rain: { intensity: 0.6, visibility: 0.6, precipitation: 0.7, humidity: 0.8 },
  storm: { intensity: 1, visibility: 0.3, precipitation: 1, humidity: 0.95 },
  snow: { intensity: 0.5, visibility: 0.5, precipitation: 0.6, humidity: 0.7 },
  fog: { intensity: 0.4, visibility: 0.2, precipitation: 0, humidity: 0.9 },
  sandstorm: { intensity: 0.8, visibility: 0.15, precipitation: 0, humidity: 0.1 },
};

export class WeatherSystem {
  private current: WeatherState;
  private transition: WeatherTransition | null = null;
  private targetState: WeatherState | null = null;
  private listeners: Array<(state: WeatherState) => void> = [];
  private history: Array<{ type: WeatherType; timestamp: number }> = [];

  constructor(initial: WeatherType = 'clear') {
    this.current = this.createState(initial);
    this.history.push({ type: initial, timestamp: Date.now() });
  }

  private createState(type: WeatherType): WeatherState {
    const defaults = WEATHER_DEFAULTS[type];
    return {
      type,
      intensity: defaults.intensity ?? 0,
      wind: { x: 0, y: 0, z: 0, speed: 0 },
      temperature: 20,
      humidity: defaults.humidity ?? 0.5,
      visibility: defaults.visibility ?? 1,
      precipitation: defaults.precipitation ?? 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Weather Control
  // ---------------------------------------------------------------------------

  setWeather(type: WeatherType, transitionDuration = 5): void {
    if (type === this.current.type && !this.transition) return;

    this.targetState = this.createState(type);
    this.transition = {
      from: this.current.type,
      to: type,
      duration: transitionDuration,
      elapsed: 0,
    };
    this.history.push({ type, timestamp: Date.now() });
  }

  setImmediate(type: WeatherType): void {
    this.current = this.createState(type);
    this.transition = null;
    this.targetState = null;
    this.notify();
  }

  setWind(x: number, y: number, z: number, speed: number): void {
    this.current.wind = { x, y, z, speed };
  }

  setTemperature(temp: number): void {
    this.current.temperature = temp;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    if (!this.transition || !this.targetState) return;

    this.transition.elapsed += dt;
    const t = Math.min(1, this.transition.elapsed / this.transition.duration);

    // Smooth interpolation
    const ease = t * t * (3 - 2 * t); // smoothstep

    this.current.intensity = this.lerp(this.current.intensity, this.targetState.intensity, ease);
    this.current.visibility = this.lerp(this.current.visibility, this.targetState.visibility, ease);
    this.current.precipitation = this.lerp(
      this.current.precipitation,
      this.targetState.precipitation,
      ease
    );
    this.current.humidity = this.lerp(this.current.humidity, this.targetState.humidity, ease);

    if (t >= 1) {
      this.current.type = this.transition.to;
      this.current = {
        ...this.targetState,
        wind: this.current.wind,
        temperature: this.current.temperature,
      };
      this.transition = null;
      this.targetState = null;
      this.notify();
    }
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  onChange(listener: (state: WeatherState) => void): void {
    this.listeners.push(listener);
  }
  private notify(): void {
    for (const l of this.listeners) l(this.getState());
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getState(): WeatherState {
    return { ...this.current, wind: { ...this.current.wind } };
  }
  getType(): WeatherType {
    return this.current.type;
  }
  isTransitioning(): boolean {
    return this.transition !== null;
  }
  getTransitionProgress(): number {
    return this.transition ? this.transition.elapsed / this.transition.duration : 0;
  }
  getHistory(): typeof this.history {
    return [...this.history];
  }
}
