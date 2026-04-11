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

// ============================================================================
// Domain traits (tagged union)
// ============================================================================

import type { ShotListConfig } from './traits/ShotListTrait';
import type { ColorGradeConfig } from './traits/ColorGradeTrait';
import type { DMXLightingConfig } from './traits/DMXLightingTrait';
import type { DirectorAIConfig } from './traits/DirectorAITrait';
import type { VirtualProductionConfig } from './traits/VirtualProductionTrait';

export interface ShotListTrait extends ShotListConfig {
  trait: 'shot_list';
}

export interface ColorGradeTrait extends ColorGradeConfig {
  trait: 'color_grade';
}

export interface DMXLightingTrait extends DMXLightingConfig {
  trait: 'dmx_lighting';
}

export interface DirectorAITrait extends DirectorAIConfig {
  trait: 'director_ai';
}

export interface VirtualProductionTrait extends VirtualProductionConfig {
  trait: 'virtual_production';
}

export type FilmVFXTrait =
  | ShotListTrait
  | ColorGradeTrait
  | DMXLightingTrait
  | DirectorAITrait
  | VirtualProductionTrait;

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
    switch (t.trait) {
      case 'shot_list':
        lines.push(`  object "Shot_${t.shotId}" @shot_list {`);
        lines.push(`    scene: ${t.scene}`);
        lines.push(`    shotType: "${t.shotType}"`);
        lines.push(`    duration: ${t.duration}`);
        lines.push(`    lens: { focalLength: ${t.lens.focalLength} }`);
        lines.push(`    movement: "${t.movement}"`);
        lines.push('  }');
        break;
      case 'color_grade':
        lines.push(`  object "${t.gradeName ?? 'Grade'}" @color_grade {`);
        lines.push(`    temperature: ${t.temperature}`);
        lines.push(`    contrast: ${t.contrast}`);
        lines.push(`    saturation: ${t.saturation}`);
        if (t.lut) lines.push(`    lut: "${t.lut}"`);
        lines.push('  }');
        break;
      case 'dmx_lighting':
        lines.push(`  object "${t.label ?? `Fixture_U${t.universe}_CH${t.channel}`}" @dmx_lighting {`);
        lines.push(`    universe: ${t.universe}`);
        lines.push(`    channel: ${t.channel}`);
        lines.push(`    fixtureType: "${t.fixtureType}"`);
        lines.push(`    intensity: ${t.intensity}`);
        lines.push(`    color: [${t.color.join(', ')}]`);
        lines.push('  }');
        break;
      case 'director_ai':
        lines.push(`  object "Director_${t.sceneId}" @director_ai {`);
        lines.push(`    blocking: ${t.blocking.length} marks`);
        lines.push(`    coverage: ${t.coverage.length} requirements`);
        lines.push(`    beats: ${t.emotionalBeats.length}`);
        lines.push('  }');
        break;
      case 'virtual_production':
        lines.push(`  object "VP_${t.stageId}" @virtual_production {`);
        lines.push(`    walls: ${t.walls.length}`);
        lines.push(`    syncMode: "${t.syncMode}"`);
        lines.push(`    frameRate: ${t.frameRate}`);
        lines.push(`    tracking: "${t.tracking.system}"`);
        lines.push('  }');
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

  const shotTraits = traits.filter((t): t is ShotListTrait => t.trait === 'shot_list');

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
  const shotTraits = traits.filter((t): t is ShotListTrait => t.trait === 'shot_list');

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

/** All trait handlers provided by this plugin */
export const traitHandlers = [
  createShotListHandler(),
  createColorGradeHandler(),
  createDMXLightingHandler(),
  createDirectorAIHandler(),
  createVirtualProductionHandler(),
] as const;

/** Plugin metadata for PluginLifecycleManager registration */
export const pluginMeta = {
  id: 'film-vfx',
  name: 'Film/VFX',
  version: VERSION,
  description: 'Shot lists, color grading, DMX lighting, director AI, and virtual production for HoloScript',
  traits: ['shot_list', 'color_grade', 'dmx_lighting', 'director_ai', 'virtual_production'],
  compileFormats: ['holo', 'edl', 'otio', 'json'],
} as const;

// ============================================================================
// Version
// ============================================================================

export const VERSION = '1.0.0';

export default {
  VERSION,
  pluginMeta,
  traitHandlers,
  compile,
};
