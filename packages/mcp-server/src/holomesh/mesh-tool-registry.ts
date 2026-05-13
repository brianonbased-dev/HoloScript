import axios from 'axios';
import * as crypto from 'crypto';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getToolRiskLevel, getToolScopes, type ToolRiskLevel } from '../security/tool-scopes';
import type { SigningContext } from '../holomesh/identity/signing-middleware';

const TOOL_MANIFEST_PROTOCOL = 'holomesh.tool_manifest.v1';
const TOOL_INVOCATION_PROTOCOL = 'holomesh.tool_invocation.v1';

export type MeshToolTransport = 'local' | 'mcp-http';

export interface MeshToolEndpoint {
  transport: MeshToolTransport;
  toolName: string;
  url?: string;
  headers?: Record<string, string>;
}

export interface MeshToolAttestation {
  protocol: typeof TOOL_MANIFEST_PROTOCOL;
  manifestHash: string;
  publishedAt: string;
  publisherAgentId: string;
  publisherName: string;
}

export interface MeshToolManifest {
  id: string;
  name: string;
  description: string;
  capabilityTags: string[];
  inputSchema?: Record<string, unknown>;
  endpoint: MeshToolEndpoint;
  allowTransitiveInvocation: boolean;
  maxRisk: ToolRiskLevel;
  scopes: string[];
  attestation: MeshToolAttestation;
}

export interface MeshToolPublisher {
  agentId: string;
  name: string;
}

export interface MeshToolInvokeOptions {
  dryRun?: boolean;
  allowHighRisk?: boolean;
  localInvoker?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

export interface MeshToolInvocationHop {
  protocol: typeof TOOL_INVOCATION_PROTOCOL;
  invocationId: string;
  manifestId: string;
  toolName: string;
  manifestHash: string;
  callerAgentId: string;
  argsHash: string;
  previousHash: string | null;
  invokedAt: string;
  hopHash: string;
}

export interface MeshToolInvocationChainVerification {
  verified: boolean;
  errors: string[];
  lastHash: string | null;
}

const registry = new Map<string, MeshToolManifest>();

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashManifestBody(body: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(stableJson(body)).digest('hex');
}

function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, '')
    .replace(/[^a-zA-Z0-9_.:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function collectCapabilityTags(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') {
    return value
      .split(/[,\s]+/)
      .map(normalizeTag)
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectCapabilityTags(item));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const tags: string[] = [];
    for (const [key, raw] of Object.entries(obj)) {
      if (raw === true) tags.push(normalizeTag(key));
      else if (typeof raw === 'string' || typeof raw === 'number') {
        tags.push(normalizeTag(String(raw)));
      } else if (Array.isArray(raw)) {
        tags.push(...collectCapabilityTags(raw));
      }
    }
    return tags;
  }
  return [];
}

function uniqueTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map(normalizeTag).filter(Boolean))).sort();
}

function deriveToolId(name: string, endpoint: MeshToolEndpoint, capabilityTags: string[]): string {
  const hash = hashManifestBody({
    name,
    endpoint,
    capabilityTags,
  }).slice(0, 12);
  return `mesh_tool_${normalizeTag(name)}_${hash}`;
}

function parseEndpoint(value: unknown, fallbackToolName: string): MeshToolEndpoint {
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value)) {
      return { transport: 'mcp-http', toolName: fallbackToolName, url: value };
    }
    return { transport: 'local', toolName: fallbackToolName };
  }

  const endpoint = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const transportRaw = typeof endpoint.transport === 'string' ? endpoint.transport : 'local';
  const transport: MeshToolTransport = transportRaw === 'mcp-http' ? 'mcp-http' : 'local';
  const toolName =
    typeof endpoint.toolName === 'string'
      ? endpoint.toolName
      : typeof endpoint.tool_name === 'string'
        ? endpoint.tool_name
        : fallbackToolName;
  const url = typeof endpoint.url === 'string' ? endpoint.url : undefined;
  const headers =
    endpoint.headers && typeof endpoint.headers === 'object'
      ? Object.fromEntries(
          Object.entries(endpoint.headers as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )
      : undefined;

  return {
    transport,
    toolName,
    ...(url ? { url } : {}),
    ...(headers ? { headers } : {}),
  };
}

function manifestBody(manifest: Omit<MeshToolManifest, 'attestation'>): Record<string, unknown> {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    capabilityTags: manifest.capabilityTags,
    inputSchema: manifest.inputSchema,
    endpoint: manifest.endpoint,
    allowTransitiveInvocation: manifest.allowTransitiveInvocation,
    maxRisk: manifest.maxRisk,
    scopes: manifest.scopes,
  };
}

export function buildMeshToolManifest(
  args: Record<string, unknown>,
  publisher: MeshToolPublisher,
  now = new Date()
): MeshToolManifest {
  const name =
    typeof args.name === 'string'
      ? args.name.trim()
      : typeof args.tool_name === 'string'
        ? args.tool_name.trim()
        : '';
  if (!name) throw new Error('name is required');

  const description =
    typeof args.description === 'string' && args.description.trim()
      ? args.description.trim()
      : `Mesh-published MCP tool ${name}`;
  const endpoint = parseEndpoint(args.endpoint, name);
  const capabilityTags = uniqueTags([
    ...collectCapabilityTags(args.capability_tags),
    ...collectCapabilityTags(args.capabilityTags),
    ...collectCapabilityTags(args.capabilities),
    ...collectCapabilityTags(args.tags),
    name,
  ]);
  if (capabilityTags.length === 0) {
    throw new Error('At least one capability tag is required');
  }

  const id =
    typeof args.id === 'string' && args.id.trim()
      ? normalizeTag(args.id)
      : deriveToolId(name, endpoint, capabilityTags);
  const targetRisk = getToolRiskLevel(endpoint.toolName);
  const maxRisk =
    typeof args.max_risk === 'string' ? (args.max_risk as ToolRiskLevel) : targetRisk;
  const inputSchema =
    args.input_schema && typeof args.input_schema === 'object'
      ? (args.input_schema as Record<string, unknown>)
      : args.inputSchema && typeof args.inputSchema === 'object'
        ? (args.inputSchema as Record<string, unknown>)
        : undefined;
  const allowTransitiveInvocation = args.allow_transitive_invocation === true;
  const withoutAttestation: Omit<MeshToolManifest, 'attestation'> = {
    id,
    name,
    description,
    capabilityTags,
    ...(inputSchema ? { inputSchema } : {}),
    endpoint,
    allowTransitiveInvocation,
    maxRisk,
    scopes: getToolScopes(endpoint.toolName),
  };

  return {
    ...withoutAttestation,
    attestation: {
      protocol: TOOL_MANIFEST_PROTOCOL,
      manifestHash: hashManifestBody(manifestBody(withoutAttestation)),
      publishedAt: now.toISOString(),
      publisherAgentId: publisher.agentId,
      publisherName: publisher.name,
    },
  };
}

export function verifyMeshToolAttestation(manifest: MeshToolManifest): boolean {
  const { attestation, ...withoutAttestation } = manifest;
  return (
    attestation.protocol === TOOL_MANIFEST_PROTOCOL &&
    attestation.manifestHash === hashManifestBody(manifestBody(withoutAttestation))
  );
}

export function publishMeshToolManifest(manifest: MeshToolManifest): MeshToolManifest {
  if (!verifyMeshToolAttestation(manifest)) {
    throw new Error('Mesh tool manifest attestation failed verification');
  }
  registry.set(manifest.id, manifest);
  return manifest;
}

function queryTerms(query: unknown): string[] {
  return uniqueTags(collectCapabilityTags(query));
}

export function scoreMeshToolManifest(query: unknown, manifest: MeshToolManifest): number {
  const terms = queryTerms(query);
  if (terms.length === 0) return 1;
  const haystack = uniqueTags([
    manifest.name,
    manifest.description,
    ...manifest.capabilityTags,
    manifest.endpoint.toolName,
  ]);
  return terms.reduce((score, term) => {
    if (manifest.capabilityTags.includes(term)) return score + 5;
    if (haystack.includes(term)) return score + 3;
    if (haystack.some((tag) => tag.includes(term) || term.includes(tag))) return score + 1;
    return score;
  }, 0);
}

export function discoverMeshTools(query: unknown, limit = 20): MeshToolManifest[] {
  return Array.from(registry.values())
    .map((manifest) => ({ manifest, score: scoreMeshToolManifest(query, manifest) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.manifest.name.localeCompare(b.manifest.name))
    .slice(0, limit)
    .map(({ manifest }) => manifest);
}

export function clearMeshToolRegistry(): void {
  registry.clear();
}

export function verifyMeshToolInvocationChain(
  chain: MeshToolInvocationHop[]
): MeshToolInvocationChainVerification {
  const errors: string[] = [];
  let previousHash: string | null = null;

  chain.forEach((hop, index) => {
    if (hop.protocol !== TOOL_INVOCATION_PROTOCOL) {
      errors.push(`hop ${index} protocol mismatch`);
    }
    if (hop.previousHash !== previousHash) {
      errors.push(`hop ${index} previousHash does not link to prior hop`);
    }

    const { hopHash, ...payload } = hop;
    void hopHash;
    const expectedHash = hashInvocationBody(payload);
    if (hop.hopHash !== expectedHash) {
      errors.push(`hop ${index} hash mismatch`);
    }
    previousHash = hop.hopHash;
  });

  return { verified: errors.length === 0, errors, lastHash: previousHash };
}

export function createMeshToolInvocationHop(
  manifest: MeshToolManifest,
  args: Record<string, unknown>,
  options: {
    callerAgentId?: string;
    invocationId?: string;
    invokedAt?: string;
    previousHash?: string | null;
  } = {}
): MeshToolInvocationHop {
  return buildInvocationHop({
    argsHash: hashManifestBody(args),
    callerAgentId: options.callerAgentId ?? process.env.HOLOMESH_AGENT_NAME ?? 'local-agent',
    invocationId: options.invocationId ?? crypto.randomUUID(),
    invokedAt: options.invokedAt ?? new Date().toISOString(),
    manifest,
    previousHash: options.previousHash ?? null,
  });
}

export function meshToolManifestToKnowledgeContent(manifest: MeshToolManifest): string {
  return `${TOOL_MANIFEST_PROTOCOL}\n${stableJson(manifest)}`;
}

export function meshToolManifestFromKnowledgeContent(content: string): MeshToolManifest | null {
  if (!content.startsWith(`${TOOL_MANIFEST_PROTOCOL}\n`)) return null;
  try {
    const parsed = JSON.parse(content.slice(TOOL_MANIFEST_PROTOCOL.length + 1)) as MeshToolManifest;
    return verifyMeshToolAttestation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function defaultLocalInvoker(
  toolName: string,
  args: Record<string, unknown>,
  signingCtx?: SigningContext
): Promise<unknown> {
  if (toolName === 'holomesh_invoke_tool') {
    throw new Error('holomesh_invoke_tool cannot recursively invoke itself');
  }
  const { handleTool } = await import('../handlers');
  return handleTool(toolName, args, signingCtx);
}

export async function invokePublishedMeshTool(
  manifest: MeshToolManifest,
  args: Record<string, unknown>,
  options: MeshToolInvokeOptions = {}
): Promise<unknown> {
  if (!verifyMeshToolAttestation(manifest)) {
    return {
      success: false,
      error: 'Manifest attestation failed verification',
      manifestId: manifest.id,
    };
  }
  if (!manifest.allowTransitiveInvocation) {
    return {
      success: false,
      error: 'Manifest does not allow transitive invocation',
      manifestId: manifest.id,
    };
  }
  const risk = getToolRiskLevel(manifest.endpoint.toolName);
  if (!options.allowHighRisk && (risk === 'high' || risk === 'critical')) {
    return {
      success: false,
      error: `Refusing ${risk} risk transitive invocation without allow_high_risk=true`,
      manifestId: manifest.id,
      risk,
    };
  }

  const route = {
    manifestId: manifest.id,
    toolName: manifest.endpoint.toolName,
    transport: manifest.endpoint.transport,
    risk,
    manifestHash: manifest.attestation.manifestHash,
  };
  if (options.dryRun) {
    return { success: true, dryRun: true, route };
  }

  if (manifest.endpoint.transport === 'local') {
    const invoker = options.localInvoker ?? defaultLocalInvoker;
    const result = await invoker(manifest.endpoint.toolName, args);
    return { success: true, route, result };
  }

  if (!manifest.endpoint.url) {
    return {
      success: false,
      error: 'mcp-http endpoint requires url',
      route,
    };
  }

  const response = await axios.post(
    manifest.endpoint.url,
    { name: manifest.endpoint.toolName, arguments: args },
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-holomesh-tool-manifest-hash': manifest.attestation.manifestHash,
        ...(manifest.endpoint.headers ?? {}),
      },
      timeout: 30000,
    }
  );
  return { success: true, route, result: response.data };
}

export async function handleMeshToolRegistryTool(
  name: string,
  args: Record<string, unknown>,
  allTools: Tool[],
  dispatch: (name: string, args: Record<string, unknown>) => Promise<unknown>
): Promise<unknown | null> {
  if (name === 'holomesh_publish_tool') {
    const manifest = buildMeshToolManifest(buildPublishArgs(args, allTools), readPublisher(args));
    const published = publishMeshToolManifest(manifest);
    return {
      success: true,
      tool: published,
      attestation: published.attestation,
    };
  }

  if (name === 'holomesh_invoke_tool') {
    const manifest = resolvePublishedTool(args);
    const incomingChain = readInvocationChain(args.provenance_chain ?? args.provenanceChain);
    const verification = verifyMeshToolInvocationChain(incomingChain);
    if (!verification.verified) {
      throw new Error(`Invalid provenance chain: ${verification.errors.join('; ')}`);
    }

    const toolArgs = readRecord(args.args) ?? {};
    const invocation = await invokePublishedMeshTool(manifest, toolArgs, {
      allowHighRisk: args.allow_high_risk === true || args.allowHighRisk === true,
      dryRun: args.dry_run === true || args.dryRun === true,
      localInvoker: dispatch,
    });
    const hop = createMeshToolInvocationHop(manifest, toolArgs, {
      callerAgentId: readOptionalString(args.caller_agent_id ?? args.callerAgentId)
        ?? process.env.HOLOMESH_AGENT_NAME
        ?? 'local-agent',
      invocationId: readOptionalString(args.invocation_id ?? args.invocationId)
        ?? crypto.randomUUID(),
      invokedAt: readOptionalString(args.invoked_at ?? args.invokedAt ?? args.timestamp)
        ?? new Date().toISOString(),
      previousHash: verification.lastHash,
    });
    const provenanceChain = [...incomingChain, hop];

    return {
      success: readRecord(invocation)?.success !== false,
      routedTo: {
        manifestId: manifest.id,
        toolName: manifest.endpoint.toolName,
        manifestHash: manifest.attestation.manifestHash,
        capabilityTags: manifest.capabilityTags,
      },
      invocation,
      attestation: {
        verified: true,
        chainLength: provenanceChain.length,
        argsHash: hop.argsHash,
        provenanceChain,
      },
    };
  }

  return null;
}

export const MESH_TOOL_MANIFEST_PROTOCOL = TOOL_MANIFEST_PROTOCOL;
export const MESH_TOOL_INVOCATION_PROTOCOL = TOOL_INVOCATION_PROTOCOL;

function buildPublishArgs(args: Record<string, unknown>, allTools: Tool[]): Record<string, unknown> {
  const name = readOptionalString(args.name ?? args.tool_name ?? args.toolName);
  if (!name) throw new Error('tool_name is required');
  if (name === 'holomesh_publish_tool' || name === 'holomesh_invoke_tool') {
    throw new Error(`Refusing to publish reserved mesh tool '${name}'`);
  }
  const tool = allTools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Unknown MCP tool '${name}'`);

  return {
    ...args,
    name,
    description: readOptionalString(args.description) ?? tool.description ?? `Mesh-published MCP tool ${name}`,
    input_schema: readRecord(args.input_schema ?? args.inputSchema) ?? tool.inputSchema,
    endpoint: args.endpoint ?? { transport: 'local', toolName: name },
    allow_transitive_invocation: args.allow_transitive_invocation !== false,
    capability_tags: [
      ...collectCapabilityTags(args.capability_tags),
      ...collectCapabilityTags(args.capabilityTags),
      ...collectCapabilityTags(args.capabilities),
      ...collectCapabilityTags(args.tags),
      'mesh-tool',
      name,
    ],
  };
}

function readPublisher(args: Record<string, unknown>): MeshToolPublisher {
  return {
    agentId: readOptionalString(args.publisher_agent_id ?? args.publisherAgentId)
      ?? process.env.HOLOMESH_AGENT_ID
      ?? process.env.HOLOMESH_AGENT_NAME
      ?? 'local-agent',
    name: readOptionalString(args.publisher_name ?? args.publisherName)
      ?? process.env.HOLOMESH_AGENT_NAME
      ?? 'local-agent',
  };
}

function resolvePublishedTool(args: Record<string, unknown>): MeshToolManifest {
  const manifestId = readOptionalString(args.mesh_tool_id ?? args.meshToolId ?? args.manifest_id);
  if (manifestId) {
    const manifest = registry.get(manifestId);
    if (!manifest) throw new Error(`No mesh-published tool '${manifestId}'`);
    return manifest;
  }

  const toolName = readOptionalString(args.tool_name ?? args.toolName);
  if (toolName) {
    const manifest = Array.from(registry.values()).find((entry) => entry.name === toolName);
    if (!manifest) throw new Error(`No mesh-published tool named '${toolName}'`);
    return manifest;
  }

  const query = args.capability_query ?? args.capabilityQuery ?? args.capability_tags ?? args.capabilityTags;
  if (!query) throw new Error('capability_query, mesh_tool_id, or tool_name is required');
  const [manifest] = discoverMeshTools(query, 1);
  if (!manifest) throw new Error('No mesh-published tool matched capability_query');
  return manifest;
}

function buildInvocationHop(input: {
  argsHash: string;
  callerAgentId: string;
  invocationId: string;
  invokedAt: string;
  manifest: MeshToolManifest;
  previousHash: string | null;
}): MeshToolInvocationHop {
  const payload: Omit<MeshToolInvocationHop, 'hopHash'> = {
    protocol: TOOL_INVOCATION_PROTOCOL,
    invocationId: input.invocationId,
    manifestId: input.manifest.id,
    toolName: input.manifest.endpoint.toolName,
    manifestHash: input.manifest.attestation.manifestHash,
    callerAgentId: input.callerAgentId,
    argsHash: input.argsHash,
    previousHash: input.previousHash,
    invokedAt: input.invokedAt,
  };
  return {
    ...payload,
    hopHash: hashInvocationBody(payload),
  };
}

function hashInvocationBody(body: Omit<MeshToolInvocationHop, 'hopHash'>): string {
  return crypto.createHash('sha256').update(stableJson(body)).digest('hex');
}

function readInvocationChain(value: unknown): MeshToolInvocationHop[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is MeshToolInvocationHop => Boolean(readRecord(item)));
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}
