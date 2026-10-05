'use client';

import type { R3FNode } from '@holoscript/core';
import {
  EffectComposer,
  Bloom,
  SSAO,
  Vignette,
  DepthOfField,
  ChromaticAberration,
  Noise,
  ToneMapping,
} from '@react-three/postprocessing';
// postprocessing is @react-three/postprocessing's peer dependency, and where its
// docs take tone mapping modes from. Use the enum itself, never its numbers: the
// package's type declaration lists CINEON and OPTIMIZED_CINEON as two members, so
// counting them there gives ACES_FILMIC 7, while the value it ships is 6.
import { ToneMappingMode } from 'postprocessing';

interface PostProcessingNodeProps {
  node: R3FNode;
}

/**
 * The tone mapping of Studio's viewport canvas: SceneRenderer creates it with
 * `toneMapping: 4`, three's ACESFilmicToneMapping. While an EffectComposer is
 * mounted, @react-three/postprocessing switches the renderer to NoToneMapping
 * (three tone maps only what it draws to the screen, and the composer draws the
 * scene into its own buffers). So the composer applies the same operator as its
 * last effect. Without it, a scene that gains post-processing loses its tone
 * mapping everywhere, not just where it glows.
 */
const CANVAS_TONE_MAPPING = ToneMappingMode.ACES_FILMIC;

/** A written mode name, matched without case or separators. */
const modeKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The tone mapping modes postprocessing supports, by the names of its enum,
 * plus `aces`, the name scene files write.
 */
const TONE_MAPPING_MODES = new Map<string, ToneMappingMode>([
  ['aces', ToneMappingMode.ACES_FILMIC],
  ['acesfilmic', ToneMappingMode.ACES_FILMIC],
  ['agx', ToneMappingMode.AGX],
  ['neutral', ToneMappingMode.NEUTRAL],
  ['linear', ToneMappingMode.LINEAR],
  ['reinhard', ToneMappingMode.REINHARD],
  ['reinhard2', ToneMappingMode.REINHARD2],
  ['reinhard2adaptive', ToneMappingMode.REINHARD2_ADAPTIVE],
  ['uncharted2', ToneMappingMode.UNCHARTED2],
  ['cineon', ToneMappingMode.CINEON],
  ['optimizedcineon', ToneMappingMode.OPTIMIZED_CINEON],
]);

const warnedToneMappingModes = new Set<string>();

/**
 * The operator a tone mapping effect's `mode` names (or its `type`, which scene
 * files also write). Without one, the canvas's own. A name postprocessing has no
 * operator for also gets the canvas's own, with a one-line warning (once per
 * name), so the written value is never dropped silently.
 */
function toneMappingMode(props: Record<string, unknown>): ToneMappingMode {
  const written = props.mode ?? props.type;
  if (written === undefined || written === null) return CANVAS_TONE_MAPPING;
  const mode = typeof written === 'string' ? TONE_MAPPING_MODES.get(modeKey(written)) : undefined;
  if (mode !== undefined) return mode;
  const label = JSON.stringify(written);
  if (!warnedToneMappingModes.has(label)) {
    warnedToneMappingModes.add(label);
    console.warn(
      `[PostProcessingNode] tone mapping mode ${label} is not one postprocessing supports ` +
        `(aces, agx, neutral, linear, reinhard, reinhard2, reinhard2_adaptive, uncharted2, cineon); ` +
        `using ACES Filmic, the viewport's own.`
    );
  }
  return CANVAS_TONE_MAPPING;
}

function EffectNode({ node }: { node: R3FNode }) {
  const p = node.props || {};

  switch (node.type) {
    case 'Bloom':
      return (
        <Bloom
          intensity={p.intensity ?? 1}
          // Scene files write `threshold`; luminanceThreshold is the library's name.
          luminanceThreshold={p.luminanceThreshold ?? p.threshold ?? 0.9}
          luminanceSmoothing={p.luminanceSmoothing ?? 0.025}
          mipmapBlur={p.mipmapBlur ?? true}
          radius={p.radius}
        />
      );

    case 'SSAO':
      return (
        <SSAO
          radius={p.radius ?? 0.5}
          intensity={p.intensity ?? 15}
          luminanceInfluence={p.luminanceInfluence ?? 0.6}
          color={p.color}
        />
      );

    case 'Vignette':
      return <Vignette offset={p.offset ?? 0.3} darkness={p.darkness ?? 0.7} />;

    case 'DepthOfField':
      return (
        <DepthOfField
          focusDistance={p.focusDistance ?? 0.01}
          focalLength={p.focalLength ?? 0.02}
          bokehScale={p.bokehScale ?? 3}
        />
      );

    case 'ChromaticAberration':
      return (
        <ChromaticAberration
          offset={p.offset ? [p.offset[0], p.offset[1]] : [0.002, 0.002]}
          radialModulation={p.radialModulation ?? false}
          modulationOffset={p.modulationOffset ?? 0.15}
        />
      );

    case 'Noise':
      return <Noise opacity={p.opacity ?? 0.02} />;

    case 'ToneMapping':
      return <ToneMapping mode={toneMappingMode(p)} />;

    default:
      return null;
  }
}

export function PostProcessingNode({ node }: PostProcessingNodeProps) {
  const effects = node.children?.filter(
    (c: R3FNode) =>
      c.type === 'Bloom' ||
      c.type === 'SSAO' ||
      c.type === 'Vignette' ||
      c.type === 'DepthOfField' ||
      c.type === 'ChromaticAberration' ||
      c.type === 'Noise' ||
      c.type === 'ToneMapping'
  );

  if (!effects || effects.length === 0) return null;

  // SSAO reads the scene's normals from the composer's NormalPass, which
  // @react-three/postprocessing 3 builds only when asked. Without it, SSAO logs
  // "Please enable the NormalPass" and draws nothing. The pass draws the scene
  // once more, so it is asked for only when there is SSAO.
  const enableNormalPass = effects.some((c: R3FNode) => c.type === 'SSAO');
  // A tone mapping effect the scene declares sets the operator itself.
  const declaresToneMapping = effects.some((c: R3FNode) => c.type === 'ToneMapping');

  return (
    <EffectComposer enableNormalPass={enableNormalPass}>
      {effects.map((effect: R3FNode, i: number) => (
        <EffectNode key={effect.id || `effect-${i}`} node={effect} />
      ))}
      {declaresToneMapping ? null : <ToneMapping mode={CANVAS_TONE_MAPPING} />}
    </EffectComposer>
  );
}
