/**
 * Atmosphere, Sky & Environment Rendering Traits
 */
export const ATMOSPHERE_SKY_TRAITS = [
  'atmosphere_bruneton',
  'atmosphere_gradient',
  'atmosphere_hdri',
  'sky_dome',
  'sun_disc',
  'moon_disc',
  'starfield',
  'aurora',
  'volumetric_clouds',
  'cirrus_clouds',
  'cumulus_clouds',
  'stratus_clouds',
  'cloud_shadow',
  'day_night_cycle',
  'time_of_day',
  'twilight',
  'rainbow_arc',
  'lightning_flash',
  'meteor_shower',
  // Solar corona — MHD flux-tube loops, streamer belt, coronal holes, CME events (A-009)
  'corona_simulation',
] as const;

export type AtmosphereSkyTraitName = (typeof ATMOSPHERE_SKY_TRAITS)[number];
