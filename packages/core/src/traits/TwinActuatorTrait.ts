import type { Vector3 } from '../types';
import type { TraitHandler } from './TraitTypes';

export interface SafetyEnvelope {
  id: string;
  agent_id: string;
  allowed_actions: string[];
  blocked_actions: string[];
  substrate_enforced: boolean;
}

export interface TwinActuatorConfig {
  actuator_id: string;
  command_topic: string;
  allowed_actions: string[];
  safe_limits: Record<string, [number, number]>;
  safety_envelope?: SafetyEnvelope;
}

function validateSafetyEnvelope(
  envelope: SafetyEnvelope | undefined,
  action: string,
  nodeId: string
): { ok: boolean; reason?: string; blockingRule?: string } {
  if (!envelope) {
    return {
      ok: false,
      reason: `Action ${action} on ${nodeId} rejected: no safety envelope configured. Illegal state — unvalidated actions cannot reach actuation.`,
      blockingRule: 'missing_envelope',
    };
  }

  if (!envelope.substrate_enforced) {
    return {
      ok: false,
      reason: `Action ${action} on ${nodeId} rejected: safety envelope ${envelope.id} is not substrate-enforced.`,
      blockingRule: 'not_substrate_enforced',
    };
  }

  if (envelope.allowed_actions.length > 0 && !envelope.allowed_actions.includes(action)) {
    return {
      ok: false,
      reason: `Action ${action} on ${nodeId} rejected: not in safety envelope ${envelope.id} allowed_actions whitelist.`,
      blockingRule: 'not_allowed',
    };
  }

  if (envelope.blocked_actions.includes(action)) {
    return {
      ok: false,
      reason: `Action ${action} on ${nodeId} rejected: explicitly blocked by safety envelope ${envelope.id}.`,
      blockingRule: 'blocked_actions',
    };
  }

  return { ok: true };
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

      // Structural civilian-harm impossibility check (D.044):
      // every actuation must pass a validated safety envelope before reaching
      // the actuation path. Missing envelope = illegal state = blocked.
      const envelopeCheck = validateSafetyEnvelope(
        config.safety_envelope,
        action,
        node.id ?? '<unknown>'
      );
      if (!envelopeCheck.ok) {
        context.emit('twin_actuator_error', {
          node,
          action,
          error: envelopeCheck.reason,
          blockingRule: envelopeCheck.blockingRule,
        });
        return;
      }

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
        envelopeId: config.safety_envelope!.id,
      });

      // Optionally simulate standard physical translation in VR instantly
      if (action === 'move' && event.velocity) {
        context.physics.applyVelocity(node, event.velocity as Vector3);
      }
    }
  },
};

export default twinActuatorHandler;
