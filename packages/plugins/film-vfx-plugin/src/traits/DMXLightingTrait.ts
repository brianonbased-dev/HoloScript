/**
 * @dmx_lighting trait — DMX512 lighting control for film/VFX and stage
 *
 * Controls DMX universes, fixture channels, intensity, color, and gobos.
 * Supports Art-Net and sACN protocols for integration with physical
 * lighting rigs and LED walls.
 *
 * @module @holoscript/plugin-film-vfx
 */

// ============================================================================
// Types
// ============================================================================

export type FixtureType =
  | 'fresnel'
  | 'led_panel'
  | 'led_tube'
  | 'moving_head'
  | 'par'
  | 'profile'
  | 'strobe'
  | 'cyc_light'
  | 'follow_spot'
  | 'practical'
  | 'hmi'
  | 'tungsten'
  | 'rgb_wash'
  | 'pixel_bar';

export type DMXProtocol = 'dmx512' | 'artnet' | 'sacn';

export interface GoboConfig {
  /** Gobo wheel slot index */
  slot: number;
  /** Gobo rotation speed (degrees/sec, 0 = static) */
  rotation?: number;
  /** Gobo name/description */
  name?: string;
}

export interface DMXLightingConfig {
  /** DMX universe number (1-based) */
  universe: number;
  /** Start channel address (1-512) */
  channel: number;
  /** Number of channels this fixture uses */
  channelCount: number;
  /** Fixture type */
  fixtureType: FixtureType;
  /** Master intensity (0-255 DMX, or 0-100 percent) */
  intensity: number;
  /** Intensity unit */
  intensityUnit?: 'dmx' | 'percent';
  /** RGB color (0-255 per channel) */
  color: [number, number, number];
  /** Color temperature in Kelvin (for white fixtures) */
  colorTemp?: number;
  /** Gobo configuration (for moving heads / profiles) */
  gobo?: GoboConfig;
  /** Pan angle in degrees (for moving heads) */
  pan?: number;
  /** Tilt angle in degrees (for moving heads) */
  tilt?: number;
  /** Dimmer curve */
  dimmerCurve?: 'linear' | 'square' | 'inverse_square' | 'scurve';
  /** DMX protocol for output */
  protocol?: DMXProtocol;
  /** Art-Net subnet/universe (if protocol = artnet) */
  artnetSubnet?: number;
  /** Fixture label for patch list */
  label?: string;
  /** Group assignment (e.g., "key", "fill", "back", "practical") */
  group?: string;
}

// ============================================================================
// Trait Handler
// ============================================================================

export interface DMXLightingTraitHandler {
  name: 'dmx_lighting';
  defaultConfig: DMXLightingConfig;
  onAttach(entity: unknown, config: DMXLightingConfig): void;
  onDetach(entity: unknown): void;
  onUpdate(entity: unknown, config: Partial<DMXLightingConfig>): void;
  onEvent(entity: unknown, event: string, payload: unknown): void;
}

export function createDMXLightingHandler(): DMXLightingTraitHandler {
  return {
    name: 'dmx_lighting',
    defaultConfig: {
      universe: 1,
      channel: 1,
      channelCount: 6,
      fixtureType: 'led_panel',
      intensity: 255,
      intensityUnit: 'dmx',
      color: [255, 255, 255],
      dimmerCurve: 'linear',
      protocol: 'dmx512',
    },
    onAttach(entity: unknown, config: DMXLightingConfig): void {
      // Register fixture in DMX universe, allocate channels
      void entity;
      void config;
    },
    onDetach(entity: unknown): void {
      // Release DMX channels, zero intensity
      void entity;
    },
    onUpdate(entity: unknown, config: Partial<DMXLightingConfig>): void {
      // Update DMX channel values in real-time (intensity, color, position)
      void entity;
      void config;
    },
    onEvent(entity: unknown, event: string, payload: unknown): void {
      // Handle events: 'blackout', 'full', 'cue_go', 'strobe_on', 'strobe_off', 'park'
      void entity;
      void event;
      void payload;
    },
  };
}
