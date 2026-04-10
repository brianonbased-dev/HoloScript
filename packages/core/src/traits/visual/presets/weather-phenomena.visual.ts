import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for weather phenomena traits (28 traits).
 * Atmospheric effects and natural disasters.
 */
export const WEATHER_PHENOMENA_VISUALS: Record<string, TraitVisualConfig> = {
  lightning_bolt: {
    emissive: { color: '#FFFFFF', intensity: 4.0 },
    material: { emissive: '#E0E0FF', emissiveIntensity: 4.0 },
    particleEffect: 'lightning',
    tags: ['electric', 'bright'],
    layer: 'environmental',
  },
  tornado: {
    particleEffect: 'vortex',
    material: { transparent: true, opacity: 0.5, color: '#6B6B6B' },
    tags: ['wind', 'destructive'],
    layer: 'environmental',
  },
  earthquake: {
    tags: ['ground', 'destructive'],
    layer: 'environmental',
  },
  tsunami: {
    material: { color: '#1A5276', transparent: true, opacity: 0.7 },
    tags: ['water', 'destructive'],
    layer: 'environmental',
  },
  aurora: {
    emissive: { color: '#00FF88', intensity: 1.5 },
    material: { emissive: '#00FF88', emissiveIntensity: 1.5, transparent: true, opacity: 0.4 },
    tags: ['emissive', 'colorful', 'atmospheric'],
    layer: 'environmental',
  },
  meteor_shower: {
    emissive: { color: '#FF6600', intensity: 2.0 },
    particleEffect: 'meteors',
    tags: ['celestial', 'bright'],
    layer: 'environmental',
  },
  eclipse: {
    material: { color: '#1A1A2E' },
    emissive: { color: '#FF4500', intensity: 0.5 },
    tags: ['dark', 'celestial'],
    layer: 'environmental',
  },
  rainbow_weather: {
    material: { iridescence: 1.0, iridescenceIOR: 1.5, transparent: true, opacity: 0.5 },
    tags: ['colorful', 'atmospheric'],
    layer: 'environmental',
  },
  blizzard: {
    particleEffect: 'snow_heavy',
    material: { color: '#E8F4FD' },
    tags: ['cold', 'white', 'particle'],
    layer: 'environmental',
  },
  sandstorm: {
    particleEffect: 'sand',
    material: { color: '#C4A35A', transparent: true, opacity: 0.6 },
    tags: ['desert', 'particle'],
    layer: 'environmental',
  },
  hailstorm: {
    particleEffect: 'hail',
    tags: ['cold', 'destructive'],
    layer: 'environmental',
  },
  thunderstorm: {
    emissive: { color: '#CCCCFF', intensity: 2.0 },
    material: { color: '#2C3E50' },
    tags: ['dark', 'electric'],
    layer: 'environmental',
  },
  hurricane: {
    particleEffect: 'vortex_large',
    material: { color: '#4A6B7C' },
    tags: ['wind', 'destructive'],
    layer: 'environmental',
  },
  typhoon: {
    particleEffect: 'vortex_large',
    material: { color: '#3D5A6E' },
    tags: ['wind', 'water', 'destructive'],
    layer: 'environmental',
  },
  flood: {
    material: { color: '#4A7C8C', transparent: true, opacity: 0.7 },
    tags: ['water', 'destructive'],
    layer: 'environmental',
  },
  drought: {
    material: { roughness: 1.0, color: '#D4A76A' },
    tags: ['dry', 'hot'],
    layer: 'environmental',
  },
  avalanche: {
    particleEffect: 'snow_heavy',
    material: { color: '#FFFFFF' },
    tags: ['cold', 'destructive'],
    layer: 'environmental',
  },
  landslide: {
    material: { roughness: 0.95, color: '#6B4423' },
    tags: ['ground', 'destructive'],
    layer: 'environmental',
  },
  geyser: {
    particleEffect: 'steam_jet',
    emissive: { color: '#AADDFF', intensity: 0.8 },
    tags: ['water', 'hot'],
    layer: 'environmental',
  },
  whirlpool: {
    material: { color: '#003366', transparent: true, opacity: 0.7 },
    tags: ['water', 'animated'],
    layer: 'environmental',
  },
  waterspout: {
    particleEffect: 'water_vortex',
    material: { color: '#4488AA', transparent: true, opacity: 0.6 },
    tags: ['water', 'wind'],
    layer: 'environmental',
  },
  volcanic_eruption: {
    emissive: { color: '#FF4500', intensity: 3.0 },
    material: { emissive: '#FF4500', emissiveIntensity: 3.0, color: '#8B0000' },
    particleEffect: 'lava',
    tags: ['hot', 'destructive', 'emissive'],
    layer: 'environmental',
  },
  sinkhole: {
    material: { color: '#2C1A0E' },
    tags: ['ground', 'dark'],
    layer: 'environmental',
  },
  wildfire: {
    emissive: { color: '#FF6600', intensity: 2.5 },
    material: { emissive: '#FF6600', emissiveIntensity: 2.5, color: '#CC3300' },
    particleEffect: 'fire_large',
    tags: ['hot', 'destructive', 'emissive'],
    layer: 'environmental',
  },
  heatwave: {
    material: { transparent: true, opacity: 0.9 },
    tags: ['hot', 'distortion'],
    layer: 'environmental',
  },
  cold_snap: {
    material: { color: '#D6EAF8', roughness: 0.3 },
    tags: ['cold'],
    layer: 'environmental',
  },
  monsoon: {
    particleEffect: 'rain_heavy',
    material: { color: '#4A6B7C' },
    tags: ['water', 'wind'],
    layer: 'environmental',
  },
  solar_flare: {
    emissive: { color: '#FFCC00', intensity: 4.0 },
    material: { emissive: '#FFCC00', emissiveIntensity: 4.0 },
    tags: ['celestial', 'bright', 'hot'],
    layer: 'environmental',
  },
};
