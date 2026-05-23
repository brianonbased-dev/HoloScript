/**
 * @fileoverview Platform Compiler Plugins barrel export
 * @module @holoscript/core/compiler/platform/plugins
 *
 * Auto-registers all lazy platform plugins with the
 * PlatformPluginRegistry on import.
 *
 * Import this module to activate the plugin registry:
 *   import '@holoscript/core/compiler/platform/plugins';
 *
 * Or import individual plugins:
 *   import { WebGPUWGSLPlugin } from '@holoscript/core/compiler/platform/plugins/WebGPUWGSLPlugin';
 *
 * @version 1.0.0 — APL-WIT-2
 */

export { WebGPUWGSLPlugin } from './WebGPUWGSLPlugin';
export { AndroidARCorePlugin } from './AndroidARCorePlugin';