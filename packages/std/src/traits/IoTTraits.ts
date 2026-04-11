/**
 * @fileoverview IoT Traits (Internet of Things & Healthcare)
 * @module @holoscript/std/traits
 *
 * Defines the AST traits required for real-world physical sensor mapping
 * and hardware actuator integration inside the HoloScript engine.
 */

import type { TraitDefinition } from '../types.js';

/**
 * Standard IoT and Hardware traits included in HoloScript's base functionality
 */
export const IoTTraits: TraitDefinition[] = [
  {
    name: '@sensor_stream',
    type: 'data_binding',
    description:
      'Binds a virtual digital twin property directly to a real-world IoT sensor telemetry stream.',
    parameters: [
      {
        name: 'sensor_id',
        type: 'string',
        required: true,
        description: 'The unique hardware identifier (MAC address, IP, or cloud UUID).',
      },
      {
        name: 'telemetry_type',
        type: 'string',
        required: true,
        validation: (val: any) =>
          ['temperature', 'pressure', 'heart_rate', 'spo2', 'motion', 'custom'].includes(val),
        description: 'The standard type of data the sensor provides.',
      },
      {
        name: 'update_hz',
        type: 'number',
        required: false,
        defaultValue: 10,
        description: 'The target refresh rate in Hertz.',
      },
    ],
    validation: (_node: any) => {
      return { valid: true };
    },
  },
  {
    name: '@actuator',
    type: 'behavior',
    description:
      'Defines this HoloScript node as a control schema that can send physical actions back to real-world mechanisms.',
    parameters: [
      {
        name: 'device_id',
        type: 'string',
        required: true,
        description: 'The identifier of the physical actuator.',
      },
      {
        name: 'action_range',
        type: 'array',
        required: false,
        description:
          'An array characterizing min/max values or discrete states to prevent hardware damage.',
      },
    ],
    validation: (node: any) => {
      // Must be bound to objects or scripts that can trigger state
      if (node.type !== 'Object' && node.type !== 'Script') {
        return { valid: false, message: '@actuator must be attached to an Object or Script node.' };
      }
      return { valid: true };
    },
  },
  {
    name: '@hardware_fault',
    type: 'event_hook',
    description:
      'Registers an alert topology for when a linked physical sensor goes offline or returns anomalous readings.',
    parameters: [
      {
        name: 'anomaly_threshold',
        type: 'number',
        required: false,
        description: 'The variance (e.g. standard deviations) that triggers a fault state.',
      },
      {
        name: 'fallback_behavior',
        type: 'string',
        required: false,
        defaultValue: 'freeze',
        validation: (val: any) => ['freeze', 'interpolate', 'disconnect', 'alert'].includes(val),
        description: 'What the digital twin should do when physical telemetry fails.',
      },
    ],
    validation: (_node: any) => {
      return { valid: true };
    },
  },
];

export default IoTTraits;
