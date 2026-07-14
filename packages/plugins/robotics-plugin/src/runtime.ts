import { registerPluginTraits } from '@holoscript/core/runtime';
import { createROS2HardwareLoopHandler } from './traits/ROS2HardwareLoopTrait.js';

export const ROBOTICS_PLUGIN_ID = 'robotics' as const;

export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

export function registerRoboticsTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, ROBOTICS_PLUGIN_ID, [createROS2HardwareLoopHandler()]);
}
