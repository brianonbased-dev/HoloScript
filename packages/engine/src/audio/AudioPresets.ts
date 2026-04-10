/**
 * AudioPresets.ts
 *
 * Pre-configured audio source settings for common VR scenarios.
 */

import type { AudioSourceConfig } from './AudioEngine';

type PartialAudioConfig = Partial<Omit<AudioSourceConfig, 'id'>>;

export const AudioPresets: Record<string, PartialAudioConfig> = {
  /** Close-range UI click/tap */
  uiClick: {
    volume: 0.6,
    spatialize: false,
    loop: false,
    channel: 'ui',
    maxDistance: 5,
  },

  /** UI hover feedback */
  uiHover: {
    volume: 0.3,
    spatialize: false,
    loop: false,
    channel: 'ui',
  },

  /** Ambient environmental loop */
  ambientLoop: {
    volume: 0.4,
    spatialize: false,
    loop: true,
    channel: 'ambient',
    maxDistance: 100,
  },

  /** Spatial object interaction (grab, drop) */
  objectInteraction: {
    volume: 0.8,
    spatialize: true,
    loop: false,
    refDistance: 0.5,
    maxDistance: 10,
    rolloffFactor: 2,
    channel: 'sfx',
  },

  /** Distant environmental sound */
  distantAmbient: {
    volume: 0.5,
    spatialize: true,
    loop: true,
    refDistance: 5,
    maxDistance: 100,
    rolloffFactor: 0.5,
    channel: 'ambient',
  },

  /** Footstep / movement */
  footstep: {
    volume: 0.5,
    spatialize: true,
    loop: false,
    refDistance: 1,
    maxDistance: 15,
    rolloffFactor: 1.5,
    channel: 'sfx',
  },

  /** Alert / notification */
  notification: {
    volume: 0.7,
    spatialize: false,
    loop: false,
    channel: 'ui',
  },

  /** Music background */
  music: {
    volume: 0.3,
    spatialize: false,
    loop: true,
    channel: 'music',
  },
};
