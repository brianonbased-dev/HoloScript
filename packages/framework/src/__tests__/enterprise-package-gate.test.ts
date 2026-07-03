import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ENTERPRISE_PACKAGE_GATE_SCHEMA_VERSION,
  assertEnterprisePackageGateManifest,
  cloneEnterprisePackageGateManifest,
  createEnterprisePackageGateAdmission,
  validateEnterprisePackageGateManifest,
  type EnterprisePackageGateManifest,
} from '../board/enterprise-package-gate';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');
const fixtureCustomerSuccessGate = path.resolve(
  here,
  'fixtures',
  'enterprise-package-gate.customer-success.json',
);
const siblingHololandCustomerSuccessGate = path.resolve(
  repoRoot,
  '..',
  'Hololand',
  'apps',
  'holoshell',
  'enterprise-gates',
  'customer-success-room',
  'package-gate.json',
);

function customerSuccessGate(
  overrides: Partial<EnterprisePackageGateManifest> = {},
): EnterprisePackageGateManifest {
  return {
    ...readManifest(fixtureCustomerSuccessGate),
    ...overrides,
  };
}

function readManifest(filePath: string): EnterprisePackageGateManifest {
  return JSON.parse(readFileSync(filePath, 'utf8')) as EnterprisePackageGateManifest;
}

describe('enterprise package gate contract', () => {
  it('accepts the fixture customer-success enterprise gate', () => {
    const result = validateEnterprisePackageGateManifest(customerSuccessGate());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('accepts the HoloLand projection schema through the same HoloScript gate', () => {
    const result = validateEnterprisePackageGateManifest(
      customerSuccessGate({ schema: 'hololand.enterprise-package-gate.v0.1.0' }),
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects malformed manifests without throwing', () => {
    const result = validateEnterprisePackageGateManifest(null);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: 'manifest',
      message: 'Expected an enterprise package gate object.',
    });
  });

  it.skipIf(!existsSync(siblingHololandCustomerSuccessGate))(
    'accepts the real sibling HoloLand customer-success gate manifest',
    () => {
      const manifest = readManifest(siblingHololandCustomerSuccessGate);
      const admission = createEnterprisePackageGateAdmission(manifest);
      expect(admission.status).toBe('pass');
      expect(admission.gateId).toBe('customer-success-room');
      expect(admission.upstreamGaps.map((gap) => gap.primitive)).toContain(
        'enterprise_package_gate',
      );
    },
  );

  it('rejects developer-facing package surfaces for enterprise business packages', () => {
    const result = validateEnterprisePackageGateManifest(
      customerSuccessGate({ developerPackageSurface: true }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: 'developerPackageSurface',
      message: 'Enterprise business solutions are deployed room surfaces, not developer package surfaces.',
    });
  });

  it('rejects gates missing source, validation, runtime, render, or interaction receipts', () => {
    const result = validateEnterprisePackageGateManifest(
      customerSuccessGate({ requiredReceipts: ['source', 'validation'] }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        { path: 'requiredReceipts', message: 'Missing required receipt: runtime.' },
        { path: 'requiredReceipts', message: 'Missing required receipt: render.' },
        { path: 'requiredReceipts', message: 'Missing required receipt: interaction.' },
      ]),
    );
  });

  it('rejects non-HoloScript package dependencies', () => {
    const result = validateEnterprisePackageGateManifest(
      customerSuccessGate({
        holoscriptPackages: [{ name: '@hololand/local-glue', gates: ['render'] }],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: 'holoscriptPackages.0.name',
      message: 'Enterprise package gates must depend on @holoscript/* packages.',
    });
  });

  it('rejects local rewrites for HoloScript-owned upstream gaps', () => {
    const result = validateEnterprisePackageGateManifest(
      customerSuccessGate({
        upstreamGaps: [
          {
            id: 'hs-enterprise-package-gate-schema',
            owner: 'HoloScript',
            primitive: 'enterprise_package_gate',
            description: 'HoloScript owns this primitive.',
            localRewriteAllowed: true,
          },
        ],
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      path: 'upstreamGaps.0.localRewriteAllowed',
      message: 'HoloScript-owned gaps cannot be locally rewritten by a HoloLand gate.',
    });
  });

  it('warns when benchmark gates omit recommended proof obligations', () => {
    const result = validateEnterprisePackageGateManifest(
      customerSuccessGate({
        benchmarkGates: [
          {
            id: 'thin_gate',
            description: 'A gate with only source proof.',
            mustProve: ['source_drives_manifest'],
          },
        ],
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        {
          path: 'benchmarkGates.0.mustProve',
          message: 'Recommended proof obligation missing: validation_blocks_promotion.',
        },
        {
          path: 'benchmarkGates.0.mustProve',
          message: 'Recommended proof obligation missing: runtime_surface_is_projection.',
        },
        {
          path: 'benchmarkGates.0.mustProve',
          message: 'Recommended proof obligation missing: interaction_receipt_is_required.',
        },
      ]),
    );
  });

  it('throws a path-rich error for invalid manifests in assertion mode', () => {
    expect(() =>
      assertEnterprisePackageGateManifest(
        customerSuccessGate({ requiredReceipts: ['source'] }),
      ),
    ).toThrow(/requiredReceipts: Missing required receipt: validation\./);
  });

  it('turns validation into a compact admission receipt', () => {
    const admission = createEnterprisePackageGateAdmission(customerSuccessGate());
    expect(admission).toMatchObject({
      schemaVersion: ENTERPRISE_PACKAGE_GATE_SCHEMA_VERSION,
      gateId: 'customer-success-room',
      vertical: 'customer_success',
      status: 'pass',
      requiredReceipts: ['source', 'validation', 'runtime', 'render', 'interaction', 'hardware_browser'],
    });
  });

  it('clones deeply so downstream gates cannot mutate source contract state', () => {
    const original = customerSuccessGate();
    const cloned = cloneEnterprisePackageGateManifest(original);
    cloned.businessWorkflow.actors.push('mutant_actor');
    cloned.holoscriptPackages[0].gates.push('mutant_gate');
    cloned.benchmarkGates[0].mustProve.push('mutant_proof');
    cloned.requiredReceipts.push('mutant_receipt');
    cloned.promotion.requires.push('mutant_requirement');
    cloned.upstreamGaps![0].localRewriteAllowed = true;

    expect(original.businessWorkflow.actors).not.toContain('mutant_actor');
    expect(original.holoscriptPackages[0].gates).not.toContain('mutant_gate');
    expect(original.benchmarkGates[0].mustProve).not.toContain('mutant_proof');
    expect(original.requiredReceipts).not.toContain('mutant_receipt');
    expect(original.promotion.requires).not.toContain('mutant_requirement');
    expect(original.upstreamGaps![0].localRewriteAllowed).toBe(false);
  });
});
