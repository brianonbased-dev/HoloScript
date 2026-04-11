/**
 * Domain Plugin Loader
 *
 * Loads a domain context configuration and exposes its modules
 * to the schema mapper pipeline. The loader flattens all modules'
 * keywords, thresholds, and rules into queryable collections.
 */

import type {
  DomainPluginConfig,
  _DomainModule,
  DomainKeyword,
  ThresholdPreset,
  LifecycleStage,
  ComplianceRule,
  ProductProperty,
  CompositionRule,
} from './modules/types';

/** Runtime state of a loaded domain plugin */
export interface LoadedDomainPlugin {
  config: DomainPluginConfig;
  /** All keywords across all modules — flat list for schema mapper */
  allKeywords: DomainKeyword[];
  /** All thresholds across all agriculture/manufacturing modules */
  allThresholds: ThresholdPreset[];
  /** All lifecycle stages */
  allStages: LifecycleStage[];
  /** All compliance rules */
  allRules: ComplianceRule[];
  /** All product properties */
  allProperties: ProductProperty[];
  /** All composition rules */
  allCompositionRules: CompositionRule[];
  /** Merged theme */
  theme: Record<string, string>;
  /** All recommended BT template IDs */
  recommendedBTs: string[];
}

/**
 * Load and flatten a domain plugin configuration.
 * Call this once at plugin init. The result is queryable by the schema mapper.
 */
export function loadDomainPlugin(config: DomainPluginConfig): LoadedDomainPlugin {
  const allKeywords: DomainKeyword[] = [];
  const allThresholds: ThresholdPreset[] = [];
  const allStages: LifecycleStage[] = [];
  const allRules: ComplianceRule[] = [];
  const allProperties: ProductProperty[] = [];
  const allCompositionRules: CompositionRule[] = [];
  const recommendedBTs: string[] = [];

  for (const mod of config.modules) {
    allKeywords.push(...mod.keywords);
    if (mod.stages) allStages.push(...mod.stages);
    if (mod.rules) allRules.push(...mod.rules);
    if (mod.properties) allProperties.push(...mod.properties);
    if (mod.compositionRules) allCompositionRules.push(...mod.compositionRules);
    if (mod.recommendedBehaviorTrees) recommendedBTs.push(...mod.recommendedBehaviorTrees);

    // Flatten stage thresholds
    if (mod.stages) {
      for (const stage of mod.stages) {
        allThresholds.push(...stage.thresholds);
      }
    }
  }

  // Merge theme: plugin default + per-module overrides
  const theme = { ...config.theme };
  for (const mod of config.modules) {
    if (mod.theme) Object.assign(theme, mod.theme);
  }

  return {
    config,
    allKeywords,
    allThresholds,
    allStages,
    allRules,
    allProperties,
    allCompositionRules,
    theme,
    recommendedBTs: [...new Set(recommendedBTs)],
  };
}

/**
 * Get all domain keywords as a map for the schema mapper.
 * Key = lowercase term, Value = { traits, spatialRole }
 */
export function getDomainKeywords(
  plugin: LoadedDomainPlugin
): Map<string, { traits: string[]; spatialRole?: string }> {
  const map = new Map<string, { traits: string[]; spatialRole?: string }>();
  for (const kw of plugin.allKeywords) {
    map.set(kw.term.toLowerCase(), { traits: kw.traits, spatialRole: kw.spatialRole });
  }
  return map;
}

/**
 * Get thresholds for a specific sensor type.
 */
export function getDomainThresholds(
  plugin: LoadedDomainPlugin,
  sensorType: string
): ThresholdPreset[] {
  return plugin.allThresholds.filter((t) => t.sensor === sensorType);
}
