/**
 * i18n / Localization Traits
 *
 * Internationalization and localization primitives.
 *
 * @version 1.0.0
 */
export const I18N_LOCALIZATION_TRAITS = [
  'locale',             // Locale detection and switching
  'translation',        // Translation key lookup / ICU formatting
  'rtl',                // Right-to-left layout management
  'timezone',           // Timezone conversion and display
] as const;

export type I18NLocalizationTraitName = (typeof I18N_LOCALIZATION_TRAITS)[number];
