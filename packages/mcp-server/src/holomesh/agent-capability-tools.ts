/**
 * HoloMesh agent capability and marketplace search MCP tools.
 *
 * These tools close the bridge between declarative `.hsplus` agent brains,
 * team formation, and marketplace-driven agent discovery.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { parseHoloPartial } from '@holoscript/core';
import axios from 'axios';
import { resolveSecretWithLease, VaultLeaseError } from './identity/vault-lease-registry';

type SourceKind = 'inline' | 'file';

interface BrainSource {
  kind: SourceKind;
  source: string;
  path?: string;
}

interface MarketplaceItem {
  id?: string;
  name?: string;
  slug?: string;
  description?: string;
  category?: string;
  tags?: string[];
  capabilities?: string[];
  tools?: string[];
  author?: string;
  version?: string;
  tier?: string;
  installs?: number;
  rating?: number;
  [key: string]: unknown;
}

interface MarketplaceSearchResult {
  item: MarketplaceItem;
  score: number;
  matched: string[];
}

interface MetadataToken {
  kind: 'identifier' | 'string' | 'symbol';
  value: string;
}

export interface AgentCapabilitySummary {
  compositionName?: string;
  identityName?: string;
  domain?: string;
  capabilityTags: string[];
  traits: string[];
  tools: string[];
  capabilities: string[];
  marketplaceTags: string[];
  counts: {
    capabilityTags: number;
    traits: number;
    tools: number;
    capabilities: number;
    marketplaceTags: number;
  };
}

const DEFAULT_MAX_BRAIN_BYTES = 512 * 1024;

export const agentCapabilityTools: Tool[] = [
  {
    name: 'holomesh_agent_capabilities',
    description:
      'Inspect a .hsplus agent brain and extract capability_tags, traits, declared tools, and capability block names for team formation and marketplace matching.',
    inputSchema: {
      type: 'object',
      properties: {
        brain_source: {
          type: 'string',
          description: 'Inline .hsplus source to inspect.',
        },
        brain_path: {
          type: 'string',
          description:
            'Optional local .hsplus path to inspect. Requires allow_file_read=true and is bounded by max_bytes.',
        },
        allow_file_read: {
          type: 'boolean',
          description: 'Set true to allow reading brain_path from local disk.',
        },
        agent_id: {
          type: 'string',
          description: 'Optional agent ID to include in the returned team-formation roster hint.',
        },
        agent_name: {
          type: 'string',
          description: 'Optional agent display name. Defaults to the composition or identity name.',
        },
        max_bytes: {
          type: 'number',
          description: `Maximum file bytes to read from brain_path. Default ${DEFAULT_MAX_BRAIN_BYTES}.`,
        },
      },
    },
  },
  {
    name: 'holomesh_marketplace_search',
    description:
      'Search agent marketplace templates by capability tags, declared tools, category, and text query. Can query the orchestrator marketplace or score an inline catalog locally.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Free-text query for template name, description, category, tags, or capabilities.',
        },
        capability_query: {
          type: 'string',
          description: 'Capability phrase used to rank templates, e.g. "webgpu compiler audit".',
        },
        capability_tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Required or preferred capability tags.',
        },
        tool_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Preferred MCP tool names exposed by a marketplace template.',
        },
        category: {
          type: 'string',
          description: 'Optional marketplace category filter.',
        },
        tier: {
          type: 'string',
          description: 'Optional tier filter passed to the marketplace service.',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return. Defaults to 10.',
        },
        include_remote: {
          type: 'boolean',
          description: 'When true (default), query the orchestrator marketplace search endpoint.',
        },
        marketplace_url: {
          type: 'string',
          description:
            'Override marketplace search URL. Defaults to HOLOMESH_MARKETPLACE_SEARCH_URL or MCP_ORCHESTRATOR_URL + /marketplace/search.',
        },
        items: {
          type: 'array',
          items: { type: 'object' },
          description: 'Optional inline marketplace catalog to score locally without network access.',
        },
      },
    },
  },
];

export async function handleAgentCapabilityTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'holomesh_agent_capabilities':
      return handleAgentCapabilities(args);
    case 'holomesh_marketplace_search':
      return handleMarketplaceSearch(args);
    default:
      return null;
  }
}

export function extractAgentCapabilities(source: string): AgentCapabilitySummary {
  const tokens = lexMetadataTokens(source);
  const compositionName = extractCompositionName(source, tokens);
  const identityName = extractFirstStringProperty(tokens, 'name');
  const domain = extractFirstStringProperty(tokens, 'domain');
  const capabilityTags = uniqueStrings([
    ...extractStringArrayProperty(tokens, 'capability_tags'),
    ...extractStringArrayProperty(tokens, 'capabilityTags'),
  ]);
  const traits = uniqueStrings([
    ...extractStringArrayBlock(tokens, 'traits'),
    ...extractDecoratorTraits(tokens),
  ]);
  const tools = uniqueStrings([
    ...extractStringArrayProperty(tokens, 'tools'),
    ...extractStringArrayProperty(tokens, 'mcp_tools'),
  ]);
  const capabilityNames = uniqueStrings([
    ...extractStringArrayProperty(tokens, 'capabilities'),
    ...extractCapabilityBlockNames(tokens),
  ]);
  const marketplaceTags = uniqueStrings([
    ...capabilityTags,
    ...traits,
    ...capabilityNames,
    ...tools.map((tool) => `tool:${tool}`),
  ]);

  return {
    compositionName,
    identityName,
    domain,
    capabilityTags,
    traits,
    tools,
    capabilities: capabilityNames,
    marketplaceTags,
    counts: {
      capabilityTags: capabilityTags.length,
      traits: traits.length,
      tools: tools.length,
      capabilities: capabilityNames.length,
      marketplaceTags: marketplaceTags.length,
    },
  };
}

function handleAgentCapabilities(args: Record<string, unknown>): Record<string, unknown> {
  const source = resolveBrainSource(args);
  if ('error' in source) return source;

  const extracted = extractAgentCapabilities(source.source);
  const compositionName =
    typeof extracted.compositionName === 'string' ? extracted.compositionName : undefined;
  const identityName =
    typeof extracted.identityName === 'string' ? extracted.identityName : undefined;
  const agentName =
    typeof args.agent_name === 'string' && args.agent_name.trim()
      ? args.agent_name.trim()
      : identityName || compositionName || 'unnamed-agent';
  const agentId =
    typeof args.agent_id === 'string' && args.agent_id.trim()
      ? args.agent_id.trim()
      : slugify(agentName);

  return {
    success: true,
    source: {
      kind: source.kind,
      path: source.path,
      bytes: Buffer.byteLength(source.source, 'utf8'),
    },
    agent: {
      id: agentId,
      name: agentName,
      compositionName,
      domain: extracted.domain,
    },
    ...extracted,
    teamFormationRosterHint: {
      agentId,
      agentName,
      capabilities: extracted.marketplaceTags,
      source: source.kind === 'file' ? source.path : 'inline',
    },
  };
}

async function handleMarketplaceSearch(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const limit = clampNumber(args.limit, 10, 1, 50);
  const includeRemote = args.include_remote !== false;
  const localItems = normalizeMarketplaceItems(args.items);
  const query = stringOrUndefined(args.query);
  const capabilityQuery = stringOrUndefined(args.capability_query);
  const capabilityTags = stringArray(args.capability_tags);
  const toolNames = stringArray(args.tool_names);
  const category = stringOrUndefined(args.category);
  const tier = stringOrUndefined(args.tier);

  let remoteItems: MarketplaceItem[] = [];
  let remoteError: string | undefined;
  let remoteUrl: string | undefined;

  if (includeRemote) {
    remoteUrl = resolveMarketplaceSearchUrl(args.marketplace_url);
    try {
      remoteItems = await fetchRemoteMarketplace(remoteUrl, {
        query,
        capabilityQuery,
        capabilityTags,
        toolNames,
        category,
        tier,
        limit,
      });
    } catch (err: unknown) {
      remoteError = err instanceof Error ? err.message : String(err);
    }
  }

  const merged = new Map<string, MarketplaceItem>();
  for (const item of [...localItems, ...remoteItems]) {
    merged.set(item.id || item.slug || item.name || JSON.stringify(item), item);
  }

  const scored = Array.from(merged.values())
    .map((item) =>
      scoreMarketplaceItem(item, {
        query,
        capabilityQuery,
        capabilityTags,
        toolNames,
        category,
      })
    )
    .filter((result) => result.score > 0 || hasNoSearchTerms(query, capabilityQuery, capabilityTags, toolNames, category))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0 && remoteError && localItems.length === 0) {
    return {
      success: false,
      error: 'Marketplace search failed and no local catalog items were supplied.',
      marketplaceUrl: remoteUrl,
      details: remoteError,
    };
  }

  return {
    success: true,
    marketplaceUrl: remoteUrl,
    query,
    capabilityQuery,
    capabilityTags,
    toolNames,
    category,
    totalCandidates: merged.size,
    count: scored.length,
    results: scored,
    ...(remoteError ? { remoteError } : {}),
  };
}

function resolveBrainSource(
  args: Record<string, unknown>
): BrainSource | { error: string; [key: string]: unknown } {
  const inline = stringOrUndefined(args.brain_source);
  if (inline) {
    return { kind: 'inline', source: inline };
  }

  const brainPath = stringOrUndefined(args.brain_path);
  if (!brainPath) {
    return { error: 'brain_source or brain_path is required.' };
  }
  if (args.allow_file_read !== true) {
    return { error: 'brain_path requires allow_file_read=true.' };
  }

  try {
    const resolved = path.resolve(brainPath);
    const maxBytes = clampNumber(args.max_bytes, DEFAULT_MAX_BRAIN_BYTES, 1, 5 * 1024 * 1024);
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return { error: `brain_path is not a file: ${resolved}` };
    }
    if (stat.size > maxBytes) {
      return {
        error: `brain_path is ${stat.size} bytes, above max_bytes ${maxBytes}.`,
      };
    }

    return {
      kind: 'file',
      path: resolved,
      source: fs.readFileSync(resolved, 'utf8'),
    };
  } catch (err: unknown) {
    return {
      error: `Failed to read brain_path: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function resolveMarketplaceSearchUrl(value: unknown): string {
  const override = stringOrUndefined(value);
  if (override) return override;
  if (process.env.HOLOMESH_MARKETPLACE_SEARCH_URL) {
    return process.env.HOLOMESH_MARKETPLACE_SEARCH_URL;
  }
  const orchestratorUrl = process.env.MCP_ORCHESTRATOR_URL || 'http://localhost:4555';
  return `${orchestratorUrl.replace(/\/$/, '')}/marketplace/search`;
}

function readMarketplaceApiKey(): string {
  const tryRead = (ref: string): string => {
    try {
      return resolveSecretWithLease(ref) ?? '';
    } catch (err) {
      if (err instanceof VaultLeaseError) return '';
      throw err;
    }
  };
  return tryRead('env:HOLOSCRIPT_API_KEY') || tryRead('env:MCPME_API_KEY');
}

async function fetchRemoteMarketplace(
  url: string,
  options: {
    query?: string;
    capabilityQuery?: string;
    capabilityTags: string[];
    toolNames: string[];
    category?: string;
    tier?: string;
    limit: number;
  }
): Promise<MarketplaceItem[]> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const apiKey = readMarketplaceApiKey();
  if (apiKey) headers['x-mcp-api-key'] = apiKey;

  const params: Record<string, string> = {};
  const q = options.query || options.capabilityQuery;
  if (q) params.q = q;
  if (options.category) params.category = options.category;
  if (options.tier) params.tier = options.tier;
  if (options.capabilityTags.length > 0) params.capabilities = options.capabilityTags.join(',');
  if (options.toolNames.length > 0) params.tools = options.toolNames.join(',');
  params.limit = String(options.limit);

  const response = await axios.get(url, {
    headers,
    params,
    timeout: 12000,
  });

  return normalizeMarketplaceItems(response.data);
}

function normalizeMarketplaceItems(value: unknown): MarketplaceItem[] {
  if (Array.isArray(value)) return value.filter(isRecord).map((item) => normalizeMarketplaceItem(item));
  if (!isRecord(value)) return [];

  for (const key of ['templates', 'results', 'items', 'data']) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      return nested.filter(isRecord).map((item) => normalizeMarketplaceItem(item));
    }
    if (isRecord(nested)) {
      const fromNested = normalizeMarketplaceItems(nested);
      if (fromNested.length > 0) return fromNested;
    }
  }

  return [normalizeMarketplaceItem(value)];
}

function normalizeMarketplaceItem(item: Record<string, unknown>): MarketplaceItem {
  return {
    ...item,
    id: stringOrUndefined(item.id),
    name: stringOrUndefined(item.name),
    slug: stringOrUndefined(item.slug),
    description: stringOrUndefined(item.description),
    category: stringOrUndefined(item.category),
    tags: stringArray(item.tags),
    capabilities: uniqueStrings([
      ...stringArray(item.capabilities),
      ...stringArray(item.capability_tags),
      ...stringArray(item.capabilityTags),
    ]),
    tools: uniqueStrings([...stringArray(item.tools), ...stringArray(item.tool_names)]),
    author: stringOrUndefined(item.author),
    version: stringOrUndefined(item.version),
    tier: stringOrUndefined(item.tier),
  };
}

function scoreMarketplaceItem(
  item: MarketplaceItem,
  options: {
    query?: string;
    capabilityQuery?: string;
    capabilityTags: string[];
    toolNames: string[];
    category?: string;
  }
): MarketplaceSearchResult {
  const matched: string[] = [];
  let score = 0;
  const haystackFields = [
    item.name,
    item.slug,
    item.description,
    item.category,
    item.author,
    ...(item.tags || []),
    ...(item.capabilities || []),
    ...(item.tools || []),
  ].map((value) => normalizeToken(value || ''));
  const haystack = haystackFields.join(' ');

  for (const term of tokenize(`${options.query || ''} ${options.capabilityQuery || ''}`)) {
    if (haystack.includes(term)) {
      score += 2;
      matched.push(term);
    }
  }

  for (const tag of options.capabilityTags.map(normalizeToken).filter(Boolean)) {
    if ((item.capabilities || []).map(normalizeToken).includes(tag)) {
      score += 5;
      matched.push(`capability:${tag}`);
    } else if ((item.tags || []).map(normalizeToken).includes(tag) || haystack.includes(tag)) {
      score += 3;
      matched.push(`tag:${tag}`);
    }
  }

  for (const toolName of options.toolNames.map(normalizeToken).filter(Boolean)) {
    if ((item.tools || []).map(normalizeToken).includes(toolName)) {
      score += 4;
      matched.push(`tool:${toolName}`);
    }
  }

  if (options.category && normalizeToken(item.category || '') === normalizeToken(options.category)) {
    score += 4;
    matched.push(`category:${normalizeToken(options.category)}`);
  }

  if (typeof item.rating === 'number' && item.rating > 0) score += Math.min(item.rating, 5) / 10;
  if (typeof item.installs === 'number' && item.installs > 0) score += Math.min(item.installs, 1000) / 1000;

  return {
    item,
    score: Number(score.toFixed(3)),
    matched: uniqueStrings(matched),
  };
}

function extractCompositionName(source: string, tokens: MetadataToken[]): string | undefined {
  try {
    return parseHoloPartial(source).ast?.name || extractCompositionNameFromTokens(tokens);
  } catch {
    return extractCompositionNameFromTokens(tokens);
  }
}

function extractCompositionNameFromTokens(tokens: MetadataToken[]): string | undefined {
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (isIdentifier(tokens[index], 'composition')) {
      const next = tokens[index + 1];
      if (next?.kind === 'string' || next?.kind === 'identifier') return next.value;
    }
  }
  return undefined;
}

function extractFirstStringProperty(tokens: MetadataToken[], property: string): string | undefined {
  for (let index = 0; index < tokens.length - 2; index += 1) {
    if (
      isIdentifier(tokens[index], property) &&
      isSymbol(tokens[index + 1], ':') &&
      tokens[index + 2]?.kind === 'string'
    ) {
      return tokens[index + 2].value;
    }
  }
  return undefined;
}

function extractStringArrayProperty(tokens: MetadataToken[], property: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < tokens.length - 2; index += 1) {
    if (
      isIdentifier(tokens[index], property) &&
      isSymbol(tokens[index + 1], ':') &&
      isSymbol(tokens[index + 2], '[')
    ) {
      values.push(...collectStringsUntilBalanced(tokens, index + 2, '[', ']'));
    }
  }
  return uniqueStrings(values);
}

function extractStringArrayBlock(tokens: MetadataToken[], keyword: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (isIdentifier(tokens[index], keyword) && isSymbol(tokens[index + 1], '[')) {
      values.push(...collectStringsUntilBalanced(tokens, index + 1, '[', ']'));
    }
  }
  return uniqueStrings(values);
}

function extractDecoratorTraits(tokens: MetadataToken[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (!isSymbol(tokens[index], '@')) continue;
    const name = tokens[index + 1];
    if (name?.kind !== 'identifier') continue;

    values.push(name.value);
    if (isSymbol(tokens[index + 2], ':') && tokens[index + 3]?.kind === 'string') {
      values.push(tokens[index + 3].value);
    }
    if (isSymbol(tokens[index + 2], '(')) {
      values.push(...collectStringsUntilBalanced(tokens, index + 2, '(', ')'));
    }
  }

  return uniqueStrings(values);
}

function extractCapabilityBlockNames(tokens: MetadataToken[]): string[] {
  const names: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (!isIdentifier(tokens[index], 'capabilities') || !isSymbol(tokens[index + 1], '{')) {
      continue;
    }
    let depth = 0;
    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      const token = tokens[cursor];
      if (isSymbol(token, '{')) {
        depth += 1;
        continue;
      }
      if (isSymbol(token, '}')) {
        depth -= 1;
        if (depth === 0) break;
        continue;
      }
      if (depth === 1 && token.kind === 'identifier' && isSymbol(tokens[cursor + 1], ':')) {
        names.push(token.value);
      }
    }
  }
  return uniqueStrings(names);
}

function lexMetadataTokens(source: string): MetadataToken[] {
  const tokens: MetadataToken[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (!char) break;
    if (isWhitespace(char)) {
      index += 1;
      continue;
    }
    if (char === '/' && next === '/') {
      index = skipLineComment(source, index + 2);
      continue;
    }
    if (char === '/' && next === '*') {
      index = skipBlockComment(source, index + 2);
      continue;
    }
    if (char === '"' || char === "'") {
      const read = readStringToken(source, index, char);
      tokens.push({ kind: 'string', value: read.value });
      index = read.nextIndex;
      continue;
    }
    if (isIdentifierStart(char)) {
      const start = index;
      index += 1;
      while (index < source.length && isIdentifierPart(source[index])) index += 1;
      tokens.push({ kind: 'identifier', value: source.slice(start, index) });
      continue;
    }
    if ('{}[]():,@'.includes(char)) {
      tokens.push({ kind: 'symbol', value: char });
    }
    index += 1;
  }

  return tokens;
}

function collectStringsUntilBalanced(
  tokens: MetadataToken[],
  openIndex: number,
  open: '[' | '(',
  close: ']' | ')'
): string[] {
  const values: string[] = [];
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (isSymbol(token, open)) {
      depth += 1;
      continue;
    }
    if (isSymbol(token, close)) {
      depth -= 1;
      if (depth === 0) break;
      continue;
    }
    if (depth > 0 && token.kind === 'string') {
      values.push(token.value);
    }
  }
  return uniqueStrings(values);
}

function readStringToken(
  source: string,
  start: number,
  quote: '"' | "'"
): { value: string; nextIndex: number } {
  let value = '';
  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      value += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === quote) {
      return { value, nextIndex: index + 1 };
    }
    value += char;
  }
  return { value, nextIndex: source.length };
}

function skipLineComment(source: string, start: number): number {
  const newline = source.indexOf('\n', start);
  return newline === -1 ? source.length : newline + 1;
}

function skipBlockComment(source: string, start: number): number {
  const end = source.indexOf('*/', start);
  return end === -1 ? source.length : end + 2;
}

function isIdentifier(token: MetadataToken | undefined, value: string): boolean {
  return token?.kind === 'identifier' && token.value === value;
}

function isSymbol(token: MetadataToken | undefined, value: string): boolean {
  return token?.kind === 'symbol' && token.value === value;
}

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_#]/.test(char);
}

function isIdentifierPart(char: string | undefined): boolean {
  return Boolean(char && /[A-Za-z0-9_.#-]/.test(char));
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, '').replace(/_/g, '-');
}

function tokenize(value: string): string[] {
  return uniqueStrings(
    value
      .split(/[^A-Za-z0-9_.:-]+/)
      .map(normalizeToken)
      .filter((token) => token.length > 0)
  );
}

function uniqueStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.filter((item): item is string => typeof item === 'string'));
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function hasNoSearchTerms(
  query: string | undefined,
  capabilityQuery: string | undefined,
  capabilityTags: string[],
  toolNames: string[],
  category: string | undefined
): boolean {
  return !query && !capabilityQuery && capabilityTags.length === 0 && toolNames.length === 0 && !category;
}
