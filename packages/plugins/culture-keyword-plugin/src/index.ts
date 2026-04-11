export { createCultureHandler, type CultureConfig, type TextDirection, type CalendarSystem, type MeasurementSystem } from './traits/CultureTrait';
export * from './traits/types';

import { createCultureHandler } from './traits/CultureTrait';

export const pluginMeta = { name: '@holoscript/plugin-culture-keyword', version: '1.0.0', traits: ['culture'] };
export const traitHandlers = [createCultureHandler()];
