/**
 * Security Pipeline - Unified Exports
 *
 * Central entry point for all security modules in the frontend skill.
 * Import from this file to access all security features:
 *
 *   import { SecurityPipeline, scanComponentSource, auditCSPCompliance, BaselineManager } from './security-pipeline';
 */

// Security Scanner
export {
  scanComponentSource,
  scanBatch,
  formatScanReport,
  detectFramework,
  SECURITY_RULES,
  SEVERITY_ORDER,
  type Severity,
  type Framework,
  type SecurityFinding,
  type ScanResult,
  type ScannerConfig,
} from '../security-scanner/component-security-scanner';

// CSP Enforcer
export {
  auditCSPCompliance,
  auditBatch as auditCSPBatch,
  formatCSPReport,
  serializeCSPPolicy,
  parseCSPHeader,
  generateCSPMetaTag,
  generateCSPNonce,
  STRICT_CSP_POLICY,
  CSP_RULES,
  type CSPDirective,
  type CSPSource,
  type CSPPolicy,
  type CSPViolation,
  type CSPAuditResult,
  type EnforcerConfig,
  type ViolationSeverity,
} from '../csp-enforcer/csp-enforcer';

// Immutable Baselines
export {
  BaselineManager,
  createComponentSnapshot,
  createComponentSnapshotSync,
  sha256,
  sha256Sync,
  type ComponentSnapshot,
  type PropContract,
  type PropDefinition,
  type EventSignature,
  type AccessibilityNode,
  type BaselineDiff,
  type LockedBaseline,
  type BaselineManifest,
  type SectionDiff,
} from '../test-baselines/immutable-snapshot';

// Pipeline Orchestrator
export {
  SecurityPipeline,
  type PipelineConfig,
  type PipelineReport,
  type BatchPipelineReport,
} from './pipeline';
