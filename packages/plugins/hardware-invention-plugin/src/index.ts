export { createPCBLayoutHandler, type PCBLayoutConfig, type Pad, type Trace, type PCBLayer } from './traits/PCBLayoutTrait';
export { createComponentLibraryHandler, type ComponentLibraryConfig, type Component, type ComponentCategory } from './traits/ComponentLibraryTrait';
export { createFirmwareFlashHandler, type FirmwareFlashConfig, type FlashProtocol } from './traits/FirmwareFlashTrait';
export * from './traits/types';

import { createPCBLayoutHandler } from './traits/PCBLayoutTrait';
import { createComponentLibraryHandler } from './traits/ComponentLibraryTrait';
import { createFirmwareFlashHandler } from './traits/FirmwareFlashTrait';

export const pluginMeta = { name: '@holoscript/plugin-hardware-invention', version: '1.0.0', traits: ['pcb_layout', 'component_library', 'firmware_flash'] };
export const traitHandlers = [createPCBLayoutHandler(), createComponentLibraryHandler(), createFirmwareFlashHandler()];
