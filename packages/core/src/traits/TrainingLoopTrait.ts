/**
 * TrainingLoopTrait — v5.1
 * On-device training loop.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface TrainingLoopConfig { max_epochs: number; learning_rate: number; }
export const trainingLoopHandler: TraitHandler<TrainingLoopConfig> = {
  name: 'training_loop', defaultConfig: { max_epochs: 100, learning_rate: 0.001 },
  onAttach(node: HSPlusNode): void { node.__trainState = { epoch: 0, loss: Infinity, running: false }; },
  onDetach(node: HSPlusNode): void { delete node.__trainState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: TrainingLoopConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__trainState as { epoch: number; loss: number; running: boolean } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'train:start': state.running = true; state.epoch = 0; context.emit?.('train:started', { maxEpochs: config.max_epochs, lr: config.learning_rate }); break;
      case 'train:step': state.epoch++; state.loss = (event.loss as number) ?? state.loss; context.emit?.('train:progress', { epoch: state.epoch, loss: state.loss }); break;
      case 'train:stop': state.running = false; context.emit?.('train:stopped', { epoch: state.epoch, finalLoss: state.loss }); break;
    }
  },
};
export default trainingLoopHandler;
