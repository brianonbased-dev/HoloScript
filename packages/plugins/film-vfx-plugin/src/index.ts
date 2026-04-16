/**
 * @holoscript/plugin-film-vfx v1.0.0
 * Film/VFX domain plugin for HoloScript
 *
 * Traits:
 *   @shot_list         — Shot planning, sequencing, lens/movement
 *   @color_grade       — Color grading, LUT management, lift/gamma/gain
 *   @dmx_lighting      — DMX512/Art-Net/sACN fixture control
 *   @director_ai       — AI blocking, motivation, emotional beats, coverage
 *   @virtual_production — LED wall ICVFX, frustum, tracking, sync
 *
 * The plugin does NOT modify HoloScript core. It provides domain-specific
 * trait types, handlers, and a compile function for film/VFX verticals.
 *
 * @packageDocumentation
 */

// ============================================================================
// Trait re-exports
// ============================================================================

export {
  type ShotType,
  type CameraMovement,
  type LensConfig,
  type ShotListConfig,
  type ShotListTraitHandler,
  createShotListHandler,
} from './traits/ShotListTrait';

export {
  type LiftGammaGain,
  type ColorGradeConfig,
  type ColorGradeTraitHandler,
  createColorGradeHandler,
} from './traits/ColorGradeTrait';

export {
  type FixtureType,
  type DMXProtocol,
  type GoboConfig,
  type DMXLightingConfig,
  type DMXLightingTraitHandler,
  createDMXLightingHandler,
} from './traits/DMXLightingTrait';

export {
  type BlockingMark,
  type EmotionalBeat,
  type CoverageType,
  type CoverageRequirement,
  type DirectorAIConfig,
  type DirectorAITraitHandler,
  createDirectorAIHandler,
} from './traits/DirectorAITrait';

export {
  type SyncMode,
  type LEDPanelLayout,
  type FrustumConfig,
  type LEDWallConfig,
  type CameraTrackingConfig,
  type VirtualProductionConfig,
  type VirtualProductionTraitHandler,
  createVirtualProductionHandler,
} from './traits/VirtualProductionTrait';

export {
  type TextToUniverseConfig,
  type TextToUniverseState,
  createTextToUniverseHandler,
} from './traits/TextToUniverseTrait';

/** Push VP metadata into the CRDT root shared with `LoroWebRTCProvider` (crdt-spatial). */
export { syncVirtualProductionToVolumetricCrdt, FILM3D_VOLUMETRICS_ROOT } from './volumetricLoroBridge';

// ============================================================================
// Domain traits (tagged union)
// ============================================================================

import type { ShotListConfig } from './traits/ShotListTrait';
import type { ColorGradeConfig } from './traits/ColorGradeTrait';
import type { DMXLightingConfig } from './traits/DMXLightingTrait';
import type { DirectorAIConfig } from './traits/DirectorAITrait';
import type { VirtualProductionConfig } from './traits/VirtualProductionTrait';
import type { TextToUniverseConfig } from './traits/TextToUniverseTrait';

// ============================================================================
// LegacyImporter routing definitions (flat -> namespaced)
// ============================================================================

export type FilmVFXFlatTraitName =
  | 'shot_list'
  | 'color_grade'
  | 'dmx_lighting'
  | 'director_ai'
  | 'virtual_production'
  | 'text_to_universe';

export type FilmVFXNamespacedTraitName = `FilmVFXPlugin.${FilmVFXFlatTraitName}`;

export type FilmVFXTraitToken<TFlat extends FilmVFXFlatTraitName = FilmVFXFlatTraitName> =
  | TFlat
  | `FilmVFXPlugin.${TFlat}`;

/**
 * Mirrors absorb LegacyImporter routing so plugin-local compilation can accept
 * either legacy flat trait discriminants or namespaced envelope tokens.
 */
export const LEGACY_IMPORTER_ROUTING_DEFINITIONS: Readonly<
  Record<FilmVFXFlatTraitName, FilmVFXNamespacedTraitName>
> = {
  shot_list: 'FilmVFXPlugin.shot_list',
  color_grade: 'FilmVFXPlugin.color_grade',
  dmx_lighting: 'FilmVFXPlugin.dmx_lighting',
  director_ai: 'FilmVFXPlugin.director_ai',
  virtual_production: 'FilmVFXPlugin.virtual_production',
  text_to_universe: 'FilmVFXPlugin.text_to_universe',
} as const;

export function toNamespacedFilmVFXTraitToken(token: string): string {
  const normalized = token.trim().replace(/^@+/, '');
  if (normalized in LEGACY_IMPORTER_ROUTING_DEFINITIONS) {
    return LEGACY_IMPORTER_ROUTING_DEFINITIONS[normalized as FilmVFXFlatTraitName];
  }
  return normalized;
}

export function routeNamespacedFilmVFXTraitEnvelopes(source: string): string {
  let out = source;
  for (const [flat, namespaced] of Object.entries(LEGACY_IMPORTER_ROUTING_DEFINITIONS)) {
    const atRe = new RegExp(`@(["']?)(${flat})\\1(?!\\.)`, 'g');
    out = out.replace(atRe, () => `@${namespaced}`);

    out = out.replace(
      new RegExp(`((?:\\btrait\\b|"trait")\\s*:\\s*)(["'])(${flat})\\2(?!\\.)`, 'gi'),
      `$1$2${namespaced}$2`
    );
  }
  return out;
}

function normalizeFilmVFXTraitToken(token: string): FilmVFXFlatTraitName | null {
  const normalized = token.replace(/^@+/, '').trim();
  if (normalized in LEGACY_IMPORTER_ROUTING_DEFINITIONS) {
    return normalized as FilmVFXFlatTraitName;
  }
  if (normalized.startsWith('FilmVFXPlugin.')) {
    const flat = normalized.slice('FilmVFXPlugin.'.length);
    if (flat in LEGACY_IMPORTER_ROUTING_DEFINITIONS) {
      return flat as FilmVFXFlatTraitName;
    }
  }
  return null;
}

export interface ShotListTrait extends ShotListConfig {
  trait: FilmVFXTraitToken<'shot_list'>;
}

export interface ColorGradeTrait extends ColorGradeConfig {
  trait: FilmVFXTraitToken<'color_grade'>;
}

export interface DMXLightingTrait extends DMXLightingConfig {
  trait: FilmVFXTraitToken<'dmx_lighting'>;
}

export interface DirectorAITrait extends DirectorAIConfig {
  trait: FilmVFXTraitToken<'director_ai'>;
}

export interface VirtualProductionTrait extends VirtualProductionConfig {
  trait: FilmVFXTraitToken<'virtual_production'>;
}

export interface TextToUniversePluginTrait extends TextToUniverseConfig {
  trait: FilmVFXTraitToken<'text_to_universe'>;
}

export type FilmVFXTrait =
  | ShotListTrait
  | ColorGradeTrait
  | DMXLightingTrait
  | DirectorAITrait
  | VirtualProductionTrait
  | TextToUniversePluginTrait;

// ============================================================================
// Compile
// ============================================================================

export interface FilmVFXCompileOptions {
  format?: 'holo' | 'edl' | 'otio' | 'json';
}

/**
 * Compile film/VFX traits into a target representation.
 *
 * - `holo`  — HoloScript .holo composition (default)
 * - `edl`   — CMX3600 Edit Decision List
 * - `otio`  — OpenTimelineIO JSON
 * - `json`  — Raw JSON export
 */
export function compile(traits: FilmVFXTrait[], opts: FilmVFXCompileOptions = {}): string {
  const format = opts.format ?? 'holo';

  switch (format) {
    case 'holo':
      return compileToHolo(traits);
    case 'edl':
      return compileToEDL(traits);
    case 'otio':
      return compileToOTIO(traits);
    case 'json':
      return JSON.stringify(traits, null, 2);
    default:
      throw new Error(`Unsupported film/VFX format: ${format as string}`);
  }
}

function compileToHolo(traits: FilmVFXTrait[]): string {
  const lines: string[] = ['composition "FilmVFXScene" {'];

  for (const t of traits) {
    const traitToken = normalizeFilmVFXTraitToken(t.trait);
    switch (traitToken) {
      case 'shot_list': {
        const s = t as ShotListTrait;
        lines.push(`  object "Shot_${s.shotId}" @shot_list {`);
        lines.push(`    scene: ${s.scene}`);
        lines.push(`    shotType: "${s.shotType}"`);
        lines.push(`    duration: ${s.duration}`);
        lines.push(`    lens: { focalLength: ${s.lens.focalLength} }`);
        lines.push(`    movement: "${s.movement}"`);
        lines.push('  }');
        break;
      }
      case 'color_grade': {
        const g = t as ColorGradeTrait;
        lines.push(`  object "${g.gradeName ?? 'Grade'}" @color_grade {`);
        lines.push(`    temperature: ${g.temperature}`);
        lines.push(`    contrast: ${g.contrast}`);
        lines.push(`    saturation: ${g.saturation}`);
        if (g.lut) lines.push(`    lut: "${g.lut}"`);
        lines.push('  }');
        break;
      }
      case 'dmx_lighting': {
        const d = t as DMXLightingTrait;
        lines.push(`  object "${d.label ?? `Fixture_U${d.universe}_CH${d.channel}`}" @dmx_lighting {`);
        lines.push(`    universe: ${d.universe}`);
        lines.push(`    channel: ${d.channel}`);
        lines.push(`    fixtureType: "${d.fixtureType}"`);
        lines.push(`    intensity: ${d.intensity}`);
        lines.push(`    color: [${d.color.join(', ')}]`);
        lines.push('  }');
        break;
      }
      case 'director_ai': {
        const dir = t as DirectorAITrait;
        lines.push(`  object "Director_${dir.sceneId}" @director_ai {`);
        lines.push(`    blocking: ${dir.blocking.length} marks`);
        lines.push(`    coverage: ${dir.coverage.length} requirements`);
        lines.push(`    beats: ${dir.emotionalBeats.length}`);
        lines.push('  }');
        break;
      }
      case 'virtual_production': {
        const vp = t as VirtualProductionTrait;
        lines.push(`  object "VP_${vp.stageId}" @virtual_production {`);
        lines.push(`    walls: ${vp.walls.length}`);
        lines.push(`    syncMode: "${vp.syncMode}"`);
        lines.push(`    frameRate: ${vp.frameRate}`);
        lines.push(`    tracking: "${vp.tracking.system}"`);
        lines.push('  }');
        break;
      }
      case 'text_to_universe': {
        const ttu = t as TextToUniversePluginTrait;
        lines.push(`  object "TTU_${ttu.llmProvider}" @text_to_universe {`);
        lines.push(`    provider: "${ttu.llmProvider}"`);
        lines.push(`    narrative: "${ttu.narrativeConsistency}"`);
        lines.push('  }');
        break;
      }
      case null:
        // Ignore unknown trait discriminants in plugin-level compile pass.
        break;
    }
  }

  lines.push('}');
  return lines.join('\n');
}

function compileToEDL(traits: FilmVFXTrait[]): string {
  const lines: string[] = ['TITLE: HoloScript Film/VFX Export', ''];
  let eventNum = 1;
  let tcOffset = 0;

  const shotTraits = traits.filter(
    (t): t is ShotListTrait => normalizeFilmVFXTraitToken(t.trait) === 'shot_list'
  );

  for (const shot of shotTraits) {
    const tcIn = formatTimecode(tcOffset, 24);
    const tcOut = formatTimecode(tcOffset + shot.duration, 24);
    lines.push(
      `${String(eventNum).padStart(3, '0')}  ` +
        `AX       V     C        ` +
        `${tcIn} ${tcOut} ${tcIn} ${tcOut}`
    );
    lines.push(`* SHOT: ${shot.shotId} | ${shot.shotType} | ${shot.movement} | ${shot.lens.focalLength}mm`);
    if (shot.description) lines.push(`* NOTE: ${shot.description}`);
    lines.push('');
    tcOffset += shot.duration;
    eventNum++;
  }

  return lines.join('\n');
}

function compileToOTIO(traits: FilmVFXTrait[]): string {
  const shotTraits = traits.filter(
    (t): t is ShotListTrait => normalizeFilmVFXTraitToken(t.trait) === 'shot_list'
  );

  const timeline = {
    OTIO_SCHEMA: 'Timeline.1',
    name: 'HoloScript Film/VFX Export',
    tracks: {
      OTIO_SCHEMA: 'Stack.1',
      children: [
        {
          OTIO_SCHEMA: 'Track.1',
          name: 'V1',
          kind: 'Video',
          children: shotTraits.map((shot) => ({
            OTIO_SCHEMA: 'Clip.1',
            name: `Shot_${shot.shotId}`,
            source_range: {
              OTIO_SCHEMA: 'TimeRange.1',
              start_time: { OTIO_SCHEMA: 'RationalTime.1', value: 0, rate: 24 },
              duration: { OTIO_SCHEMA: 'RationalTime.1', value: shot.duration * 24, rate: 24 },
            },
            metadata: {
              holoscript: {
                shotType: shot.shotType,
                movement: shot.movement,
                focalLength: shot.lens.focalLength,
                scene: shot.scene,
              },
            },
          })),
        },
      ],
    },
  };

  return JSON.stringify(timeline, null, 2);
}

function formatTimecode(seconds: number, fps: number): string {
  const totalFrames = Math.round(seconds * fps);
  const h = Math.floor(totalFrames / (fps * 3600));
  const m = Math.floor((totalFrames % (fps * 3600)) / (fps * 60));
  const s = Math.floor((totalFrames % (fps * 60)) / fps);
  const f = totalFrames % fps;
  return [h, m, s, f].map((v) => String(v).padStart(2, '0')).join(':');
}

// ============================================================================
// Plugin registration
// ============================================================================

import { createShotListHandler } from './traits/ShotListTrait';
import { createColorGradeHandler } from './traits/ColorGradeTrait';
import { createDMXLightingHandler } from './traits/DMXLightingTrait';
import { createDirectorAIHandler } from './traits/DirectorAITrait';
import { createVirtualProductionHandler } from './traits/VirtualProductionTrait';
import { createTextToUniverseHandler } from './traits/TextToUniverseTrait';

/** All trait handlers provided by this plugin */
export const traitHandlers = [
  createShotListHandler(),
  createColorGradeHandler(),
  createDMXLightingHandler(),
  createDirectorAIHandler(),
  createVirtualProductionHandler(),
  createTextToUniverseHandler(),
] as const;

// ============================================================================
// Version & PluginMeta
// ============================================================================

export const VERSION = '1.0.0';

/** Plugin metadata for PluginLifecycleManager registration */
export const pluginMeta = {
  id: 'film-vfx',
  name: 'Film/VFX',
  version: VERSION,
  description: 'Shot lists, color grading, DMX lighting, director AI, and virtual production for HoloScript',
  traits: ['shot_list', 'color_grade', 'dmx_lighting', 'director_ai', 'virtual_production', 'text_to_universe'],
  compileFormats: ['holo', 'edl', 'otio', 'json'],
} as const;

export default {
  VERSION,
  pluginMeta,
  traitHandlers,
  compile,
};
