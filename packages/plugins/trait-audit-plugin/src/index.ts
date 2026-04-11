export { createInteroperabilityBadgeHandler, type InteroperabilityBadgeConfig, type BadgeLevel, type AuditCheck } from './traits/InteroperabilityBadgeTrait';
export * from './traits/types';

import { createInteroperabilityBadgeHandler } from './traits/InteroperabilityBadgeTrait';

export const pluginMeta = { name: '@holoscript/plugin-trait-audit', version: '1.0.0', traits: ['interoperability_badge'] };
export const traitHandlers = [createInteroperabilityBadgeHandler()];
