/**
 * W3C Web of Things (WoT) Integration
 *
 * Provides Thing Description generation from HoloScript objects.
 */

export {
  ThingDescriptionGenerator,
  generateThingDescription,
  generateAllThingDescriptions,
  serializeThingDescription,
  validateThingDescription,
  type ThingDescription,
  type PropertyAffordance,
  type ActionAffordance,
  type EventAffordance,
  type DataSchema,
  type Form,
  type Link,
  type SecurityScheme,
  type NoSecurityScheme,
  type BasicSecurityScheme,
  type BearerSecurityScheme,
  type OAuth2SecurityScheme,
  type APIKeySecurityScheme,
  type WoTThingConfig,
  type ThingDescriptionGeneratorOptions,
} from './ThingDescriptionGenerator';
