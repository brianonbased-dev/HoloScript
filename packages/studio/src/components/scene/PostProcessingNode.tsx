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

interface PostProcessingNodeProps {
  node: R3FNode;
}

function EffectNode({ node }: { node: R3FNode }) {
  const p = node.props || {};

  switch (node.type) {
    case 'Bloom':
      return (
        <Bloom
          intensity={p.intensity ?? 1}
          luminanceThreshold={p.luminanceThreshold ?? 0.9}
          luminanceSmoothing={p.luminanceSmoothing ?? 0.025}
          mipmapBlur={p.mipmapBlur ?? true}
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
      return <ToneMapping />;

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

  return (
    <EffectComposer>
      {effects.map((effect: R3FNode, i: number) => (
        <EffectNode key={effect.id || `effect-${i}`} node={effect} />
      ))}
    </EffectComposer>
  );
}
