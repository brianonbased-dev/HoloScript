import type { Vector3 } from '../types';
import type { TraitHandler } from './TraitTypes';

export interface TwinActuatorConfig {
  actuator_id: string;
  command_topic: string;
  allowed_actions: string[];
  safe_limits: Record<string, [number, number]>;
}

export const twinActuatorHandler: TraitHandler<TwinActuatorConfig> = {
  name: 'twin_actuator' as never,

  defaultConfig: {
    actuator_id: '',
    command_topic: 'commands',
    allowed_actions: ['move', 'rotate', 'stop', 'toggle'],
    safe_limits: {},
  },

  onAttach(node, config, _context) {
    if (!config.actuator_id) {
      console.warn(`[TwinActuatorTrait] Attached to ${node.id} with missing physical actuator_id`);
    }
  },

  onEvent(node, config, context, event) {
    if (event.type === 'twin_command') {
      const action = event.action as string;
      if (!config.allowed_actions.includes(action)) {
        context.emit('twin_actuator_error', { node, error: `Action ${action} not allowed.` });
        return;
      }

      // Check safe thresholds if provided
      if (config.safe_limits[action] && typeof event.value === 'number') {
        const val = event.value;
        const [min, max] = config.safe_limits[action];
        if (val < min || val > max) {
          context.emit('twin_actuator_error', {
            node,
            action,
            error: `Value ${val} out of bounds for ${action}`,
          });
          return;
        }
      }

      context.emit('on_twin_actuate', {
        node,
        actuatorId: config.actuator_id,
        topic: config.command_topic,
        action,
        payload: event.payload,
        value: event.value,
      });

      // Optionally simulate standard physical translation in VR instantly
      if (action === 'move' && event.velocity) {
        context.physics.applyVelocity(node, event.velocity as Vector3);
      }
    }
  },
};

export default twinActuatorHandler;
