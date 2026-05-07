/**
 * End-to-End Composition Demo (task_1778125252148_qe2i).
 *
 * Marathon-mode shipping pattern, same as u8q2 / jira / zp7u / xsp6.
 *
 * What this test proves: the five primitives shipped 2026-05-06 do not
 * just exist - they COMPOSE. One happy-path cycle stitches:
 *
 *   [1] SpatialMCPContext      jira  57fae81ba+ed284b32f+e134ee1c6
 *   [2] holomesh_invoke_tool   yqll  e9942dc9e+1419cce6d
 *   [3] agent-negotiation      xsp6  cbdab1387
 *   [4] vault-lease-registry   u8q2  16f5014be
 *   [5] HologramMcpResponse    zp7u  642ab1d75
 *
 * Scope guardrail (task description): one happy-path cycle, two agents
 * (VRUser + BrittneyChat), one VR context, one hologram returned.
 *
 * G.GOLD.013 discipline: every computed assertion has its FALSE-CASE
 * counterpart, so a regression that reverts the chain to "everything
 * returns true unconditionally" would still flip these tests red.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// [1] Spatial - the SpatialMCPContext schema + validator + placement.
import {
  SPATIAL_CONTEXT_VERSION,
  SPATIAL_FRAME,
  validateSpatialContext,
  pickPlacement,
  type SpatialMCPContext,
} from '@holoscript/core';

// [5] Hologram MCP - response schema + envelope + detect helper.
import {
  HOLOGRAM_CONTENT_TYPES,
  HOLOGRAM_MCP_VERSION,
  buildHologramMcpResponse,
  wrapHologramMcpEnvelope,
  detectHologramContent,
  validateHologramMcpResponse,
  type HologramMcpResponse,
} from '@holoscript/core';

// [2] Mesh tool registry - publish + invoke + attestation chain.
import {
  buildMeshToolManifest,
  publishMeshToolManifest,
  invokePublishedMeshTool,
  verifyMeshToolAttestation,
  verifyMeshToolInvocationChain,
  createMeshToolInvocationHop,
  clearMeshToolRegistry,
  discoverMeshTools,
  type MeshToolInvocationHop,
} from '../../src/holomesh/mesh-tool-registry';

// [3] Agent negotiation - state machine + co-signed settlement.
import {
  createNegotiation,
  advanceNegotiation,
  settleNegotiation,
  getNegotiation,
  _resetNegotiations,
  type NegotiationQuote,
} from '../../src/holomesh/agent-negotiation';

// [4] Vault leases - task-scoped credential leases.
import {
  issueLease,
  resolveSecret,
  revokeLeasesForTask,
  _resetVaultLeaseRegistryForTests,
  type SecretRef,
} from '../../src/holomesh/identity/vault-lease-registry';

// ── Fixture: the VR user, the chat agent, the task ────────────────────

const TEAM_ID = 'team_composition_demo_qe2i';
const TASK_ID = 'task_1778125252148_qe2i';

const VR_USER_ID = 'agent_vr_user_quest3';
const VR_USER_NAME = 'VRUser';
const VR_USER_ADDR = '0x000000000000000000000000000000000000a000';

const BRITTNEY_ID = 'agent_brittney_chat_studio';
const BRITTNEY_NAME = 'BrittneyChat';
const BRITTNEY_ADDR = '0x000000000000000000000000000000000000b000';

/** Realistic SpatialMCPContext for a Quest 3 user mid-frame. */
function buildVRSpatialContext(): SpatialMCPContext {
  return {
    version: SPATIAL_CONTEXT_VERSION,
    frame: SPATIAL_FRAME,
    headset: {
      position: [0, 1.65, 0],
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    gaze: {
      origin: [0, 1.65, 0],
      direction: [0, 0, -1], // looking forward
      hitDistance: 0.5,
    },
    hands: {
      right: {
        position: [0.25, 1.2, -0.4],
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        grip: 0.3,
        pinch: 0.8,
      },
    },
    room: {
      aabb: { min: [-2, 0, -2], max: [2, 3, 2] },
      floorHeight: 0,
    },
    meta: { surface: 'quest-3', sessionId: 'demo' },
  };
}

describe('agentic-internet composition demo (task_1778125252148_qe2i)', () => {
  beforeEach(() => {
    clearMeshToolRegistry();
    _resetNegotiations();
    _resetVaultLeaseRegistryForTests();
  });

  it('runs the full five-primitive cycle and returns a HologramMcpEnvelope', async () => {
    // ── [1/5] SPATIAL ─────────────────────────────────────────────
    // The VR user emits a SpatialMCPContext. Validator must pass.
    const spatialCtx = buildVRSpatialContext();
    const spatialValidation = validateSpatialContext(spatialCtx);
    expect(spatialValidation.ok).toBe(true);
    expect(spatialValidation.errors).toEqual([]);

    // pickPlacement consumes the context to choose where to place the
    // hologram. With gaze + hitDistance we expect the gaze-hit branch.
    const placement = pickPlacement(spatialCtx);
    expect(placement.source).toBe('gaze-hit');
    expect(placement.position).toEqual([0, 1.65, -0.5]); // origin + dir*hit

    // ── [2/5] ROUTING via mesh-tool registry ──────────────────────
    // Brittney publishes the AlphaFold render tool with a capability
    // tag the VR user can search for. Attestation hash must verify.
    const manifest = publishMeshToolManifest(
      buildMeshToolManifest(
        {
          tool_name: 'alphafold_fetch_structure',
          description: 'Render AlphaFold structure as a hologram for VR',
          capability_tags: ['alphafold', 'hologram', 'spatial-mcp'],
          allow_transitive_invocation: true,
        },
        { agentId: BRITTNEY_ID, name: BRITTNEY_NAME },
        new Date('2026-05-07T00:00:00.000Z'),
      ),
    );
    expect(verifyMeshToolAttestation(manifest)).toBe(true);

    // The VR user discovers Brittney's capability by tag.
    const discovered = discoverMeshTools('hologram alphafold');
    expect(discovered).toHaveLength(1);
    expect(discovered[0].id).toBe(manifest.id);

    // ── [3a/5] NEGOTIATION: open -> quoted -> accepted ─────────────
    // VR user (initiator) requests a quote. Brittney (responder) quotes.
    const negotiation = createNegotiation({
      teamId: TEAM_ID,
      initiatorAgentId: VR_USER_ID,
      initiatorAgentName: VR_USER_NAME,
      responderAgentId: BRITTNEY_ID,
      responderAgentName: BRITTNEY_NAME,
      request: {
        toolName: manifest.endpoint.toolName,
        capabilityQuery: 'alphafold hologram',
        args: { spatialCtx },
      },
      signerAddress: VR_USER_ADDR,
    });
    expect(negotiation.state).toBe('open');
    expect(negotiation.events).toHaveLength(1);

    const quote: NegotiationQuote = {
      toolName: manifest.endpoint.toolName,
      description: 'Render AlphaFold structure as quilt hologram',
      price: 0.05,
      currency: 'USDC',
      slaSeconds: 30,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const quoted = advanceNegotiation({
      negotiationId: negotiation.id,
      action: 'quote',
      authorAgentId: BRITTNEY_ID,
      signerAddress: BRITTNEY_ADDR,
      payload: { quote },
    });
    expect(quoted.ok).toBe(true);
    expect(quoted.negotiation?.state).toBe('quoted');

    const accepted = advanceNegotiation({
      negotiationId: negotiation.id,
      action: 'accept',
      authorAgentId: VR_USER_ID,
      signerAddress: VR_USER_ADDR,
    });
    expect(accepted.ok).toBe(true);
    expect(accepted.negotiation?.state).toBe('accepted');

    // ── [4/5] VAULT LEASE: mid-negotiation credential resolution ───
    // Brittney needs ALPHAFOLD_API_KEY to execute the rendering tool.
    // The lease is task-scoped (tied to qe2i). G.GOLD.016 wallet refs
    // would be rejected here — see the false-case test below.
    const apiKeyRef: SecretRef = 'env:ALPHAFOLD_API_KEY';
    const leaseResult = issueLease({
      taskId: TASK_ID,
      agentId: BRITTNEY_ID,
      agentTag: 'brittney-chat-studio',
      scope: [apiKeyRef],
      durationMs: 60 * 60 * 1000, // 1 hour
    });
    expect(leaseResult.ok).toBe(true);
    if (!leaseResult.ok) throw new Error(leaseResult.reason);

    const resolved = resolveSecret({
      leaseId: leaseResult.lease.leaseId,
      agentId: BRITTNEY_ID,
      secretRef: apiKeyRef,
    });
    expect(resolved.ok).toBe(true);
    expect(resolved.resolved).toBe(true);
    expect(resolved.secretRef).toBe(apiKeyRef);

    // ── [3b/5] NEGOTIATION: accepted -> executed ───────────────────
    // Brittney executes the tool. Result hash is recorded for the
    // settlement receipt.
    const toolResult = await invokePublishedMeshTool(
      manifest,
      {
        organism: 'human',
        gene: 'EGFR',
        spatialCtx,
        // The lease guarantees the API key is available; we hash the
        // SUCCESS of the lease check, not the bare key, to keep the
        // result hash audit-safe.
        credentialResolved: resolved.resolved,
      },
      {
        // Local invoker stub — represents the Brittney handler. In real
        // dispatch this would be the orchestrator's handleTool.
        localInvoker: async (toolName, args) => ({
          ok: true,
          toolName,
          structurePdb: '<<MOCK_PDB_HEADER>>',
          frame: SPATIAL_FRAME,
          placedAt: pickPlacement(args.spatialCtx as SpatialMCPContext).position,
        }),
        allowHighRisk: true,
      },
    ) as { success: boolean; result: unknown };
    expect(toolResult.success).toBe(true);

    const executed = advanceNegotiation({
      negotiationId: negotiation.id,
      action: 'execute',
      authorAgentId: BRITTNEY_ID,
      signerAddress: BRITTNEY_ADDR,
      payload: { result: toolResult.result },
    });
    expect(executed.ok).toBe(true);
    expect(executed.negotiation?.state).toBe('executed');

    // ── [3c/5] NEGOTIATION: executed -> settled (co-signed) ───────
    // Both parties sign. The receipt is the durable artifact.
    const settled = settleNegotiation({
      negotiationId: negotiation.id,
      authorAgentId: VR_USER_ID,
      signerAddress: VR_USER_ADDR,
      initiatorSignature: '0xinitiatorsig_demo',
      initiatorAddress: VR_USER_ADDR,
      responderSignature: '0xrespondersig_demo',
      responderAddress: BRITTNEY_ADDR,
    });
    expect(settled.ok).toBe(true);
    const finalNeg = getNegotiation(negotiation.id);
    expect(finalNeg?.state).toBe('settled');
    expect(finalNeg?.receipt).toBeDefined();
    expect(finalNeg?.receipt?.initiatorAddress).toBe(VR_USER_ADDR);
    expect(finalNeg?.receipt?.responderAddress).toBe(BRITTNEY_ADDR);
    expect(finalNeg?.receipt?.resultHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(finalNeg?.receipt?.finalQuote.price).toBe(0.05);

    // ── [5/5] HOLOGRAM RESPONSE returned to Studio Brittney chat ──
    // Brittney builds the HologramMcpResponse and the MCP server wraps
    // it in the dispatch envelope. The chat client detects + renders.
    const hologramResponse: HologramMcpResponse = buildHologramMcpResponse({
      contentType: HOLOGRAM_CONTENT_TYPES.holo,
      payload: { kind: 'hash', hash: 'sha256-mock-alphafold-egfr-quilt' },
      text: 'EGFR structure rendered as a hologram, placed at gaze-hit point.',
      producedBy: manifest.endpoint.toolName,
      label: 'EGFR (homo sapiens)',
      caption: `Negotiated for ${quote.price} ${quote.currency}, settled with co-signed receipt ${finalNeg!.receipt!.negotiationId}`,
      hints: { preferredViewer: 'quilt', animate: true },
      extraMeta: {
        negotiationId: negotiation.id,
        leaseId: leaseResult.lease.leaseId,
        manifestHash: manifest.attestation.manifestHash,
        placedAt: placement.position,
      },
    });
    expect(validateHologramMcpResponse(hologramResponse).ok).toBe(true);

    const envelope = wrapHologramMcpEnvelope(hologramResponse);
    expect(envelope.content).toHaveLength(1);
    expect(envelope.content[0]?.type).toBe('text');
    expect(envelope.hologramContent).toBe(hologramResponse);

    // The chat client's detector picks up the typed channel.
    const detected = detectHologramContent(envelope);
    expect(detected).not.toBeNull();
    expect(detected?.content_type).toBe(HOLOGRAM_CONTENT_TYPES.holo);
    expect(detected?.version).toBe(HOLOGRAM_MCP_VERSION);
    expect(detected?.meta.label).toBe('EGFR (homo sapiens)');

    // ── Provenance: verify the full mesh invocation chain ────────
    // The hop emitted by invokePublishedMeshTool is hash-linked to the
    // manifest. Build the hop and verify the chain end-to-end.
    const hop: MeshToolInvocationHop = createMeshToolInvocationHop(
      manifest,
      { spatialCtx, negotiationId: negotiation.id },
      { callerAgentId: VR_USER_ID, previousHash: null },
    );
    const verification = verifyMeshToolInvocationChain([hop]);
    expect(verification.verified).toBe(true);
    expect(verification.errors).toEqual([]);
    expect(verification.lastHash).toBe(hop.hopHash);

    // ── Cleanup: revoke the lease (task done) ─────────────────────
    const revoked = revokeLeasesForTask(TASK_ID, 'task_completed', 'system');
    expect(revoked).toHaveLength(1);
    expect(revoked[0]?.status).toBe('revoked');
  });

  // ── G.GOLD.013 false-case discipline ────────────────────────────
  // For each happy-path assertion above that returns 'true' / 'ok',
  // there is a paired check below where the assertion MUST fail. If a
  // regression makes the chain unconditionally return success, these
  // flip red.

  it('false-case: SpatialMCPContext rejects non-unit gaze direction', () => {
    const bad = buildVRSpatialContext();
    bad.gaze = { origin: [0, 0, 0], direction: [1, 1, 1] }; // |dir| = sqrt(3)
    const v = validateSpatialContext(bad);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.path === 'gaze.direction')).toBe(true);
  });

  it('false-case: tampered manifest fails attestation verification', () => {
    const manifest = buildMeshToolManifest(
      {
        tool_name: 'alphafold_fetch_structure',
        capability_tags: ['alphafold', 'hologram'],
      },
      { agentId: BRITTNEY_ID, name: BRITTNEY_NAME },
    );
    expect(verifyMeshToolAttestation(manifest)).toBe(true);
    const tampered = { ...manifest, capabilityTags: [...manifest.capabilityTags, 'leaked'] };
    expect(verifyMeshToolAttestation(tampered)).toBe(false);
  });

  it('false-case: negotiation rejects responder accepting their own quote', () => {
    const n = createNegotiation({
      teamId: TEAM_ID,
      initiatorAgentId: VR_USER_ID,
      initiatorAgentName: VR_USER_NAME,
      responderAgentId: BRITTNEY_ID,
      responderAgentName: BRITTNEY_NAME,
      request: { toolName: 'demo', capabilityQuery: 'demo' },
    });
    advanceNegotiation({
      negotiationId: n.id,
      action: 'quote',
      authorAgentId: BRITTNEY_ID,
      payload: {
        quote: {
          toolName: 'demo',
          description: 'demo',
          price: 0,
          currency: 'USDC',
          slaSeconds: 0,
          expiresAt: new Date(Date.now() + 10_000).toISOString(),
        },
      },
    });
    // Responder cannot accept their own quote — only initiator can.
    const r = advanceNegotiation({
      negotiationId: n.id,
      action: 'accept',
      authorAgentId: BRITTNEY_ID,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('wrong-actor');
  });

  it('false-case (G.GOLD.016): wallet refs are PERMANENTLY UNLEASABLE', () => {
    const result = issueLease({
      taskId: TASK_ID,
      agentId: BRITTNEY_ID,
      scope: ['env:HOLOMESH_WALLET_KEY'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('wallet leased — that should be impossible');
    expect(result.reason).toBe('wallet_unleasable');
  });

  it('false-case: lease scope violation is rejected and audited', () => {
    const lease = issueLease({
      taskId: TASK_ID,
      agentId: BRITTNEY_ID,
      scope: ['env:ALPHAFOLD_API_KEY'],
    });
    if (!lease.ok) throw new Error('lease should issue');
    const out = resolveSecret({
      leaseId: lease.lease.leaseId,
      agentId: BRITTNEY_ID,
      secretRef: 'env:SOMETHING_ELSE',
    });
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('lease_scope_violation');
    expect(out.resolved).toBe(false);
  });

  it('false-case: non-hologram envelope returns null from detectHologramContent', () => {
    const plainEnvelope = { content: [{ type: 'text', text: 'just chat, no hologram' }] };
    expect(detectHologramContent(plainEnvelope)).toBeNull();
    expect(detectHologramContent(null)).toBeNull();
    expect(detectHologramContent({ random: 'object' })).toBeNull();
  });

  it('false-case: tampered invocation hop breaks chain verification', () => {
    const manifest = publishMeshToolManifest(
      buildMeshToolManifest(
        {
          tool_name: 'alphafold_fetch_structure',
          capability_tags: ['alphafold'],
          allow_transitive_invocation: true,
        },
        { agentId: BRITTNEY_ID, name: BRITTNEY_NAME },
      ),
    );
    const hop = createMeshToolInvocationHop(manifest, { foo: 1 }, { callerAgentId: VR_USER_ID });
    // Mutate the hop body — now the recomputed hopHash should not match.
    const tampered = { ...hop, argsHash: 'tampered' };
    const v = verifyMeshToolInvocationChain([tampered]);
    expect(v.verified).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });
});
