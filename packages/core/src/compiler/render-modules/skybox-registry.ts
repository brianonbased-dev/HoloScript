// Named skybox / background palette — companion to the geometry registry.
//
// HoloScript environments name their backdrop with evocative words
// (`deep_machine_ocean`, `nebula`, `studio`, `sunset`, …) rather than a hex
// literal. Before this registry, `parseColor` fell straight through to white for
// every one of those names, so hundreds of authored scenes rendered against a
// blank white void — the opposite of the world each `.holo` describes.
//
// This is the growable vocabulary: mapping a new skybox name to an atmospheric
// backdrop colour is one line here, and — like the geometry registry — the
// resolution is data separated from emission, so any target (WebGPU clear colour,
// a future gradient pass, an environment-lighting probe) can consume the same
// named palette its own way.

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    Number((parseInt(h.substring(0, 2), 16) / 255).toFixed(4)),
    Number((parseInt(h.substring(2, 4), 16) / 255).toFixed(4)),
    Number((parseInt(h.substring(4, 6), 16) / 255).toFixed(4)),
  ];
}

// Canonical backdrop colours keyed by skybox name. Values are the *dominant
// atmospheric tone* of the named environment (what fills the frame behind the
// scene), chosen to read plausibly under the compiler's flat clear-colour path.
const SKYBOX_HEX: Record<string, string> = {
  // ── deep / space / void ─────────────────────────────────────────────
  deep_machine_ocean: '#052430',
  deep_space: '#05060d',
  space: '#05060d',
  nebula: '#0b0618',
  night_sky: '#0b1020',
  night_overcast: '#14161c',
  void: '#050507',
  midnight: '#070a12',
  // ── water / underwater ──────────────────────────────────────────────
  ocean: '#063240',
  underwater: '#062a3a',
  // ── studio / neutral (light backdrops kept light, just not pure white) ─
  studio: '#c4c8cf',
  neutral_studio: '#c4c8cf',
  studio_soft: '#d2d5da',
  hdr_studio: '#c9ccd2',
  gallery: '#20222a',
  indoor_museum: '#1c1e24',
  interior_dark: '#14151a',
  classroom: '#d2cfc6',
  warehouse: '#3a3c40',
  asset_pipeline_warehouse: '#3a3c40',
  // ── sky / daylight ──────────────────────────────────────────────────
  procedural_sky: '#8fbce6',
  clear_sky: '#8fbce6',
  daylight: '#9ec6ea',
  fantasy_sky: '#2a3a6a',
  sunset: '#46283a',
  dusk: '#2e2740',
  desert_dawn: '#caa079',
  // ── tech / abstract ─────────────────────────────────────────────────
  digital_grid: '#0a0f1e',
  gradient: '#1a2030',
  // ── environments / scenes ───────────────────────────────────────────
  industrial: '#2a2d30',
  urban_courtyard: '#3a3d42',
  ancient_ruins: '#3a3428',
  concert_venue: '#0e0a14',
  lounge: '#1a1220',
  farm: '#7fae5a',
  vault_archive: '#1a140a',
  passthrough: '#0c0c0e',
  default: '#0a0e14',
};

// Unknown / unnamed backgrounds resolve to a calm deep neutral, NOT white — a
// blank white void is essentially never the intended backdrop for a 3D scene.
const FALLBACK: [number, number, number] = hexToRgb('#0a0e14');

/**
 * Resolve a skybox / background NAME (not a hex or array) to a backdrop colour.
 * Case-insensitive; unknown names fall back to a calm deep neutral.
 */
export function resolveSkyboxColor(name: string | undefined | null): [number, number, number] {
  const key = String(name ?? '')
    .trim()
    .toLowerCase();
  const hex = SKYBOX_HEX[key];
  return hex ? hexToRgb(hex) : FALLBACK;
}

/** All skybox names the palette currently understands (for diagnostics/tests). */
export function knownSkyboxNames(): string[] {
  return Object.keys(SKYBOX_HEX);
}
