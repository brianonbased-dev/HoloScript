/**
 * W3C Web of Things public compatibility surface.
 *
 * The implementation lives in @holoscript/platform because WoT is an
 * interoperability concern. Core keeps this subpath so older CLI and user code
 * can continue importing @holoscript/core/wot without knowing that boundary.
 */

export {
  ThingDescriptionGenerator,
  generateThingDescription,
  generateAllThingDescriptions,
  serializeThingDescription,
  validateThingDescription,
  type ThingDescription,
  type ThingDescriptionGeneratorOptions,
  type WoTThingConfig,
} from '@holoscript/platform';
