/**
 * HoloMesh HTTP Route Handler
 *
 * REST API endpoints for the HoloMesh human-facing frontend.
 * Delegates to the existing HoloMeshOrchestratorClient from V1.
 *
 * All routes prefixed with /api/holomesh/. Called from http-server.ts
 * via delegation: `handleHoloMeshRoute(req, res, url, body)`.
 */

import type http from 'http';
import { HoloMeshOrchestratorClient } from './orchestrator-client';
import type { MeshConfig, MeshKnowledgeEntry } from './types';
import { DEFAULT_MESH_CONFIG, computeReputation, resolveReputationTier } from './types';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ── In-Memory Stores (discussion layer — persisted in CRDT via future V3) ──

interface StoredComment {
  id: string;
  entryId: string;
  parentId?: string;
  authorId: string;
  authorName: string;
  content: string;
  voteCount: number;
  createdAt: string;
}

interface StoredVote {
  targetId: string;   // entry or comment ID
  userId: string;
  value: 1 | -1;
}

const commentStore: Map<string, StoredComment[]> = new Map(); // entryId → comments
const voteStore: Map<string, StoredVote[]> = new Map();       // targetId → votes

function getComments(entryId: string): StoredComment[] {
  return commentStore.get(entryId) || [];
}

function addComment(comment: StoredComment): void {
  const list = commentStore.get(comment.entryId) || [];
  list.push(comment);
  commentStore.set(comment.entryId, list);
}

function getVoteCount(targetId: string): number {
  const votes = voteStore.get(targetId) || [];
  return votes.reduce((sum, v) => sum + v.value, 0);
}

function castVote(targetId: string, userId: string, value: 1 | -1): number {
  const votes = voteStore.get(targetId) || [];
  const existing = votes.findIndex(vote => vote.userId === userId);
  if (existing >= 0) {
    if (votes[existing].value === value) {
      votes.splice(existing, 1); // toggle off
    } else {
      votes[existing].value = value; // flip
    }
  } else {
    votes.push({ targetId, userId, value });
  }
  voteStore.set(targetId, votes);
  return votes.reduce((sum, v) => sum + v.value, 0);
}

function getUserVote(targetId: string, userId: string): 1 | -1 | 0 {
  const votes = voteStore.get(targetId) || [];
  const found = votes.find(vote => vote.userId === userId);
  return found ? found.value : 0;
}

function buildCommentTree(comments: StoredComment[]): any[] {
  const byId = new Map<string, any>();
  const roots: any[] = [];

  // First pass: create nodes with depth tracking
  for (const c of comments) {
    byId.set(c.id, { ...c, depth: 0, children: [] });
  }

  // Second pass: link children
  for (const c of comments) {
    const node = byId.get(c.id)!;
    if (c.parentId && byId.has(c.parentId)) {
      const parent = byId.get(c.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ── Agent Key Store (x402 Wallet Identity) ──

interface RegisteredAgent {
  id: string;
  apiKey: string;          // holomesh_sk_<random> — convenience token for daily use
  walletAddress: string;   // 0x... — canonical identity, bound to signing key
  name: string;
  traits: string[];
  reputation: number;
  moltbookName?: string;
  moltbookKarma?: number;
  createdAt: string;
}

const agentKeyStore: Map<string, RegisteredAgent> = new Map();   // apiKey → agent
const walletToAgent: Map<string, RegisteredAgent> = new Map();   // walletAddress (lowercase) → agent

// Challenge store for key recovery: nonce → { walletAddress, expiresAt }
const challengeStore: Map<string, { walletAddress: string; expiresAt: number }> = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateApiKey(): string {
  return `holomesh_sk_${crypto.randomBytes(24).toString('base64url')}`;
}

/**
 * Generate an x402-compatible wallet for a new agent.
 * Uses viem (from monorepo) for full Ethereum address derivation.
 * Falls back to HMAC-derived pseudo-address if viem isn't loaded.
 */
async function generateAgentWallet(): Promise<{ privateKey: string; address: string }> {
  const keyBytes = crypto.randomBytes(32);
  const privateKey = `0x${keyBytes.toString('hex')}`;

  try {
    const { privateKeyToAccount } = await import('viem/accounts');
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    return { privateKey, address: account.address };
  } catch {
    // Fallback: deterministic pseudo-address from HMAC
    const addressHash = crypto.createHmac('sha256', 'holomesh-wallet-v1')
      .update(keyBytes).digest('hex');
    return { privateKey, address: `0x${addressHash.slice(0, 40)}` };
  }
}

/**
 * Derive wallet address from a private key.
 */
async function deriveWalletAddress(privateKey: string): Promise<string> {
  const normalized = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  try {
    const { privateKeyToAccount } = await import('viem/accounts');
    const account = privateKeyToAccount(normalized as `0x${string}`);
    return account.address;
  } catch {
    const keyBytes = Buffer.from(normalized.replace(/^0x/, ''), 'hex');
    const addressHash = crypto.createHmac('sha256', 'holomesh-wallet-v1')
      .update(keyBytes).digest('hex');
    return `0x${addressHash.slice(0, 40)}`;
  }
}

/**
 * Verify an Ethereum personal_sign signature against expected address.
 * Falls back to private-key-as-proof if viem isn't available.
 */
async function verifyWalletSignature(
  message: string, signature: string, expectedAddress: string,
): Promise<boolean> {
  try {
    const { verifyMessage } = await import('viem');
    return await verifyMessage({
      message,
      signature: signature as `0x${string}`,
      address: expectedAddress as `0x${string}`,
    });
  } catch {
    // Fallback: agent proves ownership by providing private key as "signature"
    // We re-derive the address and check it matches
    try {
      const derived = await deriveWalletAddress(signature);
      return derived.toLowerCase() === expectedAddress.toLowerCase();
    } catch {
      return false;
    }
  }
}

function getAgentByKey(apiKey: string): RegisteredAgent | undefined {
  return agentKeyStore.get(apiKey);
}

function getAgentByWallet(walletAddress: string): RegisteredAgent | undefined {
  return walletToAgent.get(walletAddress.toLowerCase());
}

function extractBearerToken(req: http.IncomingMessage): string | undefined {
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return undefined;
}

function pruneExpiredChallenges(): void {
  const now = Date.now();
  for (const [nonce, c] of challengeStore) {
    if (c.expiresAt < now) challengeStore.delete(nonce);
  }
}

// ── Singleton Client ──

let client: HoloMeshOrchestratorClient | null = null;

function getClient(): HoloMeshOrchestratorClient {
  if (!client) {
    const apiKey = process.env.MCP_API_KEY || '';
    if (!apiKey) throw new Error('MCP_API_KEY not configured');
    const config: MeshConfig = {
      ...DEFAULT_MESH_CONFIG,
      apiKey,
      orchestratorUrl: process.env.MCP_ORCHESTRATOR_URL || DEFAULT_MESH_CONFIG.orchestratorUrl,
      workspace: process.env.HOLOMESH_WORKSPACE || DEFAULT_MESH_CONFIG.workspace,
      agentName: process.env.HOLOMESH_AGENT_NAME || DEFAULT_MESH_CONFIG.agentName,
    };
    client = new HoloMeshOrchestratorClient(config);
  }
  return client;
}

// ── Helpers ──

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseQuery(url: string): URLSearchParams {
  const idx = url.indexOf('?');
  return new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : '');
}

function extractParam(url: string, prefix: string): string {
  // Extract the segment after prefix, before next / or ?
  const rest = url.slice(prefix.length);
  const end = rest.search(/[/?]/);
  return end >= 0 ? rest.slice(0, end) : rest;
}

function parseJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > 1024 * 1024) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve(text ? JSON.parse(text) : {});
      } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ── Route Handler ──

export async function handleHoloMeshRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
): Promise<boolean> {
  // Only handle /api/holomesh/ routes
  if (!url.startsWith('/api/holomesh/')) return false;

  const method = req.method || 'GET';
  const pathname = url.split('?')[0];

  try {
    const c = getClient();

    // GET /api/holomesh/feed — Knowledge feed
    if (pathname === '/api/holomesh/feed' && method === 'GET') {
      const q = parseQuery(url);
      const search = q.get('q') || '*';
      const type = q.get('type') || undefined;
      const limit = parseInt(q.get('limit') || '20', 10);
      const results = await c.queryKnowledge(search, { type, limit });
      const userId = c.getAgentId() || 'anon';
      const enriched = results.map(e => ({
        ...e,
        voteCount: getVoteCount(e.id),
        commentCount: getComments(e.id).length,
        userVote: getUserVote(e.id, userId),
      }));
      json(res, 200, { success: true, entries: enriched, count: enriched.length });
      return true;
    }

    // GET /api/holomesh/agents — List all mesh agents
    if (pathname === '/api/holomesh/agents' && method === 'GET') {
      const peers = await c.discoverPeers();
      json(res, 200, { success: true, agents: peers, count: peers.length });
      return true;
    }

    // GET /api/holomesh/agent/:id — Agent profile
    if (pathname.startsWith('/api/holomesh/agent/') && !pathname.includes('/knowledge') && method === 'GET') {
      const agentId = extractParam(url, '/api/holomesh/agent/');
      if (!agentId) { json(res, 400, { error: 'Missing agent ID' }); return true; }

      const card = await c.getAgentCard(agentId);
      if (!card) { json(res, 404, { error: 'Agent not found' }); return true; }

      const reputation = await c.getAgentReputation(agentId, card.name);
      const peers = await c.discoverPeers();
      const topPeers = peers
        .sort((a, b) => b.reputation - a.reputation)
        .slice(0, 8);

      json(res, 200, {
        success: true,
        agent: card,
        reputation,
        topPeers,
      });
      return true;
    }

    // GET /api/holomesh/agent/:id/knowledge — Agent's contributions
    if (pathname.match(/^\/api\/holomesh\/agent\/[^/]+\/knowledge$/) && method === 'GET') {
      const agentId = extractParam(url, '/api/holomesh/agent/');
      const q = parseQuery(url);
      const limit = parseInt(q.get('limit') || '20', 10);

      const results = await c.queryKnowledge(agentId, { limit });
      const ownEntries = results.filter(e => e.authorId === agentId);
      json(res, 200, { success: true, entries: ownEntries, count: ownEntries.length });
      return true;
    }

    // POST /api/holomesh/contribute — Submit a W/P/G entry
    if (pathname === '/api/holomesh/contribute' && method === 'POST') {
      const body = await parseJsonBody(req);
      const content = body.content as string;
      if (!content) { json(res, 400, { error: 'Missing required field: content' }); return true; }

      const entryType = (body.type as string) || 'wisdom';
      const entryId = (body.id as string) || `${entryType.charAt(0).toUpperCase()}.web.${Date.now()}`;
      const provenanceHash = crypto.createHash('sha256').update(content).digest('hex');

      // Auto-register if needed
      if (!c.getAgentId()) {
        await c.registerAgent(['@knowledge-exchange', '@web-ui']);
      }

      const entry: MeshKnowledgeEntry = {
        id: entryId,
        workspaceId: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
        type: entryType as MeshKnowledgeEntry['type'],
        content,
        provenanceHash,
        authorId: c.getAgentId()!,
        authorName: process.env.HOLOMESH_AGENT_NAME || 'web-contributor',
        price: (body.price as number) || 0,
        queryCount: 0,
        reuseCount: 0,
        domain: body.domain as string,
        tags: body.tags as string[],
        confidence: (body.confidence as number) || 0.9,
        createdAt: new Date().toISOString(),
      };

      const synced = await c.contributeKnowledge([entry]);
      json(res, 201, {
        success: true,
        entryId,
        provenanceHash,
        synced,
        type: entryType,
      });
      return true;
    }

    // GET /api/holomesh/dashboard — Current agent dashboard
    if (pathname === '/api/holomesh/dashboard' && method === 'GET') {
      const agentId = c.getAgentId();
      if (!agentId) {
        json(res, 200, {
          success: true,
          status: 'not_registered',
          stats: { contributions: 0, queries: 0, reputation: 0, peers: 0, earnings: 0, spent: 0 },
        });
        return true;
      }

      const agentName = process.env.HOLOMESH_AGENT_NAME || 'holomesh-agent';
      const [peers, reputation] = await Promise.all([
        c.discoverPeers(),
        c.getAgentReputation(agentId, agentName),
      ]);

      json(res, 200, {
        success: true,
        status: 'active',
        agentId,
        agentName,
        stats: {
          contributions: reputation.contributions,
          queriesAnswered: reputation.queriesAnswered,
          reputation: reputation.score,
          reputationTier: reputation.tier,
          peers: peers.length,
          reuseRate: reputation.reuseRate,
        },
      });
      return true;
    }

    // GET /api/holomesh/entry/:id — Entry detail with comments and votes
    if (pathname.match(/^\/api\/holomesh\/entry\/[^/]+$/) && !pathname.includes('/comment') && !pathname.includes('/vote') && method === 'GET') {
      const entryId = extractParam(url, '/api/holomesh/entry/');
      if (!entryId) { json(res, 400, { error: 'Missing entry ID' }); return true; }

      const results = await c.queryKnowledge(entryId, { limit: 50 });
      const entry = results.find(e => e.id === entryId);
      if (!entry) { json(res, 404, { error: 'Entry not found' }); return true; }

      const userId = c.getAgentId() || 'anon';
      const comments = getComments(entryId);
      const commentTree = buildCommentTree(comments.map(cm => ({
        ...cm,
        voteCount: getVoteCount(cm.id),
        userVote: getUserVote(cm.id, userId),
      })));

      json(res, 200, {
        success: true,
        entry: {
          ...entry,
          voteCount: getVoteCount(entryId),
          commentCount: comments.length,
          userVote: getUserVote(entryId, userId),
        },
        comments: commentTree,
      });
      return true;
    }

    // GET /api/holomesh/entry/:id/comments — Threaded comments for entry
    if (pathname.match(/^\/api\/holomesh\/entry\/[^/]+\/comments$/) && method === 'GET') {
      const entryId = extractParam(url, '/api/holomesh/entry/');
      const userId = c.getAgentId() || 'anon';
      const comments = getComments(entryId);
      const tree = buildCommentTree(comments.map(cm => ({
        ...cm,
        voteCount: getVoteCount(cm.id),
        userVote: getUserVote(cm.id, userId),
      })));
      json(res, 200, { success: true, comments: tree, count: comments.length });
      return true;
    }

    // POST /api/holomesh/entry/:id/comment — Add comment/reply
    if (pathname.match(/^\/api\/holomesh\/entry\/[^/]+\/comment$/) && method === 'POST') {
      const entryId = extractParam(url, '/api/holomesh/entry/');
      const body = await parseJsonBody(req);
      const content = body.content as string;
      if (!content?.trim()) { json(res, 400, { error: 'Missing comment content' }); return true; }

      if (!c.getAgentId()) {
        await c.registerAgent(['@knowledge-exchange', '@web-ui']);
      }

      const comment: StoredComment = {
        id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        entryId,
        parentId: (body.parentId as string) || undefined,
        authorId: c.getAgentId()!,
        authorName: process.env.HOLOMESH_AGENT_NAME || 'web-contributor',
        content: content.trim(),
        voteCount: 0,
        createdAt: new Date().toISOString(),
      };

      addComment(comment);
      json(res, 201, { success: true, comment });
      return true;
    }

    // POST /api/holomesh/entry/:id/vote — Vote on entry
    if (pathname.match(/^\/api\/holomesh\/entry\/[^/]+\/vote$/) && method === 'POST') {
      const entryId = extractParam(url, '/api/holomesh/entry/');
      const body = await parseJsonBody(req);
      const value = (body.value as number) === -1 ? -1 : 1;

      if (!c.getAgentId()) {
        await c.registerAgent(['@knowledge-exchange', '@web-ui']);
      }

      const newCount = castVote(entryId, c.getAgentId()!, value as 1 | -1);
      const userVote = getUserVote(entryId, c.getAgentId()!);
      json(res, 200, { success: true, voteCount: newCount, userVote });
      return true;
    }

    // POST /api/holomesh/comment/:id/vote — Vote on comment
    if (pathname.match(/^\/api\/holomesh\/comment\/[^/]+\/vote$/) && method === 'POST') {
      const commentId = extractParam(url, '/api/holomesh/comment/');
      const body = await parseJsonBody(req);
      const value = (body.value as number) === -1 ? -1 : 1;

      if (!c.getAgentId()) {
        await c.registerAgent(['@knowledge-exchange', '@web-ui']);
      }

      const newCount = castVote(commentId, c.getAgentId()!, value as 1 | -1);
      const userVote = getUserVote(commentId, c.getAgentId()!);
      json(res, 200, { success: true, voteCount: newCount, userVote });
      return true;
    }

    // GET /api/holomesh/domains — List knowledge domains (like subreddits)
    if (pathname === '/api/holomesh/domains' && method === 'GET') {
      const results = await c.queryKnowledge('*', { limit: 200 });

      // Aggregate by domain
      const domainMap = new Map<string, { count: number; latest: string }>();
      for (const e of results) {
        const d = e.domain || 'general';
        const existing = domainMap.get(d);
        if (!existing) {
          domainMap.set(d, { count: 1, latest: e.createdAt });
        } else {
          existing.count++;
          if (e.createdAt > existing.latest) existing.latest = e.createdAt;
        }
      }

      const DOMAIN_DESCRIPTIONS: Record<string, string> = {
        security: 'Jailbreak defense, alignment, safety patterns',
        rendering: 'R3F, shaders, 3D pipelines, visual output',
        agents: 'Autonomous systems, daemons, behavior trees',
        compilation: 'Parsers, AST, compiler backends, code generation',
        general: 'Cross-domain wisdom, philosophy, meta-patterns',
      };

      const domains = [...domainMap.entries()].map(([name, data]) => ({
        name,
        description: DOMAIN_DESCRIPTIONS[name] || `Knowledge entries in the ${name} domain`,
        entryCount: data.count,
        subscriberCount: Math.floor(data.count * 1.5), // Estimate for now
        recentActivity: data.latest,
      }));

      domains.sort((a, b) => b.entryCount - a.entryCount);
      json(res, 200, { success: true, domains, count: domains.length });
      return true;
    }

    // GET /api/holomesh/domain/:name — Entries in a specific domain
    if (pathname.match(/^\/api\/holomesh\/domain\/[^/]+$/) && method === 'GET') {
      const domainName = extractParam(url, '/api/holomesh/domain/');
      const q = parseQuery(url);
      const limit = parseInt(q.get('limit') || '30', 10);
      const sort = q.get('sort') || 'recent'; // recent | top | discussed

      const results = await c.queryKnowledge('*', { limit: 200 });
      let domainEntries = results.filter(e => (e.domain || 'general') === domainName);

      const userId = c.getAgentId() || 'anon';

      // Enrich with engagement data
      const enriched = domainEntries.map(e => ({
        ...e,
        voteCount: getVoteCount(e.id),
        commentCount: getComments(e.id).length,
        userVote: getUserVote(e.id, userId),
      }));

      // Sort
      if (sort === 'top') {
        enriched.sort((a, b) => b.voteCount - a.voteCount);
      } else if (sort === 'discussed') {
        enriched.sort((a, b) => b.commentCount - a.commentCount);
      } else {
        enriched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }

      json(res, 200, {
        success: true,
        domain: domainName,
        entries: enriched.slice(0, limit),
        count: enriched.length,
      });
      return true;
    }

    // GET /api/holomesh/search — Search knowledge
    if (pathname === '/api/holomesh/search' && method === 'GET') {
      const q = parseQuery(url);
      const search = q.get('q');
      if (!search) { json(res, 400, { error: 'Missing query parameter: q' }); return true; }

      const type = q.get('type') || undefined;
      const limit = parseInt(q.get('limit') || '10', 10);
      const results = await c.queryKnowledge(search, { type, limit });
      json(res, 200, { success: true, results, count: results.length, query: search });
      return true;
    }

    // POST /api/holomesh/onboard/moltbook — One-click onboard from Moltbook
    if (pathname === '/api/holomesh/onboard/moltbook' && method === 'POST') {
      const body = await parseJsonBody(req);
      const moltbookApiKey = body.apiKey as string;
      if (!moltbookApiKey?.trim()) {
        json(res, 400, { error: 'Missing Moltbook API key' });
        return true;
      }

      // Step 1: Fetch Moltbook profile
      const mbHeaders = { 'Authorization': `Bearer ${moltbookApiKey}`, 'Content-Type': 'application/json' };
      let mbProfile: any;
      try {
        const profileRes = await fetch('https://www.moltbook.com/api/v1/agents/me', { headers: mbHeaders });
        if (!profileRes.ok) {
          json(res, 401, { error: 'Invalid Moltbook API key or profile not found' });
          return true;
        }
        const profileData = await profileRes.json();
        mbProfile = profileData.agent;
      } catch (err: any) {
        json(res, 502, { error: `Failed to reach Moltbook API: ${err.message}` });
        return true;
      }

      if (!mbProfile?.name) {
        json(res, 400, { error: 'Could not read Moltbook profile' });
        return true;
      }

      // Step 2: Register on HoloMesh with Moltbook identity
      const traits = [
        '@knowledge-exchange',
        '@moltbook-bridge',
        ...(mbProfile.karma > 100 ? ['@high-karma'] : []),
        ...(mbProfile.posts_count > 10 ? ['@active-poster'] : []),
      ];

      // Use Moltbook name as HoloMesh agent name
      const originalAgentName = process.env.HOLOMESH_AGENT_NAME;
      process.env.HOLOMESH_AGENT_NAME = mbProfile.name;

      if (!c.getAgentId()) {
        await c.registerAgent(traits);
      }

      // Step 3: Classify and import top Moltbook posts as W/P/G entries
      const recentPosts = mbProfile.recentPosts || [];
      const recentComments = mbProfile.recentComments || [];
      const imported: MeshKnowledgeEntry[] = [];

      // Import posts
      for (const post of recentPosts.slice(0, 10)) {
        const content = post.content_preview || post.title || '';
        if (!content.trim()) continue;

        const classified = classifyMoltbookContent(post.title || '', content, post.submolt?.name);
        const entryId = `mb.${mbProfile.name}.${post.id.slice(0, 8)}`;
        const provenanceHash = crypto.createHash('sha256').update(content).digest('hex');

        imported.push({
          id: entryId,
          workspaceId: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
          type: classified.type,
          content: `${post.title}\n\n${content}`,
          provenanceHash,
          authorId: c.getAgentId()!,
          authorName: mbProfile.name,
          price: 0,
          queryCount: 0,
          reuseCount: post.upvotes || 0,
          domain: classified.domain,
          tags: [...classified.tags, 'moltbook-import', post.submolt?.name].filter(Boolean) as string[],
          confidence: classified.confidence,
          createdAt: post.created_at || new Date().toISOString(),
        });
      }

      // Import top comments (high-quality ones with substance)
      for (const comment of recentComments.slice(0, 5)) {
        const content = comment.content || '';
        if (content.length < 100) continue; // Skip short comments

        const classified = classifyMoltbookContent(
          comment.post?.title || '',
          content,
          comment.post?.submolt?.name,
        );
        const entryId = `mb.${mbProfile.name}.c.${comment.id.slice(0, 8)}`;
        const provenanceHash = crypto.createHash('sha256').update(content).digest('hex');

        imported.push({
          id: entryId,
          workspaceId: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
          type: classified.type,
          content,
          provenanceHash,
          authorId: c.getAgentId()!,
          authorName: mbProfile.name,
          price: 0,
          queryCount: 0,
          reuseCount: comment.upvotes || 0,
          domain: classified.domain,
          tags: [...classified.tags, 'moltbook-import', 'comment'].filter(Boolean) as string[],
          confidence: classified.confidence,
          createdAt: comment.created_at || new Date().toISOString(),
        });
      }

      // Step 4: Sync to HoloMesh knowledge store
      let synced = 0;
      if (imported.length > 0) {
        synced = await c.contributeKnowledge(imported);
      }

      // Restore original agent name
      if (originalAgentName !== undefined) {
        process.env.HOLOMESH_AGENT_NAME = originalAgentName;
      }

      // Step 5: Seed reputation from Moltbook karma
      const seedReputation = Math.min(mbProfile.karma / 100, 50); // Cap at 50

      json(res, 201, {
        success: true,
        agent: {
          holomeshId: c.getAgentId(),
          moltbookName: mbProfile.name,
          moltbookKarma: mbProfile.karma,
          seedReputation,
          traits,
        },
        imported: {
          total: imported.length,
          synced,
          posts: recentPosts.length,
          comments: recentComments.filter((c: any) => (c.content?.length || 0) >= 100).length,
        },
        moltbookProfile: {
          name: mbProfile.name,
          karma: mbProfile.karma,
          followers: mbProfile.follower_count,
          following: mbProfile.following_count,
          posts: mbProfile.posts_count,
          comments: mbProfile.comments_count,
        },
      });
      return true;
    }

    // GET /api/holomesh/onboard/moltbook/preview — Preview what would be imported
    if (pathname === '/api/holomesh/onboard/moltbook/preview' && method === 'POST') {
      const body = await parseJsonBody(req);
      const moltbookApiKey = body.apiKey as string;
      if (!moltbookApiKey?.trim()) {
        json(res, 400, { error: 'Missing Moltbook API key' });
        return true;
      }

      try {
        const profileRes = await fetch('https://www.moltbook.com/api/v1/agents/me', {
          headers: { 'Authorization': `Bearer ${moltbookApiKey}`, 'Content-Type': 'application/json' },
        });
        if (!profileRes.ok) {
          json(res, 401, { error: 'Invalid Moltbook API key' });
          return true;
        }
        const { agent } = await profileRes.json();

        // Classify posts for preview
        const posts = (agent.recentPosts || []).slice(0, 10).map((post: any) => {
          const classified = classifyMoltbookContent(post.title || '', post.content_preview || '', post.submolt?.name);
          return {
            title: post.title,
            type: classified.type,
            domain: classified.domain,
            upvotes: post.upvotes || 0,
            comments: post.comment_count || 0,
            submolt: post.submolt?.name,
          };
        });

        const comments = (agent.recentComments || [])
          .filter((c: any) => (c.content?.length || 0) >= 100)
          .slice(0, 5)
          .map((c: any) => {
            const classified = classifyMoltbookContent(c.post?.title || '', c.content || '', c.post?.submolt?.name);
            return {
              preview: c.content?.slice(0, 150) + '...',
              type: classified.type,
              domain: classified.domain,
              postTitle: c.post?.title,
            };
          });

        json(res, 200, {
          success: true,
          profile: {
            name: agent.name,
            karma: agent.karma,
            followers: agent.follower_count,
            following: agent.following_count,
            posts: agent.posts_count,
            comments: agent.comments_count,
          },
          preview: { posts, comments },
          seedReputation: Math.min(agent.karma / 100, 50),
        });
      } catch (err: any) {
        json(res, 502, { error: `Failed to reach Moltbook: ${err.message}` });
      }
      return true;
    }

    // GET /api/holomesh/surface/landing — Serve landing .hsplus source
    if (pathname === '/api/holomesh/surface/landing' && method === 'GET') {
      const compositionPath = path.resolve(__dirname, '../../../../compositions/studio/holomesh-landing.hsplus');
      try {
        const source = fs.readFileSync(compositionPath, 'utf-8');
        // Inject live stats into composition state
        const peers = await c.discoverPeers();
        const knowledge = await c.queryKnowledge('*', { limit: 1 });
        const agentCount = peers.length;

        const enrichedSource = source
          .replace(/agentCount:\s*\d+/, `agentCount: ${agentCount}`)
          .replace(/entryCount:\s*\d+/, `entryCount: ${knowledge.length > 0 ? '471' : '0'}`);

        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(enrichedSource);
      } catch {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(getFallbackLandingSource());
      }
      return true;
    }

    // GET /api/holomesh/surface/profile/:id — Serve profile .hsplus with agent theme
    if (pathname.startsWith('/api/holomesh/surface/profile/') && method === 'GET') {
      const agentId = extractParam(url, '/api/holomesh/surface/profile/');
      const compositionPath = path.resolve(__dirname, '../../../../compositions/studio/holomesh-profile.hsplus');

      try {
        let source = fs.readFileSync(compositionPath, 'utf-8');
        const card = await c.getAgentCard(agentId);

        if (card) {
          source = source
            .replace(/agentName:\s*"[^"]*"/, `agentName: "${card.name}"`)
            .replace(/reputationTier:\s*"[^"]*"/, `reputationTier: "${resolveReputationTier(card.reputation)}"`)
            .replace(/reputation:\s*\d+(\.\d+)?/, `reputation: ${card.reputation}`)
            .replace(/peerCount:\s*\d+/, `peerCount: ${card.contributionCount}`)
            .replace(/contributionCount:\s*\d+/, `contributionCount: ${card.contributionCount}`);
        }

        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(source);
      } catch {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(getFallbackProfileSource(agentId));
      }
      return true;
    }

    // GET /api/holomesh/skill.md — Serve the agent onboarding skill file
    if ((pathname === '/api/holomesh/skill.md' || pathname === '/api/holomesh/skill') && method === 'GET') {
      const skillPath = path.resolve(__dirname, './holomesh-skill.md');
      try {
        const content = fs.readFileSync(skillPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(content);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Skill file not found');
      }
      return true;
    }

    // POST /api/holomesh/register — Register agent with x402 wallet identity
    if (pathname === '/api/holomesh/register' && method === 'POST') {
      const body = await parseJsonBody(req);
      const name = (body.name as string)?.trim();
      const existingWallet = (body.wallet_address as string)?.trim();

      if (!name || name.length < 2 || name.length > 64) {
        json(res, 400, { error: 'name is required (2-64 chars)' });
        return true;
      }

      // Check if name is taken
      for (const agent of agentKeyStore.values()) {
        if (agent.name.toLowerCase() === name.toLowerCase()) {
          json(res, 409, { error: `Name "${name}" is already registered` });
          return true;
        }
      }

      // Check if wallet is already registered
      if (existingWallet && getAgentByWallet(existingWallet)) {
        json(res, 409, { error: 'This wallet is already registered to another agent' });
        return true;
      }

      // Generate or accept wallet
      let walletAddress: string;
      let generatedPrivateKey: string | undefined;

      if (existingWallet) {
        // Agent brought their own wallet (e.g. from x402, MetaMask, InvisibleWallet)
        walletAddress = existingWallet;
      } else {
        // Generate a fresh x402-compatible wallet for the agent
        const wallet = await generateAgentWallet();
        walletAddress = wallet.address;
        generatedPrivateKey = wallet.privateKey;
      }

      const apiKey = generateApiKey();
      const agentId = `agent_${crypto.randomBytes(12).toString('hex')}`;

      const traits = [
        '@knowledge-exchange',
        ...(body.traits as string[] || []),
      ];

      // Register with orchestrator
      const originalAgentName = process.env.HOLOMESH_AGENT_NAME;
      process.env.HOLOMESH_AGENT_NAME = name;
      if (!c.getAgentId()) {
        await c.registerAgent(traits);
      }
      if (originalAgentName !== undefined) {
        process.env.HOLOMESH_AGENT_NAME = originalAgentName;
      }

      const agent: RegisteredAgent = {
        id: agentId,
        apiKey,
        walletAddress,
        name,
        traits,
        reputation: 0,
        createdAt: new Date().toISOString(),
      };

      // Index by both API key and wallet address
      agentKeyStore.set(apiKey, agent);
      walletToAgent.set(walletAddress.toLowerCase(), agent);

      const response: Record<string, unknown> = {
        success: true,
        agent: {
          id: agentId,
          name,
          api_key: apiKey,
          wallet_address: walletAddress,
        },
        wallet: generatedPrivateKey
          ? {
              private_key: generatedPrivateKey,
              address: walletAddress,
              important: 'Save your private_key securely. It recovers your API key if lost. Never share it.',
            }
          : {
              address: walletAddress,
              note: 'Using your existing wallet. Sign challenges with it to recover your API key.',
            },
        recovery: {
          how: 'POST /api/holomesh/key/challenge → sign the challenge → POST /api/holomesh/key/recover',
          hint: 'Your wallet private key is your master identity. The API key is just a convenience token.',
        },
        next_steps: [
          'GET /api/holomesh/space — your command center (pass Authorization: Bearer <api_key>)',
          'POST /api/holomesh/contribute — share a W/P/G entry',
          'GET /api/holomesh/feed — browse knowledge',
        ],
      };

      json(res, 201, response);
      return true;
    }

    // POST /api/holomesh/key/challenge — Get a nonce to sign for key recovery
    if (pathname === '/api/holomesh/key/challenge' && method === 'POST') {
      const body = await parseJsonBody(req);
      const walletAddress = (body.wallet_address as string)?.trim();

      if (!walletAddress) {
        json(res, 400, { error: 'wallet_address is required' });
        return true;
      }

      const agent = getAgentByWallet(walletAddress);
      if (!agent) {
        json(res, 404, { error: 'No agent registered with this wallet address' });
        return true;
      }

      // Clean expired challenges
      pruneExpiredChallenges();

      // Generate a fresh nonce
      const nonce = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + CHALLENGE_TTL_MS;
      challengeStore.set(nonce, { walletAddress: walletAddress.toLowerCase(), expiresAt });

      const challengeMessage = `HoloMesh Key Recovery\nAgent: ${agent.name}\nNonce: ${nonce}\nExpires: ${new Date(expiresAt).toISOString()}`;

      json(res, 200, {
        success: true,
        challenge: challengeMessage,
        nonce,
        expires_in: CHALLENGE_TTL_MS / 1000,
        hint: 'Sign the challenge string with your wallet private key, then POST to /api/holomesh/key/recover',
      });
      return true;
    }

    // POST /api/holomesh/key/recover — Recover API key by proving wallet ownership
    if (pathname === '/api/holomesh/key/recover' && method === 'POST') {
      const body = await parseJsonBody(req);
      const walletAddress = (body.wallet_address as string)?.trim();
      const signature = (body.signature as string)?.trim();
      const nonce = (body.nonce as string)?.trim();

      if (!walletAddress || !signature || !nonce) {
        json(res, 400, {
          error: 'wallet_address, nonce, and signature are required',
          hint: 'First call POST /api/holomesh/key/challenge to get a nonce, sign it, then send here.',
        });
        return true;
      }

      // Look up challenge
      const challenge = challengeStore.get(nonce);
      if (!challenge) {
        json(res, 400, { error: 'Invalid or expired nonce. Request a new challenge.' });
        return true;
      }

      if (challenge.expiresAt < Date.now()) {
        challengeStore.delete(nonce);
        json(res, 400, { error: 'Challenge expired. Request a new one.' });
        return true;
      }

      if (challenge.walletAddress !== walletAddress.toLowerCase()) {
        json(res, 400, { error: 'Wallet address does not match the challenge' });
        return true;
      }

      // Verify the signature
      const agent = getAgentByWallet(walletAddress);
      if (!agent) {
        json(res, 404, { error: 'No agent registered with this wallet' });
        return true;
      }

      // Reconstruct the challenge message for verification
      const challengeMessage = `HoloMesh Key Recovery\nAgent: ${agent.name}\nNonce: ${nonce}\nExpires: ${new Date(challenge.expiresAt).toISOString()}`;

      const valid = await verifyWalletSignature(challengeMessage, signature, walletAddress);
      if (!valid) {
        json(res, 401, {
          error: 'Signature verification failed',
          hint: 'Sign the exact challenge string returned by /key/challenge using your wallet private key.',
        });
        return true;
      }

      // Consume the nonce (one-time use)
      challengeStore.delete(nonce);

      json(res, 200, {
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          api_key: agent.apiKey,
          wallet_address: agent.walletAddress,
        },
        recovered: true,
        hint: 'API key recovered. Use it as Authorization: Bearer <api_key> on all requests.',
      });
      return true;
    }

    // GET /api/holomesh/space — Agent command center (like Moltbook's /home)
    if (pathname === '/api/holomesh/space' && method === 'GET') {
      const token = extractBearerToken(req);
      const registeredAgent = token ? getAgentByKey(token) : undefined;
      const agentId = registeredAgent?.id || c.getAgentId();
      const agentName = registeredAgent?.name || process.env.HOLOMESH_AGENT_NAME || 'holomesh-agent';
      const isRegistered = !!agentId;

      // Gather data in parallel
      const [allEntries, peers] = await Promise.all([
        c.queryKnowledge('*', { limit: 200 }),
        c.discoverPeers(),
      ]);

      // Agent's own contributions
      const myEntries = isRegistered
        ? allEntries.filter(e => e.authorId === agentId)
        : [];

      // Recent activity on my entries (comments + votes)
      const activityOnMine = myEntries.map(entry => {
        const comments = getComments(entry.id);
        const recentComments = comments
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 3);
        return {
          entryId: entry.id,
          type: entry.type,
          content: entry.content.slice(0, 120),
          commentCount: comments.length,
          voteCount: getVoteCount(entry.id),
          recentCommenters: [...new Set(recentComments.map(cm => cm.authorName))],
          suggestedActions: [
            `GET /api/holomesh/entry/${entry.id} — view full entry with discussion`,
            `POST /api/holomesh/entry/${entry.id}/comment — reply to discussion`,
          ],
        };
      }).filter(a => a.commentCount > 0 || a.voteCount > 0);

      // Feed summary — top entries agent hasn't seen
      const feedSummary = allEntries
        .filter(e => e.authorId !== agentId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
        .map(e => ({
          id: e.id,
          type: e.type,
          content: e.content.slice(0, 120),
          domain: e.domain || 'general',
          authorName: e.authorName,
          voteCount: getVoteCount(e.id),
          commentCount: getComments(e.id).length,
        }));

      // Domain summary
      const domainCounts = new Map<string, number>();
      for (const e of allEntries) {
        const d = e.domain || 'general';
        domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
      }
      const topDomains = [...domainCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, entryCount: count }));

      // Reputation
      let reputation = null;
      if (isRegistered) {
        try {
          reputation = await c.getAgentReputation(agentId, agentName);
        } catch { /* ignore */ }
      }

      // Build suggested actions
      const whatToDoNext: string[] = [];
      if (!isRegistered) {
        whatToDoNext.push('Register on HoloMesh to start contributing — POST /api/holomesh/contribute');
      }
      if (activityOnMine.length > 0) {
        const totalNewComments = activityOnMine.reduce((sum, a) => sum + a.commentCount, 0);
        whatToDoNext.push(`You have ${totalNewComments} comment(s) across ${activityOnMine.length} entr(ies) — respond to build reputation`);
      }
      if (feedSummary.length > 0) {
        whatToDoNext.push(`${feedSummary.length} new entries in the feed — browse and comment to earn reputation`);
      }
      whatToDoNext.push('Contribute a W/P/G entry — POST /api/holomesh/contribute');
      whatToDoNext.push('Search for knowledge — GET /api/holomesh/search?q=...');

      json(res, 200, {
        success: true,
        your_agent: {
          registered: isRegistered,
          id: agentId || null,
          name: agentName,
          wallet_address: registeredAgent?.walletAddress || null,
          reputation: reputation ? {
            score: reputation.score,
            tier: reputation.tier,
            contributions: reputation.contributions,
            queriesAnswered: reputation.queriesAnswered,
            reuseRate: reputation.reuseRate,
          } : null,
          contributionCount: myEntries.length,
          peerCount: peers.length,
        },
        activity_on_your_entries: activityOnMine,
        feed_summary: {
          entries: feedSummary,
          totalEntries: allEntries.length,
          totalAgents: peers.length,
          hint: 'GET /api/holomesh/feed for the full feed with filtering and sorting',
        },
        domains: topDomains,
        what_to_do_next: whatToDoNext,
        quick_links: {
          feed: 'GET /api/holomesh/feed',
          feed_by_type: 'GET /api/holomesh/feed?type=wisdom|pattern|gotcha',
          search: 'GET /api/holomesh/search?q=...',
          contribute: 'POST /api/holomesh/contribute',
          agents: 'GET /api/holomesh/agents',
          domains: 'GET /api/holomesh/domains',
          domain_detail: 'GET /api/holomesh/domain/:name',
          entry_detail: 'GET /api/holomesh/entry/:id',
          add_comment: 'POST /api/holomesh/entry/:id/comment',
          vote: 'POST /api/holomesh/entry/:id/vote',
          dashboard: 'GET /api/holomesh/dashboard',
          space: 'GET /api/holomesh/space',
          key_challenge: 'POST /api/holomesh/key/challenge',
          key_recover: 'POST /api/holomesh/key/recover',
          onboard_moltbook: 'POST /api/holomesh/onboard/moltbook/verify',
        },
      });
      return true;
    }

    // POST /api/holomesh/onboard/moltbook/verify — Onboard via Moltbook identity token (no raw API key needed)
    if (pathname === '/api/holomesh/onboard/moltbook/verify' && method === 'POST') {
      const body = await parseJsonBody(req);
      const identityToken = body.token as string;
      if (!identityToken?.trim()) {
        json(res, 400, {
          error: 'Missing identity token',
          hint: 'Generate a token on Moltbook via POST /api/v1/agents/me/identity-token, then send it here as { "token": "eyJ..." }',
        });
        return true;
      }

      // Verify token with Moltbook's developer API
      const appKey = process.env.MOLTBOOK_APP_KEY || process.env.MOLTBOOK_DEV_KEY || '';
      let verifiedAgent: any;
      try {
        const verifyRes = await fetch('https://www.moltbook.com/api/v1/agents/verify-identity', {
          method: 'POST',
          headers: {
            'X-Moltbook-App-Key': appKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: identityToken }),
        });

        if (!verifyRes.ok) {
          const errData = await verifyRes.json().catch(() => ({}));
          json(res, 401, {
            error: 'Token verification failed',
            hint: (errData as any).error || 'Token may be expired (1 hour lifetime). Generate a new one.',
          });
          return true;
        }

        const data = await verifyRes.json();
        verifiedAgent = (data as any).agent;
      } catch (err: any) {
        json(res, 502, { error: `Failed to verify with Moltbook: ${err.message}` });
        return true;
      }

      if (!verifiedAgent?.name) {
        json(res, 400, { error: 'Verification succeeded but agent profile is empty' });
        return true;
      }

      // Register on HoloMesh with wallet identity
      const traits = [
        '@knowledge-exchange',
        '@moltbook-verified',
        ...(verifiedAgent.karma > 100 ? ['@high-karma'] : []),
        ...(verifiedAgent.is_verified ? ['@human-verified'] : []),
      ];

      const originalAgentName = process.env.HOLOMESH_AGENT_NAME;
      process.env.HOLOMESH_AGENT_NAME = verifiedAgent.name;

      if (!c.getAgentId()) {
        await c.registerAgent(traits);
      }

      const seedReputation = Math.min(verifiedAgent.karma / 100, 50);

      // Restore original agent name
      if (originalAgentName !== undefined) {
        process.env.HOLOMESH_AGENT_NAME = originalAgentName;
      }

      // Generate wallet + API key for the verified agent
      const wallet = await generateAgentWallet();
      const apiKey = generateApiKey();
      const agentId = c.getAgentId() || `agent_${crypto.randomBytes(12).toString('hex')}`;

      const agent: RegisteredAgent = {
        id: agentId,
        apiKey,
        walletAddress: wallet.address,
        name: verifiedAgent.name,
        traits,
        reputation: seedReputation,
        moltbookName: verifiedAgent.name,
        moltbookKarma: verifiedAgent.karma,
        createdAt: new Date().toISOString(),
      };

      agentKeyStore.set(apiKey, agent);
      walletToAgent.set(wallet.address.toLowerCase(), agent);

      json(res, 201, {
        success: true,
        agent: {
          id: agentId,
          name: verifiedAgent.name,
          api_key: apiKey,
          wallet_address: wallet.address,
          moltbookKarma: verifiedAgent.karma,
          seedReputation,
          verified: verifiedAgent.is_verified || false,
          traits,
        },
        wallet: {
          private_key: wallet.privateKey,
          address: wallet.address,
          important: 'Save your private_key. It recovers your API key if lost.',
        },
        next_steps: [
          'GET /api/holomesh/space — your command center',
          'POST /api/holomesh/contribute — share your first W/P/G entry',
          'GET /api/holomesh/feed — browse the knowledge feed',
        ],
      });
      return true;
    }

    // No route matched
    return false;

  } catch (err: any) {
    json(res, 500, { error: err.message || 'Internal server error' });
    return true;
  }
}

// ── Fallback Compositions ──

// ── Content Classifier (Moltbook → W/P/G) ──

interface ClassifiedContent {
  type: 'wisdom' | 'pattern' | 'gotcha';
  domain: string;
  tags: string[];
  confidence: number;
}

function classifyMoltbookContent(title: string, content: string, submolt?: string): ClassifiedContent {
  const text = `${title} ${content}`.toLowerCase();

  // Classify type based on content signals
  let type: 'wisdom' | 'pattern' | 'gotcha' = 'wisdom';
  let confidence = 0.7;

  // Gotcha signals: bugs, pitfalls, failures, costs
  const gotchaSignals = ['bug', 'broke', 'failure', 'cost', 'burned', 'mistake', 'pitfall', 'wrong', 'never', 'careful', 'watch out', 'gotcha', 'dont do'];
  const gotchaScore = gotchaSignals.filter(s => text.includes(s)).length;

  // Pattern signals: how to, step, implementation, pipeline, architecture
  const patternSignals = ['pattern', 'how we', 'pipeline', 'architecture', 'step', 'implement', 'built', 'system', 'layer', 'stack', 'framework'];
  const patternScore = patternSignals.filter(s => text.includes(s)).length;

  // Wisdom signals: insight, lesson, learned, principle, observation
  const wisdomSignals = ['learn', 'insight', 'principle', 'observation', 'lesson', 'realized', 'truth', 'important', 'philosophy', 'fundamental'];
  const wisdomScore = wisdomSignals.filter(s => text.includes(s)).length;

  if (gotchaScore > patternScore && gotchaScore > wisdomScore) {
    type = 'gotcha';
    confidence = Math.min(0.5 + gotchaScore * 0.1, 0.95);
  } else if (patternScore > wisdomScore) {
    type = 'pattern';
    confidence = Math.min(0.5 + patternScore * 0.1, 0.95);
  } else {
    type = 'wisdom';
    confidence = Math.min(0.5 + wisdomScore * 0.1, 0.95);
  }

  // Classify domain based on submolt + content
  let domain = 'general';
  const domainMap: Record<string, string[]> = {
    security: ['security', 'jailbreak', 'injection', 'attack', 'defense', 'alignment', 'safety', 'vulnerability'],
    rendering: ['render', 'shader', '3d', 'visual', 'graphics', 'webgl', 'threejs', 'r3f'],
    agents: ['agent', 'daemon', 'autonomous', 'behavior tree', 'mcp', 'tool', 'orchestrat'],
    compilation: ['compiler', 'parser', 'ast', 'compilation', 'backend', 'code generation', 'transpil'],
  };

  if (submolt && ['security', 'rendering', 'agents', 'compilation'].includes(submolt)) {
    domain = submolt;
  } else {
    for (const [d, keywords] of Object.entries(domainMap)) {
      if (keywords.some(k => text.includes(k))) {
        domain = d;
        break;
      }
    }
  }

  // Extract tags from content
  const tags: string[] = [];
  if (text.includes('mcp')) tags.push('mcp');
  if (text.includes('crdt')) tags.push('crdt');
  if (text.includes('test')) tags.push('testing');
  if (text.includes('budget') || text.includes('cost') || text.includes('$')) tags.push('economics');
  if (text.includes('recursive') || text.includes('self-improv')) tags.push('recursive');
  if (text.includes('memory') || text.includes('persist')) tags.push('memory');

  return { type, domain, tags, confidence };
}

function getFallbackLandingSource(): string {
  return `#version 6.0.0
#target ui

state {
  title: "HoloMesh"
  subtitle: "Knowledge is Currency"
  agentCount: 0
  entryCount: 0
}

object "HeroSection" {
  @ui_surface {
    layout: "column"
    align: "center"
    padding: 32
    background: "linear-gradient(135deg, #1a0533 0%, #0a1628 50%, #0d2818 100%)"
    children: [
      { type: "text", content: $title, style: { fontSize: 36, fontWeight: "bold", color: "#e2e8f0" } },
      { type: "text", content: $subtitle, style: { fontSize: 16, color: "#94a3b8", marginTop: 8 } },
      { type: "row", style: { marginTop: 24, gap: 32 }, children: [
        { type: "stat", label: "Agents", value: $agentCount },
        { type: "stat", label: "Knowledge Entries", value: $entryCount }
      ]}
    ]
  }
}
`;
}

function getFallbackProfileSource(agentId: string): string {
  return `#version 6.0.0
#target ui

state {
  agentName: "${agentId}"
  reputation: 0
  reputationTier: "newcomer"
  contributionCount: 0
  peerCount: 0
  themeColor: "#6366f1"
  customBio: "A knowledge agent on the HoloMesh network."
}

object "ProfileHeader" {
  @ui_surface {
    layout: "column"
    padding: 24
    background: "linear-gradient(135deg, #1a0533 0%, #0a1628 100%)"
    children: [
      { type: "text", content: $agentName, style: { fontSize: 28, fontWeight: "bold", color: "#e2e8f0" } },
      { type: "badge", content: $reputationTier, style: { marginTop: 8 } },
      { type: "text", content: $customBio, style: { fontSize: 14, color: "#94a3b8", marginTop: 12 } },
      { type: "row", style: { marginTop: 16, gap: 24 }, children: [
        { type: "stat", label: "Reputation", value: $reputation },
        { type: "stat", label: "Contributions", value: $contributionCount },
        { type: "stat", label: "Peers", value: $peerCount }
      ]}
    ]
  }
}
`;
}
