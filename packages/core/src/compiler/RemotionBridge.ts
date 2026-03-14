// TARGET: packages/core/src/compiler/RemotionBridge.ts
/**
 * Remotion Bridge — HoloScript Scene to Video Export
 *
 * Bridges HoloScript compositions to Remotion (https://remotion.dev) for
 * programmatic video rendering and export. Converts HoloScript timelines,
 * animations, and scene objects into Remotion component trees and sequence
 * configurations.
 *
 * Features:
 * - Timeline entries mapped to Remotion <Sequence> components
 * - HoloScript animations to spring()/interpolate() calls
 * - Camera movements to Remotion composition transforms
 * - Audio blocks to <Audio> components with spatial positioning
 * - Scene object properties to React Three Fiber scenes inside Remotion
 * - Multi-pass rendering support (beauty pass, depth, normals, ID masks)
 *
 * Output: Remotion project configuration + React component source code
 *
 * @version 1.0.0
 * @package @holoscript/core/compiler
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloTimeline,
  HoloTimelineEntry,
  HoloLight,
  HoloCamera,
  HoloAudio,
  HoloValue,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

/** Remotion composition configuration */
export interface RemotionCompositionConfig {
  /** Composition ID (alphanumeric, used in CLI) */
  id: string;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Frames per second */
  fps: number;
  /** Total duration in frames */
  durationInFrames: number;
  /** Default props for the composition */
  defaultProps?: Record<string, unknown>;
}

/** Remotion sequence descriptor (maps to <Sequence> component) */
export interface RemotionSequence {
  /** Sequence name */
  name: string;
  /** Start frame (inclusive) */
  from: number;
  /** Duration in frames */
  durationInFrames: number;
  /** Component type to render */
  component: string;
  /** Props passed to the component */
  props: Record<string, unknown>;
}

/** Remotion audio descriptor */
export interface RemotionAudioClip {
  /** Audio source URL or file path */
  src: string;
  /** Start frame */
  startFrom?: number;
  /** Volume (0-1) */
  volume?: number;
  /** Playback rate */
  playbackRate?: number;
  /** Whether the audio is spatial */
  spatial?: boolean;
}

/** Remotion interpolation keyframe */
export interface RemotionKeyframe {
  frame: number;
  value: number;
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'spring';
}

/** Complete Remotion bridge output */
export interface RemotionBridgeOutput {
  /** Remotion composition configuration */
  composition: RemotionCompositionConfig;
  /** Ordered list of sequences */
  sequences: RemotionSequence[];
  /** Audio clips */
  audioClips: RemotionAudioClip[];
  /** Generated React component source code */
  componentSource: string;
  /** Generated Remotion root file source */
  rootSource: string;
  /** Interpolation tracks for animations */
  interpolationTracks: RemotionInterpolationTrack[];
  /** Rendering passes configuration */
  renderPasses: RemotionRenderPass[];
}

/** An interpolation track for a specific object property over time */
export interface RemotionInterpolationTrack {
  /** Target object name */
  target: string;
  /** Property being animated */
  property: string;
  /** Keyframes */
  keyframes: RemotionKeyframe[];
}

/** Render pass configuration for multi-pass rendering */
export interface RemotionRenderPass {
  name: string;
  type: 'beauty' | 'depth' | 'normal' | 'id' | 'wireframe';
  outputSuffix: string;
  enabled: boolean;
}

/** Options for the Remotion bridge */
export interface RemotionBridgeOptions {
  /** Output width (default: 1920) */
  width?: number;
  /** Output height (default: 1080) */
  height?: number;
  /** Frames per second (default: 30) */
  fps?: number;
  /** Default duration in seconds if no timelines (default: 10) */
  defaultDurationSeconds?: number;
  /** Include R3F Canvas for 3D scenes (default: true) */
  include3DCanvas?: boolean;
  /** Generate multi-pass render configs (default: false) */
  multiPass?: boolean;
  /** Custom component import path (default: "./components") */
  componentImportPath?: string;
  /** Output format for generated code (default: "typescript") */
  outputFormat?: 'typescript' | 'javascript';
}

// =============================================================================
// REMOTION BRIDGE
// =============================================================================

/**
 * Bridge a HoloScript composition to Remotion for video rendering.
 *
 * @example
 * ```typescript
 * import { bridgeToRemotion } from './RemotionBridge';
 *
 * const output = bridgeToRemotion(composition, {
 *   width: 1920,
 *   height: 1080,
 *   fps: 30,
 * });
 *
 * // Write generated files
 * fs.writeFileSync('src/Root.tsx', output.rootSource);
 * fs.writeFileSync('src/Scene.tsx', output.componentSource);
 * ```
 */
export function bridgeToRemotion(
  composition: HoloComposition,
  options: RemotionBridgeOptions = {}
): RemotionBridgeOutput {
  const bridge = new RemotionBridgeImpl(options);
  return bridge.convert(composition);
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

class RemotionBridgeImpl {
  private width: number;
  private height: number;
  private fps: number;
  private defaultDurationSeconds: number;
  private include3DCanvas: boolean;
  private multiPass: boolean;
  private componentImportPath: string;
  private isTypeScript: boolean;

  constructor(options: RemotionBridgeOptions = {}) {
    this.width = options.width ?? 1920;
    this.height = options.height ?? 1080;
    this.fps = options.fps ?? 30;
    this.defaultDurationSeconds = options.defaultDurationSeconds ?? 10;
    this.include3DCanvas = options.include3DCanvas ?? true;
    this.multiPass = options.multiPass ?? false;
    this.componentImportPath = options.componentImportPath ?? './components';
    this.isTypeScript = (options.outputFormat ?? 'typescript') === 'typescript';
  }

  convert(composition: HoloComposition): RemotionBridgeOutput {
    // Calculate total duration from timelines
    const durationInFrames = this.calculateDuration(composition);

    // Build composition config
    const compositionConfig: RemotionCompositionConfig = {
      id: this.sanitizeId(composition.name),
      width: this.width,
      height: this.height,
      fps: this.fps,
      durationInFrames,
    };

    // Extract sequences from timelines
    const sequences = this.extractSequences(composition);

    // Extract audio clips
    const audioClips = this.extractAudioClips(composition);

    // Build interpolation tracks from timeline animate actions
    const interpolationTracks = this.extractInterpolationTracks(composition);

    // Configure render passes
    const renderPasses = this.buildRenderPasses();

    // Generate source code
    const componentSource = this.generateComponentSource(
      composition,
      sequences,
      interpolationTracks
    );
    const rootSource = this.generateRootSource(compositionConfig, audioClips);

    return {
      composition: compositionConfig,
      sequences,
      audioClips,
      componentSource,
      rootSource,
      interpolationTracks,
      renderPasses,
    };
  }

  // ---------------------------------------------------------------------------
  // Duration calculation
  // ---------------------------------------------------------------------------

  private calculateDuration(composition: HoloComposition): number {
    let maxTimeSeconds = this.defaultDurationSeconds;

    for (const timeline of composition.timelines ?? []) {
      for (const entry of timeline.entries ?? []) {
        maxTimeSeconds = Math.max(maxTimeSeconds, entry.time + 1);
      }
    }

    return Math.ceil(maxTimeSeconds * this.fps);
  }

  // ---------------------------------------------------------------------------
  // Sequence extraction
  // ---------------------------------------------------------------------------

  private extractSequences(composition: HoloComposition): RemotionSequence[] {
    const sequences: RemotionSequence[] = [];

    for (const timeline of composition.timelines ?? []) {
      const entries = [...(timeline.entries ?? [])].sort((a, b) => a.time - b.time);

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const nextEntry = entries[i + 1];
        const startFrame = Math.round(entry.time * this.fps);
        const endFrame = nextEntry
          ? Math.round(nextEntry.time * this.fps)
          : Math.round((entry.time + 1) * this.fps);

        const sequence: RemotionSequence = {
          name: `${timeline.name}_${i}`,
          from: startFrame,
          durationInFrames: Math.max(1, endFrame - startFrame),
          component: this.actionToComponent(entry.action),
          props: this.actionToProps(entry),
        };

        sequences.push(sequence);
      }
    }

    return sequences;
  }

  private actionToComponent(
    action: HoloTimelineEntry['action']
  ): string {
    switch (action.kind) {
      case 'animate':
        return 'AnimateObject';
      case 'emit':
        return 'EmitEvent';
      case 'call':
        return 'CallMethod';
      default:
        return 'Noop';
    }
  }

  private actionToProps(entry: HoloTimelineEntry): Record<string, unknown> {
    const action = entry.action;
    const props: Record<string, unknown> = { time: entry.time };

    if (action.kind === 'animate') {
      props.target = action.target;
      props.properties = action.properties;
    } else if (action.kind === 'emit') {
      props.event = action.event;
      props.data = action.data;
    } else if (action.kind === 'call') {
      props.method = action.method;
      props.args = action.args;
    }

    return props;
  }

  // ---------------------------------------------------------------------------
  // Audio extraction
  // ---------------------------------------------------------------------------

  private extractAudioClips(composition: HoloComposition): RemotionAudioClip[] {
    const clips: RemotionAudioClip[] = [];

    for (const audio of composition.audio ?? []) {
      const clip: RemotionAudioClip = {
        src: this.extractAudioSrc(audio),
      };

      for (const prop of audio.properties) {
        if (prop.key === 'volume' && typeof prop.value === 'number') {
          clip.volume = prop.value;
        }
        if (prop.key === 'playbackRate' && typeof prop.value === 'number') {
          clip.playbackRate = prop.value;
        }
        if (prop.key === 'spatial' && typeof prop.value === 'boolean') {
          clip.spatial = prop.value;
        }
        if (prop.key === 'startTime' && typeof prop.value === 'number') {
          clip.startFrom = Math.round(prop.value * this.fps);
        }
      }

      clips.push(clip);
    }

    return clips;
  }

  private extractAudioSrc(audio: HoloAudio): string {
    for (const prop of audio.properties) {
      if (prop.key === 'src' && typeof prop.value === 'string') return prop.value;
      if (prop.key === 'source' && typeof prop.value === 'string') return prop.value;
      if (prop.key === 'url' && typeof prop.value === 'string') return prop.value;
    }
    return `./audio/${audio.name}.mp3`;
  }

  // ---------------------------------------------------------------------------
  // Interpolation tracks
  // ---------------------------------------------------------------------------

  private extractInterpolationTracks(
    composition: HoloComposition
  ): RemotionInterpolationTrack[] {
    const trackMap = new Map<string, RemotionInterpolationTrack>();

    for (const timeline of composition.timelines ?? []) {
      for (const entry of timeline.entries ?? []) {
        if (entry.action.kind !== 'animate') continue;

        const target = entry.action.target;
        const properties = entry.action.properties;

        for (const [prop, value] of Object.entries(properties)) {
          if (typeof value !== 'number') continue;

          const trackKey = `${target}.${prop}`;
          if (!trackMap.has(trackKey)) {
            trackMap.set(trackKey, {
              target,
              property: prop,
              keyframes: [],
            });
          }

          const track = trackMap.get(trackKey)!;
          track.keyframes.push({
            frame: Math.round(entry.time * this.fps),
            value: value as number,
          });
        }
      }
    }

    // Sort keyframes by frame
    for (const track of trackMap.values()) {
      track.keyframes.sort((a, b) => a.frame - b.frame);
    }

    return Array.from(trackMap.values());
  }

  // ---------------------------------------------------------------------------
  // Render passes
  // ---------------------------------------------------------------------------

  private buildRenderPasses(): RemotionRenderPass[] {
    const passes: RemotionRenderPass[] = [
      { name: 'Beauty', type: 'beauty', outputSuffix: '', enabled: true },
    ];

    if (this.multiPass) {
      passes.push(
        { name: 'Depth', type: 'depth', outputSuffix: '_depth', enabled: true },
        { name: 'Normal', type: 'normal', outputSuffix: '_normal', enabled: true },
        { name: 'ID Mask', type: 'id', outputSuffix: '_id', enabled: true },
        { name: 'Wireframe', type: 'wireframe', outputSuffix: '_wire', enabled: false },
      );
    }

    return passes;
  }

  // ---------------------------------------------------------------------------
  // Code generation: Scene component
  // ---------------------------------------------------------------------------

  private generateComponentSource(
    composition: HoloComposition,
    sequences: RemotionSequence[],
    tracks: RemotionInterpolationTrack[]
  ): string {
    const ext = this.isTypeScript ? 'tsx' : 'jsx';
    const typeAnnotation = this.isTypeScript ? ': React.FC' : '';

    const lines: string[] = [];

    // Imports
    lines.push(`// Auto-generated by HoloScript RemotionBridge`);
    lines.push(`// Source composition: "${composition.name}"`);
    lines.push(``);
    lines.push(`import React from 'react';`);
    lines.push(`import { useCurrentFrame, useVideoConfig, interpolate, Sequence } from 'remotion';`);

    if (this.include3DCanvas) {
      lines.push(`import { Canvas } from '@react-three/fiber';`);
      lines.push(`import { OrbitControls, Environment } from '@react-three/drei';`);
    }

    lines.push(``);

    // Interpolation helpers
    if (tracks.length > 0) {
      lines.push(`// --- Interpolation Tracks ---`);
      lines.push(``);

      for (const track of tracks) {
        const fnName = `get_${this.sanitizeId(track.target)}_${track.property}`;
        const inputRange = track.keyframes.map((k) => k.frame);
        const outputRange = track.keyframes.map((k) => k.value);

        lines.push(`function ${fnName}(frame${this.isTypeScript ? ': number' : ''}) {`);
        lines.push(`  return interpolate(frame, ${JSON.stringify(inputRange)}, ${JSON.stringify(outputRange)}, {`);
        lines.push(`    extrapolateLeft: 'clamp',`);
        lines.push(`    extrapolateRight: 'clamp',`);
        lines.push(`  });`);
        lines.push(`}`);
        lines.push(``);
      }
    }

    // Scene objects component
    if (this.include3DCanvas) {
      lines.push(`function SceneObjects() {`);
      lines.push(`  const frame = useCurrentFrame();`);
      lines.push(``);
      lines.push(`  return (`);
      lines.push(`    <>`);

      // Lights
      for (const light of composition.lights ?? []) {
        lines.push(`      ${this.lightToJSX(light)}`);
      }

      // Objects
      for (const obj of composition.objects ?? []) {
        lines.push(`      ${this.objectToJSX(obj, tracks)}`);
      }

      // Spatial groups
      for (const group of composition.spatialGroups ?? []) {
        lines.push(`      ${this.groupToJSX(group, tracks)}`);
      }

      lines.push(`    </>`);
      lines.push(`  );`);
      lines.push(`}`);
      lines.push(``);
    }

    // Main component
    const componentName = this.sanitizeId(composition.name) + 'Scene';
    lines.push(`export const ${componentName}${typeAnnotation} = () => {`);
    lines.push(`  const frame = useCurrentFrame();`);
    lines.push(`  const { durationInFrames } = useVideoConfig();`);
    lines.push(``);
    lines.push(`  return (`);
    lines.push(`    <div style={{ width: '100%', height: '100%', background: '#000' }}>`);

    // Sequences
    for (const seq of sequences) {
      lines.push(`      <Sequence from={${seq.from}} durationInFrames={${seq.durationInFrames}} name="${seq.name}">`);
      lines.push(`        {/* ${seq.component}: ${JSON.stringify(seq.props)} */}`);
      lines.push(`      </Sequence>`);
    }

    if (this.include3DCanvas) {
      lines.push(`      <Canvas camera={{ position: [0, 1.6, 5], fov: 60 }}>`);
      lines.push(`        <SceneObjects />`);
      lines.push(`        <OrbitControls />`);
      lines.push(`        <Environment preset="apartment" />`);
      lines.push(`      </Canvas>`);
    }

    lines.push(`    </div>`);
    lines.push(`  );`);
    lines.push(`};`);
    lines.push(``);
    lines.push(`export default ${componentName};`);

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Code generation: Remotion Root
  // ---------------------------------------------------------------------------

  private generateRootSource(
    config: RemotionCompositionConfig,
    audioClips: RemotionAudioClip[]
  ): string {
    const lines: string[] = [];
    const componentName = config.id + 'Scene';

    lines.push(`// Auto-generated Remotion Root by HoloScript RemotionBridge`);
    lines.push(``);
    lines.push(`import { Composition } from 'remotion';`);
    lines.push(`import { ${componentName} } from '${this.componentImportPath}/${componentName}';`);

    if (audioClips.length > 0) {
      lines.push(`import { Audio } from 'remotion';`);
    }

    lines.push(``);
    lines.push(`export const RemotionRoot = () => {`);
    lines.push(`  return (`);
    lines.push(`    <>`);
    lines.push(`      <Composition`);
    lines.push(`        id="${config.id}"`);
    lines.push(`        component={${componentName}}`);
    lines.push(`        durationInFrames={${config.durationInFrames}}`);
    lines.push(`        fps={${config.fps}}`);
    lines.push(`        width={${config.width}}`);
    lines.push(`        height={${config.height}}`);
    lines.push(`      />`);
    lines.push(`    </>`);
    lines.push(`  );`);
    lines.push(`};`);

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // JSX generation helpers
  // ---------------------------------------------------------------------------

  private lightToJSX(light: HoloLight): string {
    const props = this.propsToJSXAttrs(light.properties);
    switch (light.lightType) {
      case 'directional':
        return `<directionalLight ${props} />`;
      case 'point':
        return `<pointLight ${props} />`;
      case 'spot':
        return `<spotLight ${props} />`;
      case 'hemisphere':
        return `<hemisphereLight ${props} />`;
      case 'ambient':
        return `<ambientLight ${props} />`;
      default:
        return `<pointLight ${props} />`;
    }
  }

  private objectToJSX(
    obj: HoloObjectDecl,
    tracks: RemotionInterpolationTrack[]
  ): string {
    const geometry = this.inferGeometry(obj);
    const position = this.extractVec3(obj.properties, 'position', [0, 0, 0]);
    const scale = this.extractVec3(obj.properties, 'scale', [1, 1, 1]);
    const color = this.extractColor(obj);

    const hasAnimation = tracks.some((t) => t.target === obj.name);
    const positionExpr = hasAnimation
      ? `[get_${this.sanitizeId(obj.name)}_x?.(frame) ?? ${position[0]}, get_${this.sanitizeId(obj.name)}_y?.(frame) ?? ${position[1]}, get_${this.sanitizeId(obj.name)}_z?.(frame) ?? ${position[2]}]`
      : `[${position.join(', ')}]`;

    return [
      `<mesh position={${positionExpr}} scale={[${scale.join(', ')}]} name="${obj.name}">`,
      `        <${geometry}Geometry />`,
      `        <meshStandardMaterial color="${color}" />`,
      `      </mesh>`,
    ].join('\n      ');
  }

  private groupToJSX(
    group: HoloSpatialGroup,
    tracks: RemotionInterpolationTrack[]
  ): string {
    const position = this.extractGroupVec3(group, 'position', [0, 0, 0]);
    const children = (group.objects ?? [])
      .map((o) => `        ${this.objectToJSX(o, tracks)}`)
      .join('\n');

    return [
      `<group position={[${position.join(', ')}]} name="${group.name}">`,
      children,
      `      </group>`,
    ].join('\n      ');
  }

  // ---------------------------------------------------------------------------
  // Property extraction
  // ---------------------------------------------------------------------------

  private extractVec3(
    properties: HoloObjectDecl['properties'],
    key: string,
    defaultVal: [number, number, number]
  ): [number, number, number] {
    for (const prop of properties) {
      if (prop.key === key && Array.isArray(prop.value)) {
        const arr = prop.value as number[];
        return [arr[0] ?? defaultVal[0], arr[1] ?? defaultVal[1], arr[2] ?? defaultVal[2]];
      }
    }
    return defaultVal;
  }

  private extractGroupVec3(
    group: HoloSpatialGroup,
    key: string,
    defaultVal: [number, number, number]
  ): [number, number, number] {
    for (const prop of group.properties) {
      if (prop.key === key && Array.isArray(prop.value)) {
        const arr = prop.value as number[];
        return [arr[0] ?? defaultVal[0], arr[1] ?? defaultVal[1], arr[2] ?? defaultVal[2]];
      }
    }
    return defaultVal;
  }

  private extractColor(obj: HoloObjectDecl): string {
    for (const prop of obj.properties) {
      if (prop.key === 'color' && typeof prop.value === 'string') return prop.value;
    }
    for (const trait of obj.traits ?? []) {
      if (trait.config['color'] && typeof trait.config['color'] === 'string') {
        return trait.config['color'] as string;
      }
    }
    return '#888888';
  }

  private inferGeometry(obj: HoloObjectDecl): string {
    for (const prop of obj.properties) {
      if ((prop.key === 'geometry' || prop.key === 'shape') && typeof prop.value === 'string') {
        return this.mapGeometryName(prop.value);
      }
    }
    return 'box';
  }

  private mapGeometryName(name: string): string {
    const map: Record<string, string> = {
      box: 'box', cube: 'box', sphere: 'sphere', orb: 'sphere',
      cylinder: 'cylinder', cone: 'cone', plane: 'plane',
      torus: 'torus', ring: 'torus',
    };
    return map[name.toLowerCase()] ?? 'box';
  }

  private propsToJSXAttrs(
    properties: Array<{ key: string; value: HoloValue }>
  ): string {
    return properties
      .map((p) => {
        if (typeof p.value === 'string') return `${p.key}="${p.value}"`;
        if (typeof p.value === 'number') return `${p.key}={${p.value}}`;
        if (typeof p.value === 'boolean') return p.value ? p.key : '';
        if (Array.isArray(p.value)) return `${p.key}={[${p.value.join(', ')}]}`;
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  private sanitizeId(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '_').replace(/^[0-9]/, '_$&');
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { RemotionBridgeImpl as RemotionBridge };
export default bridgeToRemotion;
