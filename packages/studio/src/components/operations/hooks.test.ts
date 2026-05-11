import { describe, expect, it } from 'vitest';
import { createMockDeploymentCommitHash } from './hooks';
import type { DeployStage } from './types';

describe('operations evidence ids', () => {
  const stages: DeployStage[] = [
    'validate',
    'bundle',
    'optimize',
    'upload',
    'provision',
    'health_check',
    'live',
  ];

  it('labels deployment hashes as deterministic mock evidence', () => {
    const first = createMockDeploymentCommitHash('deploy-demo', 'staging', stages);
    const second = createMockDeploymentCommitHash('deploy-demo', 'staging', stages);

    expect(first).toBe(second);
    expect(first).toMatch(/^mock:[a-f0-9]{8}$/);
  });

  it('changes mock deployment hashes when deployment inputs change', () => {
    const staging = createMockDeploymentCommitHash('deploy-demo', 'staging', stages);
    const production = createMockDeploymentCommitHash('deploy-demo', 'production', stages);
    const renamed = createMockDeploymentCommitHash('deploy-renamed', 'staging', stages);

    expect(staging).not.toBe(production);
    expect(staging).not.toBe(renamed);
  });
});
