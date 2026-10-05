/**
 * PostProcessingNode draws a scene's EffectComposer node (what SceneIRCompiler
 * builds from a post_processing, post_fx or effects block) with
 * @react-three/postprocessing. The library's real composer needs a WebGL
 * renderer, so its components are replaced by recorders here, and these tests
 * pin what PostProcessingNode hands the library. The library behaviour they
 * rest on was read in the installed @react-three/postprocessing 3.1.1 source:
 * - src/EffectComposer.tsx: while mounted, the composer sets the renderer's
 *   toneMapping to NoToneMapping, and it builds a NormalPass only when
 *   `enableNormalPass` is set;
 * - src/effects/SSAO.tsx: without a NormalPass, SSAO logs "Please enable the
 *   NormalPass in the EffectComposer in order to use SSAO." and renders an empty
 *   object instead of an effect.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToneMappingMode } from 'postprocessing';
import type { R3FNode } from '@holoscript/core';

type Drawn = { effect: string; props: Record<string, unknown> };

const drawn = vi.hoisted(() => [] as Drawn[]);

vi.mock('@react-three/postprocessing', () => {
  const recorder = (effect: string) =>
    function Recorded({
      children,
      ...props
    }: { children?: React.ReactNode } & Record<string, unknown>) {
      drawn.push({ effect, props });
      return React.createElement('div', { 'data-effect': effect }, children);
    };
  return {
    EffectComposer: recorder('EffectComposer'),
    Bloom: recorder('Bloom'),
    SSAO: recorder('SSAO'),
    Vignette: recorder('Vignette'),
    DepthOfField: recorder('DepthOfField'),
    ChromaticAberration: recorder('ChromaticAberration'),
    Noise: recorder('Noise'),
    ToneMapping: recorder('ToneMapping'),
  };
});

import { PostProcessingNode } from '../PostProcessingNode';

/** An EffectComposer node holding these effects, as the compiler builds it. */
function composer(...effects: Array<[string, Record<string, unknown>]>): R3FNode {
  return {
    type: 'EffectComposer',
    id: 'composer',
    props: {},
    children: effects.map(([type, props], i) => ({ type, id: `effect-${i}`, props })),
  };
}

/** Renders the node; returns the composer's props and its effects, in order. */
function draw(node: R3FNode) {
  drawn.length = 0;
  const html = renderToStaticMarkup(<PostProcessingNode node={node} />);
  const composers = drawn.filter((d) => d.effect === 'EffectComposer');
  const effects = drawn.filter((d) => d.effect !== 'EffectComposer');
  return { html, composers, effects };
}

describe('PostProcessingNode', () => {
  it('keeps the canvas tone mapping (ACES Filmic) while its composer is mounted', () => {
    const { composers, effects } = draw(composer(['Bloom', { intensity: 0.6, threshold: 0.8 }]));
    expect(composers).toHaveLength(1);
    // The composer switches the renderer's ACES off, so it applies ACES itself, last.
    expect(effects.map((e) => e.effect)).toEqual(['Bloom', 'ToneMapping']);
    expect(effects[1].props.mode).toBe(ToneMappingMode.ACES_FILMIC);
  });

  it("passes a written tone mapping mode (or type) through, as the scene's only tone mapping", () => {
    const cases: Array<[Record<string, unknown>, ToneMappingMode]> = [
      [{ mode: 'aces', exposure: 1 }, ToneMappingMode.ACES_FILMIC],
      [{ mode: 'ACES' }, ToneMappingMode.ACES_FILMIC],
      [{ type: 'aces' }, ToneMappingMode.ACES_FILMIC],
      [{ mode: 'Neutral' }, ToneMappingMode.NEUTRAL],
      [{ type: 'linear' }, ToneMappingMode.LINEAR],
      [{ mode: 'AgX' }, ToneMappingMode.AGX],
      [{ mode: 'aces_filmic' }, ToneMappingMode.ACES_FILMIC],
      // No mode: the canvas's own, not the library's default (AgX).
      [{}, ToneMappingMode.ACES_FILMIC],
    ];
    for (const [props, mode] of cases) {
      const { effects } = draw(composer(['Bloom', {}], ['ToneMapping', props]));
      expect(effects.map((e) => e.effect)).toEqual(['Bloom', 'ToneMapping']);
      expect(effects[1].props.mode).toBe(mode);
    }
  });

  it('uses ACES Filmic for a mode postprocessing has no operator for, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const node = composer(['ToneMapping', { mode: 'hable' }]);
    const first = draw(node);
    draw(node);
    expect(first.effects.map((e) => [e.effect, e.props.mode])).toEqual([
      ['ToneMapping', ToneMappingMode.ACES_FILMIC],
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('tone mapping mode "hable"');
  });

  it('hands bloom its written threshold and radius', () => {
    const written = draw(composer(['Bloom', { intensity: 0.3, threshold: 0.6, radius: 0.4 }]));
    expect(written.effects[0].props).toMatchObject({
      intensity: 0.3,
      luminanceThreshold: 0.6,
      radius: 0.4,
    });
    // The library's own name still works and comes first; with neither, the old default.
    const both = draw(composer(['Bloom', { luminanceThreshold: 0.2, threshold: 0.7 }]));
    expect(both.effects[0].props.luminanceThreshold).toBe(0.2);
    const neither = draw(composer(['Bloom', {}]));
    expect(neither.effects[0].props.luminanceThreshold).toBe(0.9);
    expect(neither.effects[0].props.radius).toBeUndefined();
  });

  it('builds the normal pass SSAO needs, and only when there is SSAO', () => {
    const withSsao = draw(composer(['Bloom', {}], ['SSAO', { intensity: 0.6, radius: 0.4 }]));
    expect(withSsao.composers[0].props.enableNormalPass).toBe(true);
    expect(withSsao.effects.map((e) => e.effect)).toEqual(['Bloom', 'SSAO', 'ToneMapping']);
    expect(withSsao.effects[1].props).toMatchObject({ intensity: 0.6, radius: 0.4 });

    const withoutSsao = draw(composer(['Bloom', {}], ['Vignette', {}]));
    expect(withoutSsao.composers[0].props.enableNormalPass).toBeFalsy();
  });

  it('mounts no composer for a node without an effect it draws, so the canvas is untouched', () => {
    expect(draw({ type: 'EffectComposer', props: {} }).html).toBe('');
    expect(draw(composer()).html).toBe('');
    expect(draw(composer(['GodRays', { intensity: 1 }])).html).toBe('');
    expect(drawn).toEqual([]);
  });
});
