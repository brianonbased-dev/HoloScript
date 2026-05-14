/**
 * Twin Earth Robot / AI Tool Federation
 *
 * Bridges robot-ai-mcp-tools.ts into the HoloMesh tool registry so the
 * orchestrator can discover and route substrate tools without pulling in
 * HoloLand game semantics.
 *
 * task_1778618552503_6xk8
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { robotAiMcpTools, handleRobotAiMcpTool, clearRobotAiRegistries } from '../robot-ai-mcp-tools';
import type { SigningContext } from './identity/signing-middleware';
import {
  buildMeshToolManifest,
  publishMeshToolManifest,
  clearMeshToolRegistry,
  invokePublishedMeshTool,
  createMeshToolInvocationHop,
  type MeshToolManifest,
} from './mesh-tool-registry';

export const TWIN_EARTH_SERVICE_VERSION = '1.0.0';

export interface TwinEarthFederationOptions {
  /** Override default capability tags appended to every manifest. */
  extraTags?: string[];
  /** When true, manifests are built but not registered. */
  dryRun?: boolean;
  /** Publisher identity. */
  publisher?: { agentId: string; name: string };
  /** Signing context for mesh invocation (tests pass admin:* to bypass gate). */
  signingCtx?: SigningContext;
}

function defaultPublisher(): { agentId: string; name: string } {
  return {
    agentId: process.env.HOLOMESH_AGENT_ID ?? 'did:agent:local',
    name: process.env.HOLOMESH_AGENT_NAME ?? 'holomesh-agent',
  };
}

function capabilityTagsForTool(tool: Tool): string[] {
  const base = ['@twin-earth', '@substrate'];
  if (tool.name?.startsWith('twin_earth_robot')) base.push('@robot');
  else if (tool.name?.startsWith('twin_earth_ai')) base.push('@ai');
  else if (tool.name === 'twin_earth_capture_receipt') base.push('@receipt');
  else if (tool.name?.includes('identity')) base.push('@identity');
  else if (tool.name?.includes('safety_envelope')) base.push('@envelope');
  else if (tool.name?.includes('permission')) base.push('@permission');
  return base;
}

/**
 * Build mesh manifests for every robot/AI tool, including federation metadata.
 */
export function buildTwinEarthFederationManifests(
  options: TwinEarthFederationOptions = {}
): MeshToolManifest[] {
  const publisher = options.publisher ?? defaultPublisher();
  return robotAiMcpTools.map((tool) =>
    buildMeshToolManifest(
      {
        tool_name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
        capability_tags: [...capabilityTagsForTool(tool), ...(options.extraTags ?? [])],
        allow_transitive_invocation: true,
        service_version: TWIN_EARTH_SERVICE_VERSION,
        actor_session_handoff: false,
        cross_mcp_receipt_envelope: false,
        rollback_metadata: false,
        source_artifact_hash: 'git:HEAD', // placeholder — canary will flag
      },
      publisher
    )
  );
}

/**
 * Publish all Twin Earth robot/AI tools into the local mesh registry.
 */
export function publishTwinEarthToolsToMesh(
  options: TwinEarthFederationOptions = {}
): { published: MeshToolManifest[]; errors: string[] } {
  const manifests = buildTwinEarthFederationManifests(options);
  const published: MeshToolManifest[] = [];
  const errors: string[] = [];

  for (const manifest of manifests) {
    if (options.dryRun) {
      published.push(manifest);
      continue;
    }
    try {
      published.push(publishMeshToolManifest(manifest));
    } catch (err) {
      errors.push(`${manifest.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { published, errors };
}

/**
 * Canary: publish → invoke → audit missing federation primitives.
 */
export async function runTwinEarthFederationCanary(
  options: TwinEarthFederationOptions = {}
): Promise<Record<string, unknown>> {
  clearMeshToolRegistry();
  clearRobotAiRegistries();

  const publisher = options.publisher ?? defaultPublisher();
  const { published, errors } = publishTwinEarthToolsToMesh({ ...options, publisher });

  if (errors.length > 0) {
    return { success: false, stage: 'publish', errors };
  }

  const targetToolName = 'twin_earth_register_identity';
  const targetManifest = published.find((m) => m.endpoint.toolName === targetToolName);
  if (!targetManifest) {
    return {
      success: false,
      stage: 'resolve',
      error: `Published manifest for ${targetToolName} not found`,
    };
  }

  const toolArgs = {
    walletAddress: '0xCanary',
    handle: 'Canary Bot',
    attestation: '0xCanaryAttest',
    kind: 'robot',
  };

  const invocation = await invokePublishedMeshTool(targetManifest, toolArgs, {
    allowHighRisk: true,
    signingCtx: options.signingCtx,
  });

  const invocationSuccess =
    typeof invocation === 'object' &&
    invocation !== null &&
    (invocation as Record<string, unknown>).success === true &&
    (invocation as Record<string, unknown>).result !== null &&
    ((invocation as Record<string, unknown>).result as Record<string, unknown>)?.success === true;

  // Build provenance hop (even if invocation failed — audit trail)
  const hop = createMeshToolInvocationHop(targetManifest, toolArgs, {
    callerAgentId: publisher.agentId,
  });

  // Audit every manifest for missing federation primitives
  const missingPrimitives: string[] = [];
  for (const m of published) {
    if (!m.serviceVersion) missingPrimitives.push(`serviceVersion missing on ${m.name}`);
    if (m.actorSessionHandoff !== true) missingPrimitives.push(`actorSessionHandoff false on ${m.name}`);
    if (m.crossMcpReceiptEnvelope !== true) missingPrimitives.push(`crossMcpReceiptEnvelope false on ${m.name}`);
    if (m.rollbackMetadata !== true) missingPrimitives.push(`rollbackMetadata false on ${m.name}`);
    if (!m.sourceArtifactHash || m.sourceArtifactHash === 'git:HEAD') {
      missingPrimitives.push(`sourceArtifactHash placeholder on ${m.name}`);
    }
  }

  // Check whether the invocation result itself carries a substrate receipt
  const receiptEnvelopePresent =
    typeof invocation === 'object' &&
    invocation !== null &&
    'receiptId' in (invocation as Record<string, unknown>);

  return {
    success: true,
    publishedCount: published.length,
    targetTool: targetToolName,
    manifestId: targetManifest.id,
    invocationSuccess,
    missingPrimitives,
    receiptEnvelopePresent,
    receiptEnvelopeNote: receiptEnvelopePresent
      ? 'Invocation result contains receiptId — partial envelope present'
      : 'Invocation result lacks receiptId — cross-MCP receipt envelope not wired',
    provenanceChainLength: 1,
    hop,
  };
}

// ── MCP Tool Surface ──

export const twinEarthFederationTools: Tool[] = [
  {
    name: 'holomesh_federate_twin_earth',
    description:
      'Auto-publish all Twin Earth robot/AI substrate tools into the HoloMesh tool registry with federation metadata. ' +
      'Optionally runs a canary that routes one tool through holomesh_invoke_tool and audits missing federation primitives.',
    inputSchema: {
      type: 'object',
      properties: {
        dry_run: {
          type: 'boolean',
          description: 'Build manifests without registering them.',
        },
        run_canary: {
          type: 'boolean',
          description: 'After publishing, invoke twin_earth_register_identity via mesh routing and record gaps.',
        },
        publisher_agent_id: {
          type: 'string',
          description: 'Optional publishing agent identity.',
        },
        publisher_name: {
          type: 'string',
          description: 'Optional publishing agent name.',
        },
      },
    },
  },
];

export async function handleTwinEarthFederationTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  if (name !== 'holomesh_federate_twin_earth') return null;

  const publisher = {
    agentId:
      (args.publisher_agent_id as string | undefined) ??
      process.env.HOLOMESH_AGENT_ID ??
      'did:agent:local',
    name:
      (args.publisher_name as string | undefined) ??
      process.env.HOLOMESH_AGENT_NAME ??
      'holomesh-agent',
  };

  const dryRun = args.dry_run === true;

  if (args.run_canary === true) {
    return runTwinEarthFederationCanary({ publisher, dryRun });
  }

  const { published, errors } = publishTwinEarthToolsToMesh({ publisher, dryRun });
  return {
    success: errors.length === 0,
    publishedCount: published.length,
    errorCount: errors.length,
    errors: errors.length > 0 ? errors : undefined,
    manifests: published.map((m) => ({
      id: m.id,
      name: m.name,
      capabilityTags: m.capabilityTags,
      serviceVersion: m.serviceVersion,
      actorSessionHandoff: m.actorSessionHandoff,
      crossMcpReceiptEnvelope: m.crossMcpReceiptEnvelope,
      rollbackMetadata: m.rollbackMetadata,
      sourceArtifactHash: m.sourceArtifactHash,
    })),
  };
}
