/**
 * @holoscript/studio-plugin-sdk
 *
 * Official SDK for creating HoloScript Studio plugins
 *
 * ## Trusted Plugins (main thread, first-party)
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
 *
 * ## Sandboxed Plugins (iframe isolation, third-party)
 *
 * @example
 * ```typescript
 * import { HoloScriptPlugin } from '@holoscript/studio-plugin-sdk';
 *
 * export const myPlugin: HoloScriptPlugin = {
 *   metadata: {
 *     id: 'my-sandboxed-plugin',
 *     name: 'My Sandboxed Plugin',
 *     version: '1.0.0',
 *     description: 'Runs safely in a sandbox',
 *     author: { name: 'Third Party Dev' },
 *   },
 *   sandbox: {
 *     permissions: ['scene:read', 'ui:panel', 'storage:local'],
 *     trustLevel: 'sandboxed',
 *   },
 * };
 * ```
 *
 * @see {@link sandbox} for the full sandboxing API
 */

// Re-export all plugin types
export * from './types.js';

// Export templates
export * from './templates/index.js';

// Export helpers
export * from './helpers.js';

// Export sandbox system
export * from './sandbox/index.js';

// Export responsive layout & touch gesture system
export * from './responsive/index.js';
