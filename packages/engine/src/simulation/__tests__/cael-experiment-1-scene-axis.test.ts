/**
 * CAEL Experiment 1 — scene source axis wiring (HoloMap vs Marble compatibility).
 * Protocol: docs/cael/experiment-1-scene-axis.md
 */

import { describe, expect, it } from 'vitest';
import {
  formatCaelExperiment1ConditionLabel,
  resolveCaelExperiment1SceneAxis,
  sceneAxisPlainLabel,
} from '@holoscript/holomap';

describe('CAEL Experiment 1 — scene axis', () => {
  it('defaults to marble compatibility', () => {
    expect(resolveCaelExperiment1SceneAxis({ env: {} })).toBe('marble-compatibility');
  });

  it('reads holomap-native from env', () => {
    expect(
      resolveCaelExperiment1SceneAxis({ env: { CAEL_EXP1_SCENE_AXIS: 'holomap-native' } }),
    ).toBe('holomap-native');
  });

  it('formats factorial cell labels for protocols', () => {
    const axis = resolveCaelExperiment1SceneAxis({ env: { CAEL_EXP1_SCENE_AXIS: 'holomap' } });
    expect(sceneAxisPlainLabel(axis)).toBe('Native HoloMap scene');
    expect(formatCaelExperiment1ConditionLabel('Embodied', axis)).toBe(
      'Embodied × Native HoloMap scene',
    );
  });
});
