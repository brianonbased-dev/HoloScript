import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ENTERPRISE_PACKAGE_GATE_SCHEMA_VERSION,
  cloneEnterprisePackageGateManifest,
  createEnterprisePackageGateAdmission,
  validateEnterprisePackageGateManifest,
  type EnterprisePackageGateManifest,
} from '../board/enterprise-package-gate';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');
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
    schema: ENTERPRISE_PACKAGE_GATE_SCHEMA_VERSION,
    id: 'customer-success-room',
    title: 'Customer Success Room',
    vertical: 'customer_success',
    packageClass: 'enterprise_business_solution',
    humanUserSurface: 'deployed_hololand_room',
    developerPackageSurface: false,
    sourcePath: 'apps/holoshell/source/hololand-enterprise-customer-success-room-gate.hsplus',
    businessWorkflow: {
      id: 'customer_success_onboarding',
      summary: 'A team reviews account health and captures follow-up receipts.',
      actors: [
        'customer_success_manager',
        'implementation_specialist',
        'customer_stakeholder',
        'agent_copilot',
      ],
      criticalPath: [
        'load_account_context',
        'show_health_and_risk',
        'surface_open_support_threads',
        'propose_next_actions',
        'capture_followup_receipt',
      ],
    },
    holoscriptPackages: [
      {
        name: '@holoscript/core',
        gates: ['composition', 'state', 'policy', 'action', 'emit'],
      },
      {
        name: '@holoscript/framework',
        gates: ['enterprise_gate_manifest', 'receipt_contract', 'workflow_admission'],
      },
      {
        name: '@holoscript/ui',
        gates: ['semantic_room_panel', 'agent_action_control', 'receipt_panel_projection'],
      },
      {
        name: '@holoscript/agent-protocol',
        gates: ['agent_intent', 'handoff_context', 'followup_receipt'],
      },
    ],
    benchmarkGates: [
      {
        id: 'holoscript_enterprise_customer_success_room',
        description: 'HoloScript can express a customer-success room and leave receipts.',
        mustProve: [
          'source_drives_manifest',
          'validation_blocks_promotion',
          'runtime_surface_is_projection',
          'interaction_receipt_is_required',
          'missing_reusable_primitives_go_upstream',
        ],
      },
    ],
    requiredReceipts: ['source', 'validation', 'runtime', 'render', 'interaction', 'hardware_browser'],
    promotion: {
      status: 'blocked_by_upstream_gaps',
      requires: [
        'mcp__holoscript.validate_holoscript pass',
        'direct Node gate receipt pass',
        'browser or hardware interaction receipt pass',
      ],
      blocksOn: [
        'local TypeScript rewrite of enterprise semantics',
        'missing source receipt',
        'missing validation receipt',
        'missing interaction receipt',
      ],
    },
    upstreamGaps: [
      {
        id: 'hs-enterprise-package-gate-schema',
        owner: 'HoloScript',
        primitive: 'enterprise_package_gate',
        description: 'HoloScript should own a reusable schema for enterprise package gates.',
        localRewriteAllowed: false,
      },
    ],
    ...overrides,
  };
}

function readManifest(filePath: string): EnterprisePackageGateManifest {
  return JSON.parse(readFileSync(filePath, 'utf8')) as EnterprisePackageGateManifest;
}

describe('enterprise package gate contract', () => {
  it('accepts a HoloScript-owned customer-success enterprise gate', () => {
    const result = validateEnterprisePackageGateManifest(customerSuccessGate());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
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
