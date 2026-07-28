// SpatialAudioCompiler — a SOVEREIGN spatial-audio target (the audio peer of WebGPU).
//
// WHY SOVEREIGN: like the WebGPU path renders on our own WGSL/device graph with no
// third-party engine, this emits our own Web Audio graph — AudioContext + PannerNode
// (HRTF) + ConvolverNode + filters — with NO third-party audio middleware (no FMOD /
// Wwise / Resonance). HoloScript owns the graph; the browser's audio device executes it.
//
// It consumes the audio VOCABULARY the parser already captures as object traits (verified
// against examples/audio: @audio_listener / @audio_source / @reverb_zone / @audio_material
// / @audio_occlusion / @audio_portal, each with a `config`). It walks the composition
// (top-level objects, scene objects, spatial groups, children), builds a structured
// acoustic model, and emits a self-contained ES module exporting `createAudioGraph(ctx)`.
//
// Scope (v1): HRTF listener; positional sources with directivity cones + distance model;
// reverb zones (algorithmic rt60 → synthesized decaying-noise impulse; convolution →
// ir_file); per-source occlusion lowpass presets; portal sends between zones; acoustic
// surfaces collected as data (their mean absorption tunes the algorithmic reverb tail).
// Out of scope: dynamic per-frame occlusion raycasting, ambisonic B-format decode.

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloObjectTrait,
} from '../parser/HoloCompositionTypes';

type Vec3 = [number, number, number];

interface AudioListenerModel {
  name: string;
  position: Vec3;
  forward: Vec3;
  up: Vec3;
  hrtf: boolean;
  speedOfSound: number;
}
interface AudioSourceModel {
  name: string;
  position: Vec3;
  clip: string | null;
  volume: number;
  loop: boolean;
  directivity: string;
  refDistance: number;
  maxDistance: number;
  rolloffFactor: number;
  reverbSend: number;
  occluded: boolean;
}
interface ReverbZoneModel {
  name: string;
  kind: 'algorithmic' | 'convolution';
  irFile: string | null;
  rt60: number;
  roomVolume: number;
  wet: number;
}
interface AcousticSurfaceModel {
  name: string;
  absorption: [number, number, number];
  scattering: number;
  transmissionLoss: number;
}
interface OcclusionModel {
  name: string;
  cutoffHz: number;
  transmissionLoss: number;
}
interface PortalModel {
  name: string;
  sourceZone: string | null;
  targetZone: string | null;
  cutoffHz: number;
  openingFactor: number;
}

export interface AudioSceneModel {
  format: 'holoscript.audio.v1';
  source: string;
  listener: AudioListenerModel;
  sources: AudioSourceModel[];
  zones: ReverbZoneModel[];
  surfaces: AcousticSurfaceModel[];
  occlusions: OcclusionModel[];
  portals: PortalModel[];
}

// Directivity name → Web Audio cone (innerAngle, outerAngle, outerGain).
const DIRECTIVITY_CONES: Record<string, [number, number, number]> = {
  omnidirectional: [360, 360, 1],
  omni: [360, 360, 1],
  cardioid: [90, 180, 0.35],
  supercardioid: [60, 150, 0.25],
  hypercardioid: [45, 120, 0.2],
  bidirectional: [30, 90, 0.15],
  shotgun: [25, 70, 0.1],
};

export class SpatialAudioCompiler {
  compile(composition: HoloComposition): string {
    return this.emitModule(this.compileToModel(composition));
  }

  compileToModel(composition: HoloComposition): AudioSceneModel {
    const objs = this.collectObjects(composition);
    const model: AudioSceneModel = {
      format: 'holoscript.audio.v1',
      source: String(composition.name ?? 'composition'),
      listener: {
        name: 'listener',
        position: [0, 1.6, 0],
        forward: [0, 0, -1],
        up: [0, 1, 0],
        hrtf: true,
        speedOfSound: 343,
      },
      sources: [],
      zones: [],
      surfaces: [],
      occlusions: [],
      portals: [],
    };

    for (const obj of objs) {
      const pos = this.vec3(this.prop(obj, 'position'), [0, 0, 0]);
      for (const trait of obj.traits ?? []) {
        const cfg = (trait.config ?? {}) as Record<string, unknown>;
        switch (trait.name) {
          case 'audio_listener':
            model.listener = {
              name: String(obj.name ?? 'listener'),
              position: pos,
              forward: this.vec3(cfg.forward, [0, 0, -1]),
              up: this.vec3(cfg.up, [0, 1, 0]),
              hrtf: cfg.hrtf !== false,
              speedOfSound: this.num(cfg.speed_of_sound, 343),
            };
            break;
          case 'audio_source':
            model.sources.push({
              name: String(obj.name ?? `source${model.sources.length}`),
              position: pos,
              clip:
                typeof cfg.clip === 'string'
                  ? cfg.clip
                  : typeof cfg.src === 'string'
                    ? cfg.src
                    : null,
              volume: this.num(cfg.volume ?? cfg.gain, 1),
              loop: cfg.loop === true,
              directivity: String(cfg.directivity ?? cfg.source_directivity ?? 'omnidirectional'),
              refDistance: this.num(cfg.ref_distance, 1),
              maxDistance: this.num(cfg.max_distance, 100),
              rolloffFactor: this.num(cfg.rolloff, 1),
              reverbSend: this.num(cfg.reverb_send, 0.25),
              occluded: false,
            });
            break;
          case 'reverb_zone': {
            const kind =
              String(cfg.type ?? 'algorithmic') === 'convolution' ? 'convolution' : 'algorithmic';
            model.zones.push({
              name: String(obj.name ?? `zone${model.zones.length}`),
              kind,
              irFile: typeof cfg.ir_file === 'string' ? cfg.ir_file : null,
              rt60: this.num(cfg.rt60_mid ?? cfg.rt60 ?? cfg.rt60_low, 1.2),
              roomVolume: this.num(cfg.room_volume, 500),
              wet: this.num(cfg.wet, 0.5),
            });
            break;
          }
          case 'audio_material':
            model.surfaces.push({
              name: String(obj.name ?? `surface${model.surfaces.length}`),
              absorption: [
                this.num(cfg.absorption_low, 0.1),
                this.num(cfg.absorption_mid, 0.1),
                this.num(cfg.absorption_high, 0.1),
              ],
              scattering: this.num(cfg.scattering, 0.1),
              transmissionLoss: this.num(cfg.transmission_loss, 0),
            });
            break;
          case 'audio_occlusion':
            model.occlusions.push({
              name: String(obj.name ?? `occ${model.occlusions.length}`),
              cutoffHz: this.num(cfg.cutoff_hz, cfg.frequency_dependent ? 1200 : 20000),
              transmissionLoss: this.num(cfg.transmission_loss, 20),
            });
            break;
          case 'audio_portal':
            model.portals.push({
              name: String(obj.name ?? `portal${model.portals.length}`),
              sourceZone: typeof cfg.source_zone === 'string' ? cfg.source_zone : null,
              targetZone: typeof cfg.target_zone === 'string' ? cfg.target_zone : null,
              cutoffHz: this.num(cfg.cutoff_hz, 800),
              openingFactor: this.num(cfg.opening_factor, 0.5),
            });
            break;
          default:
            break;
        }
      }
    }
    return model;
  }

  // ── traversal ──────────────────────────────────────────────────────────────
  private collectObjects(composition: HoloComposition): HoloObjectDecl[] {
    const out: HoloObjectDecl[] = [];
    const push = (objs: HoloObjectDecl[] | undefined) => {
      for (const o of objs ?? []) {
        out.push(o);
        if (o.children) push(o.children);
      }
    };
    push(composition.objects);
    const scenes = (composition as unknown as { scenes?: Array<{ objects?: HoloObjectDecl[] }> })
      .scenes;
    for (const s of scenes ?? []) push(s.objects);
    const walkGroup = (g: HoloSpatialGroup) => {
      push(g.objects);
      for (const sub of g.groups ?? []) walkGroup(sub);
    };
    for (const g of composition.spatialGroups ?? []) walkGroup(g);
    return out;
  }

  private prop(obj: HoloObjectDecl, key: string): unknown {
    return obj.properties?.find((p) => p.key === key)?.value;
  }
  private num(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  }
  private vec3(v: unknown, fallback: Vec3): Vec3 {
    return Array.isArray(v) && v.length >= 3
      ? [Number(v[0]), Number(v[1]), Number(v[2])]
      : fallback;
  }

  // ── emission: self-contained Web Audio graph builder ─────────────────────────
  private emitModule(m: AudioSceneModel): string {
    const meanAbsorption =
      m.surfaces.length > 0
        ? m.surfaces.reduce(
            (s, x) => s + (x.absorption[0] + x.absorption[1] + x.absorption[2]) / 3,
            0
          ) / m.surfaces.length
        : 0.2;
    const j = (v: unknown) => JSON.stringify(v);
    const L = m.listener;
    const lines: string[] = [];
    lines.push('// @generated by HoloScript SpatialAudioCompiler — sovereign Web Audio graph.');
    lines.push(`// Source composition: ${m.source}`);
    lines.push('// Do not edit manually — regenerate from .holo source.');
    lines.push('');
    lines.push('// Synthesize a decaying-noise impulse response for an algorithmic reverb tail');
    lines.push('// (rt60 = seconds to -60 dB). Fully sovereign — no impulse asset needed.');
    lines.push('function hsBuildImpulse(ctx, rt60, absorption) {');
    lines.push('  const sr = ctx.sampleRate, len = Math.max(1, Math.floor(sr * rt60));');
    lines.push('  const buf = ctx.createBuffer(2, len, sr);');
    lines.push('  const decay = 6.907755 / rt60; // ln(1000)');
    lines.push('  for (let ch = 0; ch < 2; ch++) {');
    lines.push('    const d = buf.getChannelData(ch);');
    lines.push('    for (let i = 0; i < len; i++) {');
    lines.push('      const t = i / sr;');
    lines.push(
      '      d[i] = (Math.random() * 2 - 1) * Math.exp(-decay * t) * (1 - absorption * 0.5);'
    );
    lines.push('    }');
    lines.push('  }');
    lines.push('  return buf;');
    lines.push('}');
    lines.push('');
    lines.push('// Build the spatial-audio graph on the given AudioContext. `loadClip(name)`');
    lines.push('// (optional) should return a Promise<AudioBuffer> for a source clip; without it,');
    lines.push(
      '// sources are created lazily and can be driven by any node via handle.connectSource.'
    );
    lines.push('export function createAudioGraph(ctx, opts = {}) {');
    lines.push(
      '  const master = ctx.createGain(); master.gain.value = opts.masterGain ?? 1; master.connect(ctx.destination);'
    );
    lines.push(`  const meanAbsorption = ${meanAbsorption.toFixed(4)};`);
    lines.push('');
    lines.push('  // Listener (HRTF binaural). Position + orientation drive the panner math.');
    lines.push('  const listener = ctx.listener;');
    lines.push(`  const lp = ${j(L.position)}, lf = ${j(L.forward)}, lu = ${j(L.up)};`);
    lines.push(
      '  if (listener.positionX) { listener.positionX.value = lp[0]; listener.positionY.value = lp[1]; listener.positionZ.value = lp[2];'
    );
    lines.push(
      '    listener.forwardX.value = lf[0]; listener.forwardY.value = lf[1]; listener.forwardZ.value = lf[2];'
    );
    lines.push(
      '    listener.upX.value = lu[0]; listener.upY.value = lu[1]; listener.upZ.value = lu[2]; }'
    );
    lines.push(
      '  else if (listener.setPosition) { listener.setPosition(lp[0], lp[1], lp[2]); listener.setOrientation(lf[0], lf[1], lf[2], lu[0], lu[1], lu[2]); }'
    );
    lines.push('');
    lines.push('  // Reverb zones — ConvolverNodes on a shared send bus.');
    lines.push('  const zones = {};');
    for (const z of m.zones) {
      lines.push(
        `  { const conv = ctx.createConvolver(); const wet = ctx.createGain(); wet.gain.value = ${z.wet};`
      );
      if (z.kind === 'convolution' && z.irFile) {
        lines.push(
          `    conv._irFile = ${j(z.irFile)}; // convolution reverb: host loads this IR into conv.buffer`
        );
        lines.push(
          `    conv.buffer = hsBuildImpulse(ctx, ${z.rt60}, meanAbsorption); // placeholder tail until IR loads`
        );
      } else {
        lines.push(
          `    conv.buffer = hsBuildImpulse(ctx, ${z.rt60}, meanAbsorption); // algorithmic rt60 tail`
        );
      }
      lines.push('    conv.connect(wet); wet.connect(master);');
      lines.push(
        `    zones[${j(z.name)}] = { convolver: conv, wet, send: ctx.createGain() }; zones[${j(z.name)}].send.connect(conv); }`
      );
    }
    lines.push('  const defaultZone = zones[Object.keys(zones)[0] || ""];');
    lines.push('');
    lines.push('  // Sources — PannerNode (HRTF) + directivity cone + distance model + gain.');
    lines.push('  const sources = {};');
    for (const s of m.sources) {
      const cone =
        DIRECTIVITY_CONES[s.directivity.toLowerCase()] ?? DIRECTIVITY_CONES.omnidirectional;
      lines.push(
        `  { const p = ctx.createPanner(); p.panningModel = ${j(L.hrtf ? 'HRTF' : 'equalpower')}; p.distanceModel = "inverse";`
      );
      lines.push(
        `    p.refDistance = ${s.refDistance}; p.maxDistance = ${s.maxDistance}; p.rolloffFactor = ${s.rolloffFactor};`
      );
      lines.push(
        `    p.coneInnerAngle = ${cone[0]}; p.coneOuterAngle = ${cone[1]}; p.coneOuterGain = ${cone[2]};`
      );
      lines.push(
        `    const sp = ${j(s.position)}; if (p.positionX) { p.positionX.value = sp[0]; p.positionY.value = sp[1]; p.positionZ.value = sp[2]; } else if (p.setPosition) { p.setPosition(sp[0], sp[1], sp[2]); }`
      );
      lines.push(
        `    const g = ctx.createGain(); g.gain.value = ${s.volume}; p.connect(g); g.connect(master);`
      );
      lines.push(
        `    if (defaultZone) { const rs = ctx.createGain(); rs.gain.value = ${s.reverbSend}; g.connect(rs); rs.connect(defaultZone.send); }`
      );
      lines.push(
        `    sources[${j(s.name)}] = { panner: p, gain: g, clip: ${j(s.clip)}, loop: ${j(s.loop)},`
      );
      lines.push('      connectSource(node) { node.connect(p); return node; } };');
      lines.push('  }');
    }
    lines.push('');
    lines.push(
      '  // Occlusion presets — a lowpass + attenuation the host inserts on a blocked path.'
    );
    lines.push('  const occlusions = {};');
    for (const o of m.occlusions) {
      lines.push(
        `  occlusions[${j(o.name)}] = { cutoffHz: ${o.cutoffHz}, gain: ${Math.pow(10, -o.transmissionLoss / 20).toFixed(4)},`
      );
      lines.push(
        '    makeFilter() { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = this.cutoffHz; const a = ctx.createGain(); a.gain.value = this.gain; f.connect(a); return { input: f, output: a }; } };'
      );
    }
    lines.push('');
    lines.push('  // Portals — a filtered send from one zone into another (open door bleed).');
    lines.push('  const portals = [];');
    for (const p of m.portals) {
      lines.push(
        `  if (zones[${j(p.sourceZone)}] && zones[${j(p.targetZone)}]) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = ${p.cutoffHz}; const g = ctx.createGain(); g.gain.value = ${p.openingFactor};`
      );
      lines.push(
        `    zones[${j(p.sourceZone)}].wet.connect(f); f.connect(g); g.connect(zones[${j(p.targetZone)}].send); portals.push({ name: ${j(p.name)}, filter: f, gain: g }); }`
      );
    }
    lines.push('');
    lines.push('  return { context: ctx, master, listener, zones, sources, occlusions, portals,');
    lines.push(`    surfaces: ${j(m.surfaces)}, meanAbsorption, format: ${j(m.format)} };`);
    lines.push('}');
    lines.push('');
    return lines.join('\n');
  }
}

// Re-export the trait config shape for consumers that want to introspect audio traits.
export type AudioTraitConfig = HoloObjectTrait['config'];
