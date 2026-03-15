/**
 * DeployTrait — v5.1
 *
 * Deployment orchestration with stages (prepare → deploy → verify).
 *
 * Events:
 *  deploy:start     { version, target, params }
 *  deploy:stage     { deployId, stage, status }
 *  deploy:complete  { deployId, version, target }
 *  deploy:error     { deployId, stage, error }
 */

import type { TraitHandler } from './TraitTypes';

export interface DeployConfig {
  stages: string[];
  auto_verify: boolean;
}

export const deployHandler: TraitHandler<DeployConfig> = {
  name: 'deploy' as any,
  defaultConfig: { stages: ['prepare', 'deploy', 'verify'], auto_verify: true },

  onAttach(node: any): void {
    node.__deployState = { deployments: new Map<string, { version: string; target: string; stage: string; started: number }>() };
  },
  onDetach(node: any): void { delete node.__deployState; },
  onUpdate(): void {},

  onEvent(node: any, config: DeployConfig, context: any, event: any): void {
    const state = node.__deployState as { deployments: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'deploy:start': {
        const deployId = `deploy_${Date.now()}`;
        const firstStage = config.stages[0] ?? 'deploy';
        state.deployments.set(deployId, {
          version: event.version, target: event.target, stage: firstStage, started: Date.now(),
        });
        context.emit?.('deploy:stage', { deployId, stage: firstStage, status: 'started' });
        break;
      }
      case 'deploy:advance': {
        const dep = state.deployments.get(event.deployId as string);
        if (!dep) break;
        const idx = config.stages.indexOf(dep.stage);
        if (idx < config.stages.length - 1) {
          dep.stage = config.stages[idx + 1];
          context.emit?.('deploy:stage', { deployId: event.deployId, stage: dep.stage, status: 'started' });
        } else {
          context.emit?.('deploy:complete', { deployId: event.deployId, version: dep.version, target: dep.target });
        }
        break;
      }
    }
  },
};

export default deployHandler;
