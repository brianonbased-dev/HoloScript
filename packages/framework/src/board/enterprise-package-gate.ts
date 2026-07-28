/**
 * Enterprise package gate contract.
 *
 * HoloScript owns the reusable gate shape. HoloLand can render and operate the
 * business room, but promotion evidence must still point back to source,
 * validation, runtime/render, interaction, and receipts.
 */

export const ENTERPRISE_PACKAGE_GATE_SCHEMA_VERSION =
  'holoscript.enterprise-package-gate.v1' as const;

export type EnterprisePackageGateSchemaVersion = typeof ENTERPRISE_PACKAGE_GATE_SCHEMA_VERSION;

export type EnterprisePackageClass = 'enterprise_business_solution' | (string & {});

export interface EnterprisePackageWorkflow {
  id: string;
  summary: string;
  actors: string[];
  criticalPath: string[];
}

export interface EnterprisePackageDependencyGate {
  name: string;
  gates: string[];
}

export interface EnterprisePackageBenchmarkGate {
  id: string;
  description: string;
  mustProve: string[];
}

export interface EnterprisePackagePromotionGate {
  status: string;
  requires: string[];
  blocksOn: string[];
}

export interface EnterprisePackageUpstreamGap {
  id: string;
  owner: string;
  primitive: string;
  description: string;
  localRewriteAllowed: boolean;
}

export interface EnterprisePackageGateManifest {
  schema: string;
  id: string;
  title: string;
  vertical: string;
  packageClass: EnterprisePackageClass;
  humanUserSurface: string;
  developerPackageSurface: boolean;
  sourcePath: string;
  businessWorkflow: EnterprisePackageWorkflow;
  holoscriptPackages: EnterprisePackageDependencyGate[];
  benchmarkGates: EnterprisePackageBenchmarkGate[];
  requiredReceipts: string[];
  promotion: EnterprisePackagePromotionGate;
  upstreamGaps?: EnterprisePackageUpstreamGap[];
}

export interface EnterprisePackageGateValidationIssue {
  path: string;
  message: string;
}

export interface EnterprisePackageGateValidationResult {
  valid: boolean;
  errors: EnterprisePackageGateValidationIssue[];
  warnings: EnterprisePackageGateValidationIssue[];
}

export interface EnterprisePackageGateAdmission {
  schemaVersion: EnterprisePackageGateSchemaVersion;
  gateId: string;
  vertical: string;
  status: 'pass' | 'fail';
  errors: EnterprisePackageGateValidationIssue[];
  warnings: EnterprisePackageGateValidationIssue[];
  requiredReceipts: string[];
  upstreamGaps: EnterprisePackageUpstreamGap[];
}

const ACCEPTED_MANIFEST_SCHEMAS = [
  ENTERPRISE_PACKAGE_GATE_SCHEMA_VERSION,
  'hololand.enterprise-package-gate.v0.1.0',
] as const;

const REQUIRED_RECEIPTS = ['source', 'validation', 'runtime', 'render', 'interaction'] as const;

const CORE_PROOF_OBLIGATIONS = [
  'source_drives_manifest',
  'validation_blocks_promotion',
  'runtime_surface_is_projection',
  'interaction_receipt_is_required',
] as const;

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function pushRequiredString(
  errors: EnterprisePackageGateValidationIssue[],
  path: string,
  value: unknown
): void {
  if (!hasText(value)) errors.push({ path, message: 'Expected a non-empty string.' });
}

function pushRequiredArray(
  errors: EnterprisePackageGateValidationIssue[],
  path: string,
  value: unknown
): void {
  if (!nonEmptyArray(value)) errors.push({ path, message: 'Expected a non-empty array.' });
}

function includesAll(values: readonly string[], required: readonly string[]): string[] {
  return required.filter((item) => !values.includes(item));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => hasText(item)) : [];
}

function manifestRecord(
  value: unknown
): (Partial<EnterprisePackageGateManifest> & Record<string, unknown>) | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<EnterprisePackageGateManifest> & Record<string, unknown>)
    : null;
}

function validateWorkflow(
  errors: EnterprisePackageGateValidationIssue[],
  workflow: EnterprisePackageWorkflow | undefined
): void {
  if (!workflow || typeof workflow !== 'object') {
    errors.push({ path: 'businessWorkflow', message: 'Expected a workflow object.' });
    return;
  }
  pushRequiredString(errors, 'businessWorkflow.id', workflow.id);
  pushRequiredString(errors, 'businessWorkflow.summary', workflow.summary);
  pushRequiredArray(errors, 'businessWorkflow.actors', workflow.actors);
  pushRequiredArray(errors, 'businessWorkflow.criticalPath', workflow.criticalPath);
}

function validatePackages(
  errors: EnterprisePackageGateValidationIssue[],
  packages: EnterprisePackageDependencyGate[] | undefined
): void {
  if (!nonEmptyArray(packages)) {
    errors.push({
      path: 'holoscriptPackages',
      message: 'Expected at least one HoloScript package.',
    });
    return;
  }
  for (const [index, pkg] of packages.entries()) {
    pushRequiredString(errors, `holoscriptPackages.${index}.name`, pkg?.name);
    if (hasText(pkg?.name) && !pkg.name.startsWith('@holoscript/')) {
      errors.push({
        path: `holoscriptPackages.${index}.name`,
        message: 'Enterprise package gates must depend on @holoscript/* packages.',
      });
    }
    pushRequiredArray(errors, `holoscriptPackages.${index}.gates`, pkg?.gates);
  }
}

function validateBenchmarkGates(
  errors: EnterprisePackageGateValidationIssue[],
  warnings: EnterprisePackageGateValidationIssue[],
  gates: EnterprisePackageBenchmarkGate[] | undefined
): void {
  if (!nonEmptyArray(gates)) {
    errors.push({ path: 'benchmarkGates', message: 'Expected at least one benchmark gate.' });
    return;
  }
  for (const [index, gate] of gates.entries()) {
    pushRequiredString(errors, `benchmarkGates.${index}.id`, gate?.id);
    pushRequiredString(errors, `benchmarkGates.${index}.description`, gate?.description);
    pushRequiredArray(errors, `benchmarkGates.${index}.mustProve`, gate?.mustProve);

    const missing = includesAll(stringArray(gate?.mustProve), CORE_PROOF_OBLIGATIONS);
    for (const proof of missing) {
      warnings.push({
        path: `benchmarkGates.${index}.mustProve`,
        message: `Recommended proof obligation missing: ${proof}.`,
      });
    }
  }
}

function validatePromotion(
  errors: EnterprisePackageGateValidationIssue[],
  promotion: EnterprisePackagePromotionGate | undefined
): void {
  if (!promotion || typeof promotion !== 'object') {
    errors.push({ path: 'promotion', message: 'Expected a promotion gate object.' });
    return;
  }
  pushRequiredString(errors, 'promotion.status', promotion.status);
  pushRequiredArray(errors, 'promotion.requires', promotion.requires);
  pushRequiredArray(errors, 'promotion.blocksOn', promotion.blocksOn);
}

function validateUpstreamGaps(
  errors: EnterprisePackageGateValidationIssue[],
  gaps: EnterprisePackageUpstreamGap[] | undefined
): void {
  for (const [index, gap] of (gaps ?? []).entries()) {
    pushRequiredString(errors, `upstreamGaps.${index}.id`, gap?.id);
    pushRequiredString(errors, `upstreamGaps.${index}.owner`, gap?.owner);
    pushRequiredString(errors, `upstreamGaps.${index}.primitive`, gap?.primitive);
    pushRequiredString(errors, `upstreamGaps.${index}.description`, gap?.description);
    if (gap?.owner === 'HoloScript' && gap.localRewriteAllowed !== false) {
      errors.push({
        path: `upstreamGaps.${index}.localRewriteAllowed`,
        message: 'HoloScript-owned gaps cannot be locally rewritten by a HoloLand gate.',
      });
    }
  }
}

export function validateEnterprisePackageGateManifest(
  manifest: unknown
): EnterprisePackageGateValidationResult {
  const errors: EnterprisePackageGateValidationIssue[] = [];
  const warnings: EnterprisePackageGateValidationIssue[] = [];
  const candidate = manifestRecord(manifest);

  if (!candidate) {
    return {
      valid: false,
      errors: [{ path: 'manifest', message: 'Expected an enterprise package gate object.' }],
      warnings,
    };
  }

  if (!(ACCEPTED_MANIFEST_SCHEMAS as readonly string[]).includes(String(candidate.schema))) {
    errors.push({
      path: 'schema',
      message: `Expected ${ENTERPRISE_PACKAGE_GATE_SCHEMA_VERSION} or a HoloLand enterprise-package gate projection schema.`,
    });
  }

  pushRequiredString(errors, 'id', candidate.id);
  pushRequiredString(errors, 'title', candidate.title);
  pushRequiredString(errors, 'vertical', candidate.vertical);
  pushRequiredString(errors, 'packageClass', candidate.packageClass);
  pushRequiredString(errors, 'humanUserSurface', candidate.humanUserSurface);
  pushRequiredString(errors, 'sourcePath', candidate.sourcePath);

  if (
    candidate.packageClass === 'enterprise_business_solution' &&
    candidate.developerPackageSurface !== false
  ) {
    errors.push({
      path: 'developerPackageSurface',
      message:
        'Enterprise business solutions are deployed room surfaces, not developer package surfaces.',
    });
  }

  validateWorkflow(errors, candidate.businessWorkflow);
  validatePackages(errors, candidate.holoscriptPackages);
  validateBenchmarkGates(errors, warnings, candidate.benchmarkGates);

  const missingReceipts = includesAll(stringArray(candidate.requiredReceipts), REQUIRED_RECEIPTS);
  for (const receipt of missingReceipts) {
    errors.push({
      path: 'requiredReceipts',
      message: `Missing required receipt: ${receipt}.`,
    });
  }

  validatePromotion(errors, candidate.promotion);
  validateUpstreamGaps(errors, candidate.upstreamGaps);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function assertEnterprisePackageGateManifest(manifest: EnterprisePackageGateManifest): void {
  const result = validateEnterprisePackageGateManifest(manifest);
  if (!result.valid) {
    const detail = result.errors.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    throw new Error(`Invalid enterprise package gate manifest:\n${detail}`);
  }
}

export function createEnterprisePackageGateAdmission(
  manifest: EnterprisePackageGateManifest
): EnterprisePackageGateAdmission {
  const result = validateEnterprisePackageGateManifest(manifest);
  return {
    schemaVersion: ENTERPRISE_PACKAGE_GATE_SCHEMA_VERSION,
    gateId: manifest.id,
    vertical: manifest.vertical,
    status: result.valid ? 'pass' : 'fail',
    errors: result.errors.map((issue) => ({ ...issue })),
    warnings: result.warnings.map((issue) => ({ ...issue })),
    requiredReceipts: [...(manifest.requiredReceipts ?? [])],
    upstreamGaps: (manifest.upstreamGaps ?? []).map((gap) => ({ ...gap })),
  };
}

export function cloneEnterprisePackageGateManifest(
  manifest: EnterprisePackageGateManifest
): EnterprisePackageGateManifest {
  return {
    ...manifest,
    businessWorkflow: {
      ...manifest.businessWorkflow,
      actors: [...(manifest.businessWorkflow?.actors ?? [])],
      criticalPath: [...(manifest.businessWorkflow?.criticalPath ?? [])],
    },
    holoscriptPackages: (manifest.holoscriptPackages ?? []).map((pkg) => ({
      ...pkg,
      gates: [...(pkg.gates ?? [])],
    })),
    benchmarkGates: (manifest.benchmarkGates ?? []).map((gate) => ({
      ...gate,
      mustProve: [...(gate.mustProve ?? [])],
    })),
    requiredReceipts: [...(manifest.requiredReceipts ?? [])],
    promotion: {
      ...manifest.promotion,
      requires: [...(manifest.promotion?.requires ?? [])],
      blocksOn: [...(manifest.promotion?.blocksOn ?? [])],
    },
    upstreamGaps: (manifest.upstreamGaps ?? []).map((gap) => ({ ...gap })),
  };
}
