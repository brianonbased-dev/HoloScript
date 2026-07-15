import { describe, expect, it } from 'vitest';
import {
  AGENTCORE_ADAPTER_CONTRACT_SCHEMA_VERSION,
  AGENTCORE_PRIMITIVE_MAPPINGS,
  buildAgentCoreAdapterDryRun,
  validateAgentCoreAdapterReceipt,
} from '../agentcore-adapter-contract';

const FIXTURE_AGENT = {
  fixtureAgentId: 'agent_fixture_0001',
  fixtureAgentName: 'fixture-agent',
  capabilityTags: ['ecosystem', 'agentcore', 'fixture'],
  exposedToolNames: ['holo_query_codebase', 'holomesh_board_list'],
};

describe('AgentCore adapter contract (CG-025)', () => {
  it('builds a no-secret dry-run receipt for a fixture agent', () => {
    const receipt = buildAgentCoreAdapterDryRun(FIXTURE_AGENT);

    expect(receipt.schemaVersion).toBe(AGENTCORE_ADAPTER_CONTRACT_SCHEMA_VERSION);
    expect(receipt.type).toBe('AgentCoreAdapterDryRunReceipt');
    expect(receipt.noSecretDryRun).toBe(true);
    expect(receipt.identity.secretsIncluded).toBe(false);
    expect(receipt.memory.redacted).toBe(true);
    expect(receipt.manifest.agentId).toBe(FIXTURE_AGENT.fixtureAgentId);
    expect(receipt.gateway.exposedToolCount).toBe(FIXTURE_AGENT.exposedToolNames.length);
  });

  it('names every required manifest/gateway/memory/policy/registry/eval field', () => {
    const receipt = buildAgentCoreAdapterDryRun(FIXTURE_AGENT);

    expect(Object.keys(receipt.manifest).sort()).toEqual(
      ['agentId', 'agentName', 'capabilityTags', 'manifestVersion', 'runtimeSurface'].sort()
    );
    expect(Object.keys(receipt.gateway).sort()).toEqual(
      ['exposedToolCount', 'exposedToolNames', 'gatewayEndpoint', 'transport'].sort()
    );
    expect(Object.keys(receipt.memory).sort()).toEqual(
      ['provenanceScheme', 'redacted', 'tiers'].sort()
    );
    expect(Object.keys(receipt.identity).sort()).toEqual(
      ['awsIamBridged', 'custodyNode', 'identityScheme', 'secretsIncluded'].sort()
    );
    expect(Object.keys(receipt.policy).sort()).toEqual(
      ['cedarEquivalent', 'decisionPoints', 'policyPackVersion'].sort()
    );
    expect(Object.keys(receipt.registry).sort()).toEqual(
      ['registeredName', 'registeredVersion', 'registrySource', 'status'].sort()
    );
    expect(Object.keys(receipt.evaluation).sort()).toEqual(
      ['hashAlgorithm', 'receiptSchema', 'verifyUrlPattern'].sort()
    );
  });

  it('classifies every AgentCore primitive as sovereign or bridge-only', () => {
    expect(AGENTCORE_PRIMITIVE_MAPPINGS.length).toBeGreaterThan(0);
    for (const mapping of AGENTCORE_PRIMITIVE_MAPPINGS) {
      expect(['sovereign', 'bridge-only']).toContain(mapping.ownership);
      expect(mapping.holoscriptEquivalent.length).toBeGreaterThan(0);
    }
    const ownerships = new Set(AGENTCORE_PRIMITIVE_MAPPINGS.map((m) => m.ownership));
    expect(ownerships.has('sovereign')).toBe(true);
    expect(ownerships.has('bridge-only')).toBe(true);
  });

  it('projects active-rail and exact-four routing without a broad founder gate', () => {
    const receipt = buildAgentCoreAdapterDryRun(FIXTURE_AGENT);

    expect(receipt.policy.decisionPoints).toEqual(
      expect.arrayContaining([
        'active-rail-cap-admission',
        'joseph-exact-four-boundary',
        'specialist-review-route',
        'platform-control-route',
        'prohibited-operation-replan',
      ])
    );
    expect(receipt.policy.decisionPoints).not.toContain('founder-gate-3-condition');
    expect(receipt.policy.decisionPoints).not.toContain('gpu-fleet-spend-cap');
    expect(receipt.policy.decisionPoints).not.toContain('wallet-onchain-spend-cap');
  });

  it('validates a well-formed receipt as valid', () => {
    const receipt = buildAgentCoreAdapterDryRun(FIXTURE_AGENT);
    expect(validateAgentCoreAdapterReceipt(receipt)).toEqual({ valid: true, errors: [] });
  });

  it('rejects a receipt missing required keys', () => {
    const result = validateAgentCoreAdapterReceipt({
      schemaVersion: AGENTCORE_ADAPTER_CONTRACT_SCHEMA_VERSION,
      type: 'AgentCoreAdapterDryRunReceipt',
      noSecretDryRun: true,
      manifest: { agentId: 'x' },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('manifest.agentName'))).toBe(true);
    expect(result.errors.some((e) => e.includes('gateway must be an object'))).toBe(true);
  });

  it('rejects a receipt that leaks a secret flag', () => {
    const receipt = buildAgentCoreAdapterDryRun(FIXTURE_AGENT);
    const tampered = {
      ...receipt,
      identity: { ...receipt.identity, secretsIncluded: true },
    };

    const result = validateAgentCoreAdapterReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'identity.secretsIncluded must be false — CG-025 dry run must be no-secret'
    );
  });

  it('rejects an empty primitiveMappings array', () => {
    const receipt = buildAgentCoreAdapterDryRun(FIXTURE_AGENT);
    const tampered = { ...receipt, primitiveMappings: [] };

    const result = validateAgentCoreAdapterReceipt(tampered);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('primitiveMappings must be a non-empty array');
  });
});
