/**
 * verify_cross_perceiver MCP tool — cross-perceiver consensus as a production
 * falsification oracle (@cross_perceiver_contract wired into compiler-tools).
 *
 * Tests the handler directly (same pattern as other compiler-tools suites) plus
 * the registration/dispatch surface. RBAC: no token is passed, exercising the
 * exact backwards-compatible skip the generic compile path uses; the compilers
 * validate any non-empty token themselves.
 */
import { describe, it, expect } from 'vitest';
import {
  compilerTools,
  handleCompilerTool,
  handleVerifyCrossPerceiver,
  type CrossPerceiverVerifyResult,
} from '../compiler-tools';

/** One agent-bearing spatial object (2 tool affordances) + one plain scene object. */
const CONSENSUS_SOURCE = `
composition "consensusProbe" {
  object "HandleBot" {
    @agent(role: "manipulator")
    @tool(name: "grab_handle", description: "Grab the door handle")
    @tool(name: "release_handle", description: "Release the handle")
    geometry: "sphere"
    position: [1, 2, 3]
  }
  object "DoorHandle" {
    @interactable
    geometry: "box"
    position: [1, 2.5, 3]
  }
}
`;

/**
 * Every artifact is HONEST here — presence/geometry/position all agree — but
 * the declared affordance targets a beacon ~49 units outside the fixed-mobility
 * reach envelope, so the grounding contract must falsify.
 */
const FALSIFIED_SOURCE = `
composition "groundedProbe" {
  object "HandleBot" {
    @agent(role: "manipulator")
    @tool(name: "press_beacon", description: "Press the beacon", target: "FarBeacon")
    geometry: "sphere"
    position: [1, 2, 3]
  }
  object "FarBeacon" {
    @interactable
    geometry: "box"
    position: [50, 0, 0]
  }
}
`;

describe('verify_cross_perceiver — registration', () => {
  it('is registered in compilerTools with code required and FALSIFIED marked load-bearing', () => {
    const tool = compilerTools.find((t) => t.name === 'verify_cross_perceiver');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.required).toEqual(['code']);
    // The design constraint must be encoded in the tool description itself.
    expect(tool!.description).toMatch(/FALSIFIED/);
    expect(tool!.description).toMatch(/LOAD-BEARING/i);
    expect(tool!.description).toMatch(/hard failure/i);
    expect(tool!.description).toMatch(/NEVER be demoted to a warning/i);
  });

  it('dispatches through handleCompilerTool', async () => {
    const result = (await handleCompilerTool('verify_cross_perceiver', {
      code: CONSENSUS_SOURCE,
    })) as CrossPerceiverVerifyResult;
    expect(result).not.toBeNull();
    expect(result.verdict).toBe('CONSENSUS');
  });
});

describe('verify_cross_perceiver — consensus and falsification', () => {
  it('3-perceiver CONSENSUS on a valid composition, receipt bound to artifacts', async () => {
    const result = await handleVerifyCrossPerceiver({ code: CONSENSUS_SOURCE });

    expect(result.success).toBe(true);
    expect(result.verdict).toBe('CONSENSUS');
    // Top-level verdict is a mirror of the receipt's — never diverges.
    expect(result.verdict).toBe(result.receipt.verdict);
    expect(result.receipt.version).toBe('perceiver-consensus-v3');
    expect(result.receipt.sourceName).toBe('consensusProbe');
    expect(result.receipt.disagreements).toEqual([]);
    expect(result.receipt.comparedFacts).toBeGreaterThanOrEqual(9);
    expect(result.receipt.perceivers.map((p) => p.perceiver)).toEqual([
      'agent-inference',
      'urdf',
      'webgpu',
    ]);
    for (const p of result.receipt.perceivers) {
      expect(p.artifactHash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(result.receipt.receiptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.perceivers).toEqual(['webgpu', 'agent-inference', 'urdf']);
    expect(result.sourceSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('FALSIFIED surfaces the concrete disagreement (ungroundable affordance)', async () => {
    const result = await handleVerifyCrossPerceiver({ code: FALSIFIED_SOURCE });

    expect(result.verdict).toBe('FALSIFIED');
    expect(result.receipt.verdict).toBe('FALSIFIED');
    expect(result.receipt.disagreements.length).toBeGreaterThanOrEqual(1);
    const grounding = result.receipt.disagreements.find(
      (d) => d.fact === 'grounding:HandleBot:press_beacon'
    );
    expect(grounding).toBeDefined();
    expect(grounding!.claims['agent-inference']).toBe('press_beacon@FarBeacon');
    expect(grounding!.detail).toMatch(/no reachable affordance|ungrounded/);
  });

  it('supports a 2-perceiver subset and keeps canonical ordering', async () => {
    const result = await handleVerifyCrossPerceiver({
      code: CONSENSUS_SOURCE,
      perceivers: ['urdf', 'webgpu'], // reversed on purpose
    });
    expect(result.verdict).toBe('CONSENSUS');
    expect(result.perceivers).toEqual(['webgpu', 'urdf']);
    expect(result.receipt.perceivers.map((p) => p.perceiver)).toEqual(['urdf', 'webgpu']);
  });
});

describe('verify_cross_perceiver — guardrails', () => {
  it('fewer than 2 perceivers is a clean error (single-perceiver consensus is circular)', async () => {
    await expect(
      handleVerifyCrossPerceiver({ code: CONSENSUS_SOURCE, perceivers: ['webgpu'] })
    ).rejects.toThrow(/at least 2 distinct perceivers/);
    // Duplicates dedupe to one — same circularity, same clean refusal.
    await expect(
      handleVerifyCrossPerceiver({ code: CONSENSUS_SOURCE, perceivers: ['webgpu', 'webgpu'] })
    ).rejects.toThrow(/at least 2 distinct perceivers/);
  });

  it('unknown perceiver ids are rejected with the valid list', async () => {
    await expect(
      handleVerifyCrossPerceiver({ code: CONSENSUS_SOURCE, perceivers: ['webgpu', 'r3f'] })
    ).rejects.toThrow(/Unknown perceiver.*valid perceivers: webgpu, agent-inference, urdf/);
  });

  it('missing code is a clean error', async () => {
    await expect(handleVerifyCrossPerceiver({})).rejects.toThrow(/code is required/);
  });

  it('unparseable source is a clean error', async () => {
    await expect(
      handleVerifyCrossPerceiver({ code: 'composition {{{ definitely not holo' })
    ).rejects.toThrow(/Failed to parse composition/);
  });
});
