/**
 * @holoscript/studio-plugin-sdk
 *
 * Official SDK for creating HoloScript Studio plugins
 *
 * @example
 * ```typescript
 * import { HoloScriptPlugin } from '@holoscript/studio-plugin-sdk';
 *
 * export const myPlugin: HoloScriptPlugin = {
 *   metadata: {
 *     id: 'my-awesome-plugin',
 *     name: 'My Awesome Plugin',
 *     version: '1.0.0',
 *     description: 'Does awesome things',
 *     author: { name: 'Your Name' },
 *   },
 *   onLoad: () => {
 *     console.log('Plugin loaded!');
 *   },
 * };
 * ```
 */

// Re-export all plugin types
export * from './types.js';

// Export templates
export * from './templates/index.js';

// Export helpers
export * from './helpers.js';
