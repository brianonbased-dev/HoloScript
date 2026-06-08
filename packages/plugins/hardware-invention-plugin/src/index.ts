export * from './hardwaresolver';
export { createPCBLayoutHandler } from './traits/PCBLayoutTrait';
export { createComponentLibraryHandler } from './traits/ComponentLibraryTrait';
export { createFirmwareFlashHandler } from './traits/FirmwareFlashTrait';
export type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './traits/types';
export type { PCBLayoutConfig, Pad, Trace, PCBLayer } from './traits/PCBLayoutTrait';
export type { ComponentLibraryConfig, Component, ComponentCategory } from './traits/ComponentLibraryTrait';
export type { FirmwareFlashConfig, FlashProtocol } from './traits/FirmwareFlashTrait';

import { registerPluginTraits } from '@holoscript/core/runtime';
import type { TraitRegistrarTarget } from '@holoscript/core/runtime';
import type { TraitHandler } from './traits/types';
import { createPCBLayoutHandler } from './traits/PCBLayoutTrait';
import { createComponentLibraryHandler } from './traits/ComponentLibraryTrait';
import { createFirmwareFlashHandler } from './traits/FirmwareFlashTrait';

export const PLUGIN_TRAITS: TraitHandler<unknown>[] = [
  createPCBLayoutHandler(),
  createComponentLibraryHandler(),
  createFirmwareFlashHandler(),
];

export function registerHardwareInventionPlugin(runtime: TraitRegistrarTarget): void {
  registerPluginTraits(runtime, 'hardware-invention', PLUGIN_TRAITS);
}

export const TRAIT_KEYWORDS: Record<string, string> = {
  pcb_layout: 'PCB design and layout with DRC validation and trace/pad management',
  component_library: 'Electronic component database with BOM costing and supplier tracking',
  firmware_flash: 'Firmware programming with multi-protocol support and OTA updates',
};

export const VERSION = '1.0.0';

export const pluginMeta = {
  name: '@holoscript/plugin-hardware-invention',
  version: VERSION,
  traits: ['pcb_layout', 'component_library', 'firmware_flash'],
};

export const traitHandlers = PLUGIN_TRAITS;
