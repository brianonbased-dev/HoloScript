/**
 * Domain Plugin Template
 *
 * Fork this, add your domain context, ship a vertical.
 *
 * A domain plugin is a composition of modules. Each module adds
 * domain-specific vocabulary to the schema mapper, behavior tree
 * templates, compliance rules, and lifecycle stages.
 *
 * The plugin does NOT modify HoloScript core. It provides context
 * that makes the universal pipeline smarter for a specific industry.
 *
 * Usage:
 *   1. Copy this template to a new package
 *   2. Create your domain context file (see contexts/ examples)
 *   3. Import your modules
 *   4. Register via PluginLifecycleManager or Studio PluginManager
 *
 * The schema mapper queries installed plugins for keywords before
 * mapping. Domain-specific keywords improve trait selection accuracy.
 *
 * @module @holoscript/domain-plugin-template
 */

export type {
  DomainModule,
  DomainPluginConfig,
  DomainKeyword,
  ThresholdPreset,
  LifecycleStage,
  ComplianceRule,
  ProductProperty,
  CompositionRule,
} from './modules/types';

export { loadDomainPlugin, getDomainKeywords, getDomainThresholds } from './loader';

export const VERSION = '0.1.0';
