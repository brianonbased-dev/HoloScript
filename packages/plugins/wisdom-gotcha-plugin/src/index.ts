export { createWisdomHandler, type WisdomConfig, type WisdomSeverity, type WisdomDomain } from './traits/WisdomTrait';
export { createGotchaHandler, type GotchaConfig, type GotchaSeverity, type GuardAction } from './traits/GotchaTrait';
export * from './traits/types';

import { createWisdomHandler } from './traits/WisdomTrait';
import { createGotchaHandler } from './traits/GotchaTrait';

export const pluginMeta = { name: '@holoscript/plugin-wisdom-gotcha', version: '1.0.0', traits: ['wisdom', 'gotcha'] };
export const traitHandlers = [createWisdomHandler(), createGotchaHandler()];
