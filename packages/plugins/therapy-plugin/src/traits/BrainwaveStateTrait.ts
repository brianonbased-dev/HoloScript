import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './types';

export interface BrainwaveStateConfig {
  alpha: number;
  beta: number;
  theta: number;
  stressIndex: number;
}

const handler: TraitHandler<BrainwaveStateConfig> = {
  name: 'brainwave_state',
  defaultConfig: {
    alpha: 0,
    beta: 0,
    theta: 0,
    stressIndex: 0,
  },
  onEvent(_node: HSPlusNode, config: BrainwaveStateConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'brainwave_state:update') {
      const payload = event.payload as Partial<BrainwaveStateConfig>;
      if (payload.alpha !== undefined) config.alpha = payload.alpha;
      if (payload.beta !== undefined) config.beta = payload.beta;
      if (payload.theta !== undefined) config.theta = payload.theta;
      if (payload.stressIndex !== undefined) config.stressIndex = payload.stressIndex;
      ctx.emit?.('brainwave_updated', {
        alpha: config.alpha,
        beta: config.beta,
        theta: config.theta,
        stressIndex: config.stressIndex,
      });
    } else if (event.type === 'brainwave_state:reset') {
      config.alpha = 0;
      config.beta = 0;
      config.theta = 0;
      config.stressIndex = 0;
      ctx.emit?.('brainwave_reset', {});
    }
  },
};

export const BrainwaveStateTrait = handler;
