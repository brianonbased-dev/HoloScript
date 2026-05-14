/**
 * Twin Earth Robot / AI Tool Federation — canary tests
 *
 * task_1778618552503_6xk8
 * G.GOLD.013: every happy path is paired with at least one false-case test.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildTwinEarthFederationManifests,
  publishTwinEarthToolsToMesh,
  runTwinEarthFederationCanary,
  TWIN_EARTH_SERVICE_VERSION,
  handleTwinEarthFederationTool,
} from '../holomesh/twin-earth-federation';
import {
  clearMeshToolRegistry,
  discoverMeshTools,
  buildMeshToolManifest,
  invokePublishedMeshTool,
} from '../holomesh/mesh-tool-registry';
import type { SigningContext } from '../holomesh/identity/signing-middleware';
import { clearRobotAiRegistries } from '../robot-ai-mcp-tools';

const mockSigningCtx: SigningContext = {
  signedRequest: false,
  signingValid: true,
  signer: null,
  scopes: ['admin:*'],
} as SigningContext;

describe('twin-earth-federation', () => {
  beforeEach(() => {
    clearMeshToolRegistry();
    clearRobotAiRegistries();
  });

  // ── Happy path: manifest building ───────────────────────────────────────────

  it('builds 17 manifests with substrate capability tags', () => {
    const manifests = buildTwinEarthFederationManifests({
      publisher: { agentId: 'test-agent', name: 'test' },
    });
    expect(manifests).toHaveLength(17);
    for (const m of manifests) {
      // normalizeTag strips leading '@' in mesh-tool-registry.ts
      expect(m.capabilityTags).toContain('twin-earth');
      expect(m.capabilityTags).toContain('substrate');
      expect(m.serviceVersion).toBe(TWIN_EARTH_SERVICE_VERSION);
      expect(m.allowTransitiveInvocation).toBe(true);
      expect(m.endpoint.transport).toBe('local');
    }
  });

  it('tags robot tools with robot and ai tools with ai', () => {
    const manifests = buildTwinEarthFederationManifests({
      publisher: { agentId: 'test-agent', name: 'test' },
    });
    const robotActuate = manifests.find((m) => m.endpoint.toolName === 'twin_earth_robot_actuate');
    const aiInvoke = manifests.find((m) => m.endpoint.toolName === 'twin_earth_ai_invoke');
    expect(robotActuate?.capabilityTags).toContain('robot');
    expect(aiInvoke?.capabilityTags).toContain('ai');
  });

  // ── Happy path: publishing ────────────────────────────────────────────────

  it('publishes all 17 tools into the mesh registry', () => {
    const { published, errors } = publishTwinEarthToolsToMesh({
      publisher: { agentId: 'test-agent', name: 'test' },
    });
    expect(errors).toHaveLength(0);
    expect(published).toHaveLength(17);

    const discovered = discoverMeshTools('twin-earth', 100);
    expect(discovered.length).toBeGreaterThanOrEqual(17);
  });

  it('dry run builds manifests without registering', () => {
    const { published, errors } = publishTwinEarthToolsToMesh({
      publisher: { agentId: 'test-agent', name: 'test' },
      dryRun: true,
    });
    expect(errors).toHaveLength(0);
    expect(published).toHaveLength(17);

    const discovered = discoverMeshTools('twin-earth', 100);
    expect(discovered).toHaveLength(0);
  });

  // ── Happy path: canary ──────────────────────────────────────────────────────

  it('canary publishes, invokes, and audits missing primitives', async () => {
    const result = await runTwinEarthFederationCanary({
      publisher: { agentId: 'canary-agent', name: 'canary' },
      signingCtx: mockSigningCtx,
    });
    expect(result.success).toBe(true);
    expect(result.publishedCount).toBe(17);
    expect(result.targetTool).toBe('twin_earth_register_identity');
    expect(result.invocationSuccess).toBe(true);
    expect(Array.isArray(result.missingPrimitives)).toBe(true);

    // Known gaps — the canary should surface them
    expect(
      (result.missingPrimitives as string[]).some((p) => p.includes('actorSessionHandoff'))
    ).toBe(true);
    expect(
      (result.missingPrimitives as string[]).some((p) => p.includes('crossMcpReceiptEnvelope'))
    ).toBe(true);
    expect(
      (result.missingPrimitives as string[]).some((p) => p.includes('rollbackMetadata'))
    ).toBe(true);
    expect(
      (result.missingPrimitives as string[]).some((p) => p.includes('sourceArtifactHash'))
    ).toBe(true);

    // twin_earth_register_identity does not return a receiptId — envelope missing
    expect(result.receiptEnvelopePresent).toBe(false);
    expect(result.receiptEnvelopeNote).toContain('not wired');
    expect(result.hop).toBeDefined();
    expect((result.hop as Record<string, unknown>).callerAgentId).toBe('canary-agent');
  });

  // ── False-case: handler rejects unknown tool ────────────────────────────────

  it('handleTwinEarthFederationTool returns null for non-federation tool', async () => {
    const result = await handleTwinEarthFederationTool('holomesh_sovereign_topology', {});
    expect(result).toBeNull();
  });

  // ── False-case: mesh invoke refuses transitive when disallowed ───────────────

  it('invokePublishedMeshTool refuses when allowTransitiveInvocation is false', async () => {
    const manifest = buildMeshToolManifest(
      {
        tool_name: 'twin_earth_register_identity',
        capability_tags: ['twin-earth'],
        allow_transitive_invocation: false,
      },
      { agentId: 'test', name: 'test' }
    );
    const result = await invokePublishedMeshTool(manifest, {}, { allowHighRisk: true, signingCtx: mockSigningCtx });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('transitive invocation'),
    });
  });

  // ── False-case: canary detects tool-level failure from bad args ─────────────

  it('canary detects tool-level failure when underlying tool returns error', async () => {
    // Publish tools manually so we can invoke a manifest with bad args
    const { published } = publishTwinEarthToolsToMesh({
      publisher: { agentId: 'fail-agent', name: 'fail' },
    });
    const manifest = published.find((m) => m.endpoint.toolName === 'twin_earth_register_identity');
    expect(manifest).toBeDefined();

    // Missing required fields — underlying tool returns { error: ... }
    const invocation = await invokePublishedMeshTool(
      manifest!,
      { walletAddress: '0xBad' }, // missing handle, attestation, kind
      { allowHighRisk: true, signingCtx: mockSigningCtx }
    );
    expect(invocation).toMatchObject({
      success: true,
      route: expect.anything(),
      result: { error: expect.stringContaining('handle') },
    });
  });
});
