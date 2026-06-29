import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { HoloCompositionParser } from '../HoloCompositionParser';

const CONTRACT_PATH = resolve(
  process.cwd(),
  'examples/integration/foundry-toolbox-adapter-contract.holo',
);

type HoloTraitNode = {
  name?: string;
  config?: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTruthy();
  expect(typeof value).toBe('object');
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  expect(Array.isArray(value)).toBe(true);
  return value as string[];
}

function loadContract(): Record<string, unknown> {
  const source = readFileSync(CONTRACT_PATH, 'utf8');
  const parser = new HoloCompositionParser();
  const result = parser.parse(source);

  expect(result.success).toBe(true);

  const traits = (result.ast?.traits || []) as HoloTraitNode[];
  const contract = traits.find((trait) => trait.name === 'foundry_toolbox_adapter');
  expect(contract).toBeDefined();
  return asRecord(contract?.config);
}

describe('Foundry Toolbox adapter contract', () => {
  it('parses the contract as a native HoloScript declaration', () => {
    const contract = loadContract();

    expect(contract.id).toBe('holoscript-foundry-toolbox-v0');
    expect(contract.source_gap).toBe('CG-023');
    expect(contract.board_task).toBe('task_1782773705817_t3pk');
    expect(contract.phase).toBe('phase_1_contract');
    expect(contract.foundry_surface).toBe('toolbox_mcp_endpoint');
    expect(contract.endpoint_shape).toBe('single_mcp_compatible_endpoint');
  });

  it('names the exact HoloScript MCP tools exposed through the toolbox', () => {
    const contract = loadContract();
    const exposedTools = (contract.exposed_tools || []) as Array<Record<string, unknown>>;
    const toolNames = exposedTools.map((tool) => tool.holoscript_tool);
    const foundryNames = exposedTools.map((tool) => tool.foundry_tool_name);

    expect(toolNames).toEqual([
      'validate_holoscript',
      'compile_holoscript',
      'holo_query_codebase',
      'holo_generate_refactor_plan',
      'conformance_check_artifact',
      'verify_cael_trace',
    ]);
    expect(foundryNames).toEqual([
      'holoscript_validate',
      'holoscript_compile',
      'holoscript_codebase_query',
      'holoscript_refactor_plan',
      'holoscript_conformance_check',
      'holoscript_verify_cael_trace',
    ]);
  });

  it('preserves provenance and evaluation receipt fields', () => {
    const contract = loadContract();
    const fields = asStringArray(contract.evidence_receipt_fields);

    expect(fields).toEqual(expect.arrayContaining([
      'cael_trace_id',
      'trace_jsonl_sha256',
      'verify_url',
      'conformance_report_id',
      'evaluation_score',
      'holo_sig_agent_fingerprint',
      'x402_receipt_id',
    ]));
  });

  it('keeps the Entra boundary explicit without moving HoloScript provenance', () => {
    const contract = loadContract();
    const identityBoundary = asRecord(contract.identity_boundary);

    expect(identityBoundary.foundry_identity).toContain('Entra Agent ID');
    expect(identityBoundary.holoscript_identity).toContain('HoloKey x402 signer');
    expect(identityBoundary.holoscript_identity).toContain('CAEL trace');
    expect(identityBoundary.token_exchange).toContain('secret values never appear');
  });

  it('declares non-goals for deployment, paid cloud spend, and publication', () => {
    const contract = loadContract();
    const nonGoals = asStringArray(contract.non_goals);

    expect(nonGoals).toEqual(expect.arrayContaining([
      'azure_deployment',
      'paid_cloud_spend',
      'hosted_agent_container',
      'm365_copilot_publication',
      'agent365_production_registration',
      'production_readiness_claim',
    ]));
  });
});
