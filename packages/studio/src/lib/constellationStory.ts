/**
 * constellationStory.ts — Constellation Storyteller Engine
 *
 * Real star data, mythological overlays, planetarium-style animation,
 * constellation line drawing, and sky navigation.
 */

export interface CelestialCoord {
  ra: number;               // Right Ascension (hours, 0-24)
  dec: number;              // Declination (degrees, -90 to +90)
}

export interface Star {
  id: string;
  name: string;
  bayer: string;            // e.g., 'α Ori' (Alpha Orionis)
  constellation: string;
  magnitude: number;        // apparent magnitude (lower = brighter)
  coord: CelestialCoord;
  spectralClass: string;    // e.g., 'M1Ia', 'B8Ia', 'G2V'
  distanceLY: number;       // light-years
  color: string;            // hex color from spectral class
}

export interface ConstellationDef {
  id: string;
  name: string;
  abbreviation: string;     // IAU 3-letter code
  mythology: string;
  culture: string;          // 'greek' | 'chinese' | 'aboriginal' | etc.
  stars: string[];           // Star IDs
  lines: Array<[string, string]>; // Pairs of star IDs to connect
  bestMonth: number;         // 1-12 for best viewing
}

export interface SkyState {
  latitude: number;
  longitude: number;
  dateTime: number;
  visibleConstellations: string[];
}

// ═══════════════════════════════════════════════════════════════════
// Star Database (famous stars)
// ═══════════════════════════════════════════════════════════════════

export const STAR_DATABASE: Star[] = [
  { id: 'sirius', name: 'Sirius', bayer: 'α CMa', constellation: 'canis-major', magnitude: -1.46, coord: { ra: 6.75, dec: -16.72 }, spectralClass: 'A1V', distanceLY: 8.6, color: '#a8c8ff' },
  { id: 'betelgeuse', name: 'Betelgeuse', bayer: 'α Ori', constellation: 'orion', magnitude: 0.42, coord: { ra: 5.92, dec: 7.41 }, spectralClass: 'M1Ia', distanceLY: 700, color: '#ff6644' },
  { id: 'rigel', name: 'Rigel', bayer: 'β Ori', constellation: 'orion', magnitude: 0.12, coord: { ra: 5.24, dec: -8.20 }, spectralClass: 'B8Ia', distanceLY: 860, color: '#a8c8ff' },
  { id: 'vega', name: 'Vega', bayer: 'α Lyr', constellation: 'lyra', magnitude: 0.03, coord: { ra: 18.62, dec: 38.78 }, spectralClass: 'A0V', distanceLY: 25, color: '#ffffff' },
  { id: 'polaris', name: 'Polaris', bayer: 'α UMi', constellation: 'ursa-minor', magnitude: 1.98, coord: { ra: 2.53, dec: 89.26 }, spectralClass: 'F7Ib', distanceLY: 433, color: '#fff4e8' },
  { id: 'antares', name: 'Antares', bayer: 'α Sco', constellation: 'scorpius', magnitude: 0.96, coord: { ra: 16.49, dec: -26.43 }, spectralClass: 'M1Ib', distanceLY: 550, color: '#ff4422' },
  { id: 'aldebaran', name: 'Aldebaran', bayer: 'α Tau', constellation: 'taurus', magnitude: 0.85, coord: { ra: 4.60, dec: 16.51 }, spectralClass: 'K5III', distanceLY: 65, color: '#ff8844' },
  { id: 'spica', name: 'Spica', bayer: 'α Vir', constellation: 'virgo', magnitude: 0.97, coord: { ra: 13.42, dec: -11.16 }, spectralClass: 'B1V', distanceLY: 250, color: '#aaccff' },
];

// ═══════════════════════════════════════════════════════════════════
// Core Functions
// ═══════════════════════════════════════════════════════════════════

export function getStarById(id: string): Star | undefined {
  return STAR_DATABASE.find(s => s.id === id);
}

export function starsByConstellation(constellationId: string): Star[] {
  return STAR_DATABASE.filter(s => s.constellation === constellationId);
}

export function brightestStar(stars: Star[]): Star | null {
  if (stars.length === 0) return null;
  return stars.reduce((best, s) => s.magnitude < best.magnitude ? s : best);
}

export function magnitudeToRadius(magnitude: number): number {
  // Brighter stars (lower magnitude) get bigger dots
  return Math.max(1, 5 - magnitude);
}

export function isVisibleToNakedEye(magnitude: number): boolean {
  return magnitude <= 6.5;
}

export function angularDistance(a: CelestialCoord, b: CelestialCoord): number {
  // Simplified angular distance in degrees
  const dRA = (a.ra - b.ra) * 15; // hours to degrees
  const dDec = a.dec - b.dec;
  return Math.sqrt(dRA * dRA + dDec * dDec);
}

export function spectralClassToTemperature(spectral: string): number {
  // Rough mapping from spectral class letter
  const letter = spectral[0];
  const temps: Record<string, number> = {
    O: 40000, B: 20000, A: 9000, F: 7000, G: 5500, K: 4500, M: 3000,
  };
  return temps[letter] ?? 5500;
}

export function isCircumpolar(dec: number, latitude: number): boolean {
  return dec > (90 - Math.abs(latitude));
}
