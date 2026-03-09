/**
 * @fileoverview AR Traits (Augmented Reality)
 * @module @holoscript/std/traits
 *
 * Defines the AST traits required for augmented reality overlays
 * and real-world physical anchoring.
 */

import type { TraitDefinition } from '../types.js';

/**
 * Standard AR traits included in HoloScript's base functionality
 */
export const ARTraits: TraitDefinition[] = [
  {
    name: '@ar_beacon',
    type: 'marker',
    description:
      'Binds a UI or 3D overlay to a physical reality marker (QR code, NFC, BLE beacon, or visual image).',
    parameters: [
      {
        name: 'type',
        type: 'string',
        required: true,
        validation: (val: any) => ['qr', 'image', 'nfc', 'ble', 'gps'].includes(val),
        description: 'The type of physical beacon (qr, image, nfc, ble, gps)',
      },
      {
        name: 'id',
        type: 'string',
        required: true,
        description: 'The unique identifier data the beacon broadcasts or visually represents',
      },
      {
        name: 'physical_size',
        type: 'number',
        required: false,
        description:
          'The expected physical size of the image/marker in meters (for image/qr types)',
      },
    ],
    validation: (node: any) => {
      return { valid: true }; // Allowed on any Node (Zones, Objects, UI)
    },
  },
  {
    name: '@overlay',
    type: 'behavior',
    description:
      'Marks a HoloUI panel or 3D object to act as a pass-through overlay locked to the viewport or surface.',
    parameters: [
      {
        name: 'anchor',
        type: 'string',
        required: false,
        defaultValue: 'viewport',
        validation: (val: any) => ['viewport', 'surface', 'plane', 'face', 'hand'].includes(val),
        description: 'How the overlay anchors to the AR pass-through feed.',
      },
      {
        name: 'occlusion',
        type: 'boolean',
        required: false,
        defaultValue: true,
        description: 'Whether physical real-world objects occlude this virtual overlay.',
      },
    ],
    validation: (node: any) => {
      // Typically used on UI or SpatialGroups
      if (node.type !== 'HoloUI' && node.type !== 'SpatialGroup') {
        return { valid: false, message: '@overlay must be attached to HoloUI or SpatialGroup.' };
      }
      return { valid: true };
    },
  },
  {
    name: '@layer_shift',
    type: 'behavior',
    description:
      'Controls the automatic transition between physical reality (AR) and digital twin reality (VR/VRR) boundaries.',
    parameters: [
      {
        name: 'trigger',
        type: 'string',
        required: true,
        validation: (val: any) => ['proximity', 'scan', 'payment', 'quest_step'].includes(val),
        description: 'What triggers the reality shift.',
      },
      {
        name: 'to_layer',
        type: 'string',
        required: true,
        validation: (val: any) => ['vr', 'vrr', 'ar'].includes(val),
        description: 'Which layer the user shifts into.',
      },
    ],
    validation: (node: any) => {
      return { valid: true };
    },
  },
];

export default ARTraits;
