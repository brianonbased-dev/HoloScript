export { createPCBLayoutHandler } from './traits/PCBLayoutTrait';
export { createComponentLibraryHandler } from './traits/ComponentLibraryTrait';
export { createFirmwareFlashHandler } from './traits/FirmwareFlashTrait';
export type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './traits/types';

import type { TraitHandler } from './traits/types';
import { createPCBLayoutHandler } from './traits/PCBLayoutTrait';
import { createComponentLibraryHandler } from './traits/ComponentLibraryTrait';
import { createFirmwareFlashHandler } from './traits/FirmwareFlashTrait';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PLUGIN_TRAITS: TraitHandler<any>[] = [
  createPCBLayoutHandler(),
  createComponentLibraryHandler(),
  createFirmwareFlashHandler(),
];

export function registerHardwareInventionPlugin(runtime: {
  registerTrait: (handler: TraitHandler<unknown>) => void;
}): void {
  for (const trait of PLUGIN_TRAITS) {
    runtime.registerTrait(trait);
  }
}

export const TRAIT_KEYWORDS: Record<string, string> = {
  pcb_layout: 'PCB design and layout with DRC validation and trace/pad management',
  component_library: 'Electronic component database with BOM costing and supplier tracking',
  firmware_flash: 'Firmware programming with multi-protocol support and OTA updates',
};

export const VERSION = '1.0.0';
export { createPCBLayoutHandler, type PCBLayoutConfig, type Pad, type Trace, type PCBLayer } from './traits/PCBLayoutTrait';
export { createComponentLibraryHandler, type ComponentLibraryConfig, type Component, type ComponentCategory } from './traits/ComponentLibraryTrait';
export { createFirmwareFlashHandler, type FirmwareFlashConfig, type FlashProtocol } from './traits/FirmwareFlashTrait';
export * from './traits/types';

import { createPCBLayoutHandler } from './traits/PCBLayoutTrait';
import { createComponentLibraryHandler } from './traits/ComponentLibraryTrait';
import { createFirmwareFlashHandler } from './traits/FirmwareFlashTrait';

export const pluginMeta = { name: '@holoscript/plugin-hardware-invention', version: '1.0.0', traits: ['pcb_layout', 'component_library', 'firmware_flash'] };
export const traitHandlers = [createPCBLayoutHandler(), createComponentLibraryHandler(), createFirmwareFlashHandler()];
