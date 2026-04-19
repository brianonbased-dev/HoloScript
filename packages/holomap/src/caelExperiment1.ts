/**
 * CAEL Experiment 1 — second axis: scene source (HoloMap vs Marble compatibility).
 * Use plain-language labels in protocols; these helpers keep analysis tables consistent.
 */

export type CaelExperiment1SceneAxis = 'holomap-native' | 'marble-compatibility';

/** Pin this in longitudinal logs when HoloMap rebuilds would otherwise invalidate comparisons. */
export const CAEL_EXP1_HOLOMAP_BUILD_PIN_ENV = 'CAEL_EXP1_HOLOMAP_BUILD_PIN';

export function sceneAxisPlainLabel(axis: CaelExperiment1SceneAxis): string {
  return axis === 'holomap-native' ? 'Native HoloMap scene' : 'Compatibility Marble scene';
}

export function resolveCaelExperiment1SceneAxis(proc: {
  env: NodeJS.ProcessEnv;
}): CaelExperiment1SceneAxis {
  const raw = proc.env.CAEL_EXP1_SCENE_AXIS?.trim().toLowerCase();
  if (!raw) {
    return 'marble-compatibility';
  }
  if (raw === 'holomap' || raw === 'holomap-native') {
    return 'holomap-native';
  }
  if (raw === 'marble' || raw === 'marble-compatibility') {
    return 'marble-compatibility';
  }
  throw new Error(
    `Invalid CAEL_EXP1_SCENE_AXIS "${proc.env.CAEL_EXP1_SCENE_AXIS}". Use holomap-native | marble-compatibility.`,
  );
}

export function formatCaelExperiment1ConditionLabel(embodimentCell: string, sceneAxis: CaelExperiment1SceneAxis): string {
  return `${embodimentCell} × ${sceneAxisPlainLabel(sceneAxis)}`;
}
