/**
 * AnimationTypes — type-smoke tests
 * Verifies the exported type shapes are structurally correct at runtime via JSDoc-inferred assertions.
 */
import { describe, it, expect } from 'vitest';
import type {
  AnimationWrapMode,
  AnimationBlendMode,
  AnimationClipDef,
  AnimationEventDef,
  AnimationInputBinding,
  AnimationOutputSnapshot,
  AnimationUtilizationEvidence,
  AnimationStateDef,
} from '../AnimationTypes';

describe('AnimationTypes — structural smoke', () => {
  it('AnimationClipDef accepts required fields', () => {
    const clip: AnimationClipDef = { name: 'run', duration: 1.2 };
    expect(clip.name).toBe('run');
    expect(clip.duration).toBe(1.2);
  });

  it('AnimationClipDef accepts all optional fields', () => {
    const clip: AnimationClipDef = {
      name: 'walk',
      asset: 'assets/walk.anim',
      duration: 0.8,
      wrapMode: 'loop',
      blendMode: 'additive',
      speed: 1.5,
      startTime: 0,
      endTime: 0.8,
      rootMotion: true,
      tracks: [
        {
          target: 'hips.x',
          defaultValue: 0,
          keyframes: [{ time: 0, value: 1 }],
        },
      ],
      events: [],
    };
    expect(clip.wrapMode).toBe('loop');
    expect(clip.blendMode).toBe('additive');
    expect(clip.rootMotion).toBe(true);
    expect(clip.tracks?.[0]?.target).toBe('hips.x');
  });

  it('AnimationEventDef accepts required + optional fields', () => {
    const ev: AnimationEventDef = { name: 'footstep', time: 0.4 };
    expect(ev.name).toBe('footstep');
    expect(ev.time).toBe(0.4);
    const evFull: AnimationEventDef = {
      name: 'effect',
      time: 0.2,
      data: { intensity: 1 },
      function: 'onEffect',
    };
    expect(evFull.data?.intensity).toBe(1);
  });

  it('wrapMode values are valid strings', () => {
    const modes: AnimationWrapMode[] = ['once', 'loop', 'ping-pong', 'clamp'];
    expect(modes).toHaveLength(4);
  });

  it('blendMode values are valid strings', () => {
    const modes: AnimationBlendMode[] = ['override', 'additive'];
    expect(modes).toHaveLength(2);
  });

  it('AnimationStateDef accepts clip field', () => {
    const state: AnimationStateDef = { name: 'idle', clip: 'idle_clip' };
    expect(state.name).toBe('idle');
    expect(state.clip).toBe('idle_clip');
  });

  it('AnimationOutputSnapshot carries resolved channel details', () => {
    const snapshot: AnimationOutputSnapshot = {
      time: 0,
      channels: { 'hips.x': 1 },
      details: [
        {
          target: 'hips.x',
          value: 1,
          contributions: [
            {
              layer: 0,
              state: 'idle',
              clip: 'idle_clip',
              target: 'hips.x',
              weight: 1,
              sampledValue: 1,
              baseline: 0,
              blendMode: 'override',
            },
          ],
        },
      ],
    };

    expect(snapshot.details[0].contributions[0].clip).toBe('idle_clip');
  });

  it('AnimationInputBinding accepts listener assignment and trigger shapes', () => {
    const setBinding: AnimationInputBinding = {
      event: 'agent.speed',
      parameter: 'speed',
      action: 'set',
      source: 'event.value',
    };
    const fireBinding: AnimationInputBinding = {
      event: 'control.jump',
      parameter: 'jump',
      action: 'fire',
    };

    expect(setBinding.source).toBe('event.value');
    expect(fireBinding.action).toBe('fire');
  });

  it('AnimationUtilizationEvidence distinguishes render and GPU-backed channels', () => {
    const evidence: AnimationUtilizationEvidence = {
      activeLayerCount: 1,
      transitioningLayerCount: 0,
      typedInputCount: 1,
      resolvedClipWeightCount: 1,
      resolvedOutputCount: 2,
      outputBackends: { cpu: 0, render: 1, gpu: 0, webgpu: 1, wasm: 0, unknown: 0 },
      reachedRenderChannels: true,
      reachedGpuBackedChannels: true,
      channels: [
        { target: 'root.x', backend: 'render', reached: true, contributionCount: 1 },
        { target: 'webgpu.skin.pose', backend: 'webgpu', reached: true, contributionCount: 1 },
      ],
      caveats: [],
    };

    expect(evidence.outputBackends.webgpu).toBe(1);
    expect(evidence.reachedGpuBackedChannels).toBe(true);
  });
});
