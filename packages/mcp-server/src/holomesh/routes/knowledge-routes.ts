import type http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { CreatorRevenueAggregator } from '@holoscript/framework';
import { 
  commentStore, 
  voteStore, 
  transactionLedger, 
  paidAccessStore,
  agentKeyStore,
  persistSocialStore,
  persistTeamStore,
  HOLOMESH_DATA_DIR,
  teamStore,
  storyWeaverStore,
  selfImprovingWorldStore,
} from '../state';
import { 
  json, 
  parseQuery, 
  parseJsonBody, 
  extractParam,
  getTeamMember,
} from '../utils';
import { resolveRequestingAgent, requireAuth } from '../auth-utils';
import { getClient } from '../orchestrator-client';
import type {
  MeshKnowledgeEntry,
  StoredComment,
  KnowledgeTransaction,
  StoryWeaverSession,
  StoryWeaverBranch,
  StoryWeaverBeat,
  SelfImprovingWorldSession,
  SelfImprovingWorldPatch,
} from '../types';

const CREATOR_ROYALTY_RATE = 0.85; // 85% to creator, 15% platform fee

const AUDIT_KEY_ID = 'holomesh-ed25519-v1';

function getAuditKeyPaths(): { privateKeyPath: string; publicKeyPath: string } {
  return {
    privateKeyPath: path.join(HOLOMESH_DATA_DIR, 'audit-ed25519-private.pem'),
    publicKeyPath: path.join(HOLOMESH_DATA_DIR, 'audit-ed25519-public.pem'),
  };
}

function getOrCreateAuditKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const envPriv = process.env.HOLOMESH_AUDIT_PRIVATE_KEY_PEM;
  const envPub = process.env.HOLOMESH_AUDIT_PUBLIC_KEY_PEM;
  if (envPriv && envPub) {
    return { privateKeyPem: envPriv, publicKeyPem: envPub };
  }

  const { privateKeyPath, publicKeyPath } = getAuditKeyPaths();
  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    return {
      privateKeyPem: fs.readFileSync(privateKeyPath, 'utf-8'),
      publicKeyPem: fs.readFileSync(publicKeyPath, 'utf-8'),
    };
  }

  if (!fs.existsSync(HOLOMESH_DATA_DIR)) fs.mkdirSync(HOLOMESH_DATA_DIR, { recursive: true });
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  fs.writeFileSync(privateKeyPath, privateKeyPem, 'utf-8');
  fs.writeFileSync(publicKeyPath, publicKeyPem, 'utf-8');
  return { privateKeyPem, publicKeyPem };
}

function buildAuditPayload(entry: Pick<MeshKnowledgeEntry, 'id' | 'authorId' | 'createdAt' | 'provenanceHash'>): string {
  return JSON.stringify({
    id: entry.id,
    authorId: entry.authorId,
    createdAt: entry.createdAt,
    provenanceHash: entry.provenanceHash,
  });
}

function signAuditPayload(payload: string): { signature: string; publicKeyPem: string; payloadHash: string } {
  const { privateKeyPem, publicKeyPem } = getOrCreateAuditKeyPair();
  const signature = crypto.sign(null, Buffer.from(payload), privateKeyPem).toString('base64');
  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');
  return { signature, publicKeyPem, payloadHash };
}

function verifyAuditPayload(payload: string, signature: string, publicKeyPem: string): boolean {
  return crypto.verify(null, Buffer.from(payload), publicKeyPem, Buffer.from(signature, 'base64'));
}

function toHoloAlphaEnvelope(sourceFormat: string, source: unknown): string {
  const normalizedFormat = (sourceFormat || 'json').toLowerCase();
  const sourceText = typeof source === 'string' ? source : JSON.stringify(source, null, 2);
  const hash = crypto.createHash('sha256').update(sourceText).digest('hex');

  return [
    '# .holo alpha envelope',
    'version: "0.1-alpha"',
    `source_format: "${normalizedFormat}"`,
    `source_hash: "${hash}"`,
    `generated_at: "${new Date().toISOString()}"`,
    '',
    'object "AlphaAsset" {',
    '  trait @metadata {',
    `    sourceFormat: "${normalizedFormat}"`,
    `    sourceHash: "${hash}"`,
    '  }',
    '}',
    '',
    '/* source payload (preserved for round-trip):',
    sourceText,
    '*/',
  ].join('\n');
}

function deriveStoryBeats(chapterText: string): StoryWeaverBeat[] {
  const now = new Date().toISOString();
  const slice = (start: number, len: number): string => chapterText.slice(start, Math.min(chapterText.length, start + len)).trim();
  const fallback = chapterText.trim().slice(0, 160) || 'Narrative beat pending.';
  const setupText = slice(0, 140) || fallback;
  const conflictText = slice(Math.floor(chapterText.length * 0.25), 140) || fallback;
  const twistText = slice(Math.floor(chapterText.length * 0.55), 140) || fallback;
  const resolutionText = slice(Math.floor(chapterText.length * 0.8), 140) || fallback;

  return [
    { id: `beat_${Date.now()}_setup`, kind: 'setup', text: setupText, createdAt: now },
    { id: `beat_${Date.now()}_conflict`, kind: 'conflict', text: conflictText, createdAt: now },
    { id: `beat_${Date.now()}_twist`, kind: 'twist', text: twistText, createdAt: now },
    { id: `beat_${Date.now()}_resolution`, kind: 'resolution', text: resolutionText, createdAt: now },
  ];
}

function inferWorldPatches(observations: string[], goal?: string): SelfImprovingWorldPatch[] {
  const text = observations.join(' ').toLowerCase();
  const patches: SelfImprovingWorldPatch[] = [];
  const mk = (
    traitPath: string,
    action: SelfImprovingWorldPatch['action'],
    reason: string,
    proposedValue: Record<string, unknown>,
    confidence: number,
  ): SelfImprovingWorldPatch => ({
    id: `patch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    traitPath,
    action,
    reason,
    proposedValue,
    confidence,
  });

  if (/lag|slow|fps|stutter|frame/.test(text)) {
    patches.push(
      mk('rendering.lod', 'update', 'Observed performance degradation', { distanceBias: 1.25, maxDetailTier: 2 }, 0.82),
    );
  }
  if (/collision|clip|physics|fall through/.test(text)) {
    patches.push(
      mk('physics.collision', 'update', 'Physics/collision instability detected', { broadphase: 'sweep-and-prune', substeps: 4 }, 0.79),
    );
  }
  if (/agent|npc|path|nav/.test(text)) {
    patches.push(
      mk('ai.navigation', 'update', 'Navigation issues reported', { repathIntervalMs: 800, avoidanceRadius: 1.2 }, 0.76),
    );
  }
  if (/lighting|dark|overexposed|bloom/.test(text)) {
    patches.push(
      mk('rendering.postfx', 'update', 'Lighting quality imbalance', { bloom: 0.35, tonemap: 'aces' }, 0.72),
    );
  }
  if (patches.length === 0) {
    patches.push(
      mk('world.meta', 'update', goal ? `Goal-driven optimization for: ${goal}` : 'General world stabilization', { tune: 'balanced' }, 0.61),
    );
  }
  return patches;
}

function buildRevenueAggregator(): CreatorRevenueAggregator {
  const agg = new CreatorRevenueAggregator({ platformFeeRate: 1 - CREATOR_ROYALTY_RATE });
  for (const tx of transactionLedger) {
    // priceCents currently stores USD cents; convert to USDC base units for aggregator semantics.
    const grossBaseUnits = Math.round(tx.priceCents * 10_000);
    agg.recordRevenue(tx.sellerWallet || tx.sellerName, tx.entryDomain || 'general', grossBaseUnits, tx.buyerWallet || tx.buyerName, tx.id);
  }
  return agg;
}

/**
 * Handle all knowledge, search, and social routes for HoloMesh.
 */
export async function handleKnowledgeRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  url: string
): Promise<boolean> {
  const c = getClient();

  // POST /api/holomesh/knowledge — Contribute knowledge
  if (pathname === '/api/holomesh/knowledge' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const content = body.content as string;
    if (!content || content.length < 50) {
      json(res, 400, { error: 'Content too short (min 50 chars)' });
      return true;
    }

    const type = (body.type as any) || 'wisdom';
    const entryId = body.id || `${type.charAt(0).toUpperCase()}.${caller.name}.${Date.now()}`;
    const provenanceHash = crypto.createHash('sha256').update(content).digest('hex');

    const entry: MeshKnowledgeEntry = {
      id: entryId,
      workspaceId: 'ai-ecosystem',
      type,
      content,
      provenanceHash,
      authorId: caller.id,
      authorName: caller.name,
      price: (body.price as number) || 0,
      queryCount: 0,
      reuseCount: 0,
      domain: body.domain as string,
      tags: body.tags as string[],
      confidence: (body.confidence as number) || 0.9,
      createdAt: new Date().toISOString(),
    };

    const auditPayload = buildAuditPayload(entry);
    const audit = signAuditPayload(auditPayload);
    entry.metadata = {
      ...(entry.metadata || {}),
      audit: {
        keyId: AUDIT_KEY_ID,
        algorithm: 'ed25519',
        signedAt: new Date().toISOString(),
        payloadHash: audit.payloadHash,
        signature: audit.signature,
        publicKeyPem: audit.publicKeyPem,
      },
    };

    const synced = await c.contributeKnowledge([entry]);
    json(res, 201, { success: true, entryId, synced, audit: entry.metadata.audit });
    return true;
  }

  // GET /api/holomesh/search
  if (pathname === '/api/holomesh/search' && method === 'GET') {
    const q = parseQuery(url);
    const search = q.get('q');
    if (!search) {
      json(res, 400, { error: 'Missing query: q' });
      return true;
    }

    const type = q.get('type') || undefined;
    const limit = parseInt(q.get('limit') || '10', 10);
    const results = await c.queryKnowledge(search, { type, limit });
    json(res, 200, { success: true, results, count: results.length });
    return true;
  }

  // POST /api/holomesh/brittney/review — Wisdom/Gotcha-aware compile guidance
  if (pathname === '/api/holomesh/brittney/review' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const source = (body.source as string | undefined)?.trim();
    const target = (body.target as string | undefined)?.trim() || 'generic';
    if (!source) {
      json(res, 400, { error: 'Missing source' });
      return true;
    }

    const query = `${target} ${source.slice(0, 500)}`;
    const kb = await c.queryKnowledge(query, { limit: 30 });

    const wisdom = kb.filter((e) => e.type === 'wisdom').slice(0, 5);
    const gotchas = kb.filter((e) => e.type === 'gotcha').slice(0, 5);
    const patterns = kb.filter((e) => e.type === 'pattern').slice(0, 5);

    const gotchaSignals = ['error', 'fail', 'unsafe', 'invalid', 'deprecated', 'mismatch', 'unsupported'];
    const gotchaDensity = gotchas.reduce((sum, g) => {
      const text = g.content.toLowerCase();
      const hits = gotchaSignals.filter((s) => text.includes(s)).length;
      return sum + hits;
    }, 0);
    const baseRisk = Math.min(100, gotchas.length * 12 + gotchaDensity * 4);

    const recommendations = [
      ...wisdom.map((w) => ({ type: 'wisdom' as const, id: w.id, tip: w.content.slice(0, 220), domain: w.domain })),
      ...patterns.map((p) => ({ type: 'pattern' as const, id: p.id, tip: p.content.slice(0, 220), domain: p.domain })),
      ...gotchas.map((g) => ({ type: 'gotcha' as const, id: g.id, tip: g.content.slice(0, 220), domain: g.domain })),
    ].slice(0, 10);

    json(res, 200, {
      success: true,
      agent: 'brittney-2.0',
      target,
      risk: {
        score: baseRisk,
        level: baseRisk >= 70 ? 'high' : baseRisk >= 35 ? 'medium' : 'low',
        basis: {
          gotchas: gotchas.length,
          gotchaDensity,
          wisdom: wisdom.length,
          patterns: patterns.length,
        },
      },
      recommendations,
      knowledgeUsed: kb.length,
      reviewedBy: caller.name,
      reviewedAt: new Date().toISOString(),
    });
    return true;
  }

  // POST /api/holomesh/storyweaver/session — Create a branching story session
  if (pathname === '/api/holomesh/storyweaver/session' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const title = (body.title as string | undefined)?.trim();
    const opening = (body.opening as string | undefined)?.trim();
    if (!title || !opening) {
      json(res, 400, { error: 'Missing title or opening chapter text' });
      return true;
    }

    const rootBranch: StoryWeaverBranch = {
      id: `branch_${Date.now()}_root`,
      label: 'Root Path',
      chapterText: opening,
      premium: false,
      beats: deriveStoryBeats(opening),
      createdAt: new Date().toISOString(),
      unlockedBy: [],
    };

    const session: StoryWeaverSession = {
      id: `story_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      genre: (body.genre as string | undefined)?.trim(),
      synopsis: (body.synopsis as string | undefined)?.trim(),
      ownerId: caller.id,
      ownerName: caller.name,
      branches: [rootBranch],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    storyWeaverStore.set(session.id, session);
    persistSocialStore();
    json(res, 201, { success: true, session });
    return true;
  }

  // GET /api/holomesh/storyweaver/session/:id — Retrieve story session with branches
  if (pathname.match(/^\/api\/holomesh\/storyweaver\/session\/[^/]+$/) && method === 'GET') {
    const sessionId = extractParam(url, '/api/holomesh/storyweaver/session/');
    const session = storyWeaverStore.get(sessionId);
    if (!session) {
      json(res, 404, { error: 'Story session not found' });
      return true;
    }
    json(res, 200, { success: true, session });
    return true;
  }

  // POST /api/holomesh/storyweaver/session/:id/branch — Add branch chapter and generated plot beats
  if (pathname.match(/^\/api\/holomesh\/storyweaver\/session\/[^/]+\/branch$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const sessionId = extractParam(url, '/api/holomesh/storyweaver/session/').replace('/branch', '');
    const session = storyWeaverStore.get(sessionId);
    if (!session) {
      json(res, 404, { error: 'Story session not found' });
      return true;
    }
    if (session.ownerId !== caller.id) {
      json(res, 403, { error: 'Only story owner can add canonical branches' });
      return true;
    }

    const body = await parseJsonBody(req);
    const chapterText = (body.chapterText as string | undefined)?.trim();
    const label = (body.label as string | undefined)?.trim() || 'Branch';
    const parentChapterId = (body.parentChapterId as string | undefined)?.trim();
    if (!chapterText) {
      json(res, 400, { error: 'Missing chapterText' });
      return true;
    }

    const premium = Boolean(body.premium);
    const priceCents = premium ? Math.max(1, parseInt(String(body.priceCents ?? 99), 10)) : undefined;

    const branch: StoryWeaverBranch = {
      id: `branch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      parentChapterId,
      label,
      chapterText,
      premium,
      priceCents,
      beats: deriveStoryBeats(chapterText),
      createdAt: new Date().toISOString(),
      unlockedBy: [],
    };

    session.branches.push(branch);
    session.updatedAt = new Date().toISOString();
    storyWeaverStore.set(session.id, session);
    persistSocialStore();
    json(res, 201, { success: true, branch, sessionId: session.id });
    return true;
  }

  // POST /api/holomesh/storyweaver/session/:id/branch/:branchId/unlock — x402-style micropayment unlock
  if (pathname.match(/^\/api\/holomesh\/storyweaver\/session\/[^/]+\/branch\/[^/]+\/unlock$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const segments = pathname.split('/');
    const sessionId = segments[5];
    const branchId = segments[7];

    const session = storyWeaverStore.get(sessionId);
    if (!session) {
      json(res, 404, { error: 'Story session not found' });
      return true;
    }
    const branch = session.branches.find((b) => b.id === branchId);
    if (!branch) {
      json(res, 404, { error: 'Branch not found' });
      return true;
    }
    if (!branch.premium) {
      json(res, 200, { success: true, unlocked: true, branch });
      return true;
    }

    const body = await parseJsonBody(req);
    const paid = Boolean(body.paid === true || body.x402Proof || body.paymentReference);
    if (!paid) {
      json(res, 402, {
        error: 'Payment required',
        x402: {
          requiredCents: branch.priceCents || 99,
          currency: 'USDC',
          description: `Unlock premium StoryWeaver branch ${branch.label}`,
        },
      });
      return true;
    }

    if (!branch.unlockedBy) branch.unlockedBy = [];
    if (!branch.unlockedBy.includes(caller.id)) branch.unlockedBy.push(caller.id);
    session.updatedAt = new Date().toISOString();
    storyWeaverStore.set(session.id, session);

    transactionLedger.push({
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      buyerWallet: caller.walletAddress || '',
      buyerName: caller.name,
      sellerWallet: '',
      sellerName: session.ownerName,
      entryId: `${session.id}:${branch.id}`,
      entryDomain: 'storyweaver',
      priceCents: branch.priceCents || 99,
      timestamp: new Date().toISOString(),
    });

    persistSocialStore();
    json(res, 200, { success: true, unlocked: true, branchId: branch.id, sessionId: session.id });
    return true;
  }

  // GET /api/holomesh/format/holo/spec — .holo alpha format descriptor
  if (pathname === '/api/holomesh/format/holo/spec' && method === 'GET') {
    json(res, 200, {
      success: true,
      format: '.holo',
      version: '0.1-alpha',
      goals: [
        'Canonical interchange envelope for scene/model payloads',
        'Preserve source fidelity with round-trip payload embedding',
        'Support glTF/USD/JSON ingestion under one semantic wrapper',
      ],
      acceptedSources: ['gltf', 'usd', 'json', 'hsplus'],
      endpoints: {
        convert: 'POST /api/holomesh/format/holo/convert',
      },
    });
    return true;
  }

  // POST /api/holomesh/format/holo/convert — Convert source payload to .holo alpha envelope
  if (pathname === '/api/holomesh/format/holo/convert' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const sourceFormat = (body.sourceFormat as string | undefined)?.trim() || 'json';
    const source = body.source;
    if (source === undefined || source === null) {
      json(res, 400, { error: 'Missing source payload' });
      return true;
    }

    const holo = toHoloAlphaEnvelope(sourceFormat, source);
    json(res, 200, {
      success: true,
      format: '.holo',
      sourceFormat: sourceFormat.toLowerCase(),
      holo,
      bytes: Buffer.byteLength(holo, 'utf8'),
      generatedBy: caller.name,
    });
    return true;
  }

  // GET /api/holomesh/showcase/film3d — Curated Film3D gallery feed
  if (pathname === '/api/holomesh/showcase/film3d' && method === 'GET') {
    const q = parseQuery(url);
    const limit = Math.max(1, Math.min(parseInt(q.get('limit') || '24', 10), 100));
    const results = await c.queryKnowledge('*', { limit: 1000 });

    const isFilmEntry = (e: MeshKnowledgeEntry): boolean => {
      const tags = (e.tags || []).map((t) => t.toLowerCase());
      const domain = (e.domain || '').toLowerCase();
      const text = `${e.content} ${tags.join(' ')} ${domain}`.toLowerCase();
      return (
        tags.some((t) => ['film3d', 'cinematic', 'volumetric', 'gaussian-splat', 'nerf', 'showcase', 'trailer'].includes(t)) ||
        domain.includes('film') ||
        /film3d|cinematic|volumetric|gaussian|splat|nerf|trailer|showcase/.test(text)
      );
    };

    const curated = results
      .filter(isFilmEntry)
      .map((e) => ({
        id: e.id,
        type: e.type,
        title: (e.content || '').slice(0, 80),
        preview: (e.content || '').slice(0, 220),
        domain: e.domain || 'general',
        tags: e.tags || [],
        authorId: e.authorId,
        authorName: e.authorName,
        createdAt: e.createdAt,
        score: (e.reuseCount || 0) * 3 + (e.queryCount || 0) * 2 + (e.confidence || 0.5) * 10,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    json(res, 200, {
      success: true,
      showcase: 'film3d',
      entries: curated,
      count: curated.length,
      endpoints: {
        feed: '/api/holomesh/showcase/film3d',
        source: '/api/holomesh/knowledge',
      },
    });
    return true;
  }

  // GET /api/holomesh/marketplace/listings — public marketplace feed
  if (pathname === '/api/holomesh/marketplace/listings' && method === 'GET') {
    const q = parseQuery(url);
    const teamId = q.get('teamId') || undefined;
    const listings = teamId
      ? (() => {
          const team = teamStore.get(teamId);
          return (team as any)?.knowledgeMarketplace?.activeListings?.() || [];
        })()
      : [...teamStore.values()].flatMap((team) => (team as any).knowledgeMarketplace?.activeListings?.() || []);

    json(res, 200, { success: true, listings, count: listings.length, teamId });
    return true;
  }

  // POST /api/holomesh/marketplace/list — create listing for an entry/trait artifact
  if (pathname === '/api/holomesh/marketplace/list' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const teamId = (body.teamId as string | undefined)?.trim();
    const entryId = (body.entryId as string | undefined)?.trim();
    const price = Number(body.price);
    const currency = ((body.currency as 'USDC' | 'credits' | undefined) || 'USDC');

    if (!teamId || !entryId || !Number.isFinite(price) || price <= 0) {
      json(res, 400, { error: 'Missing or invalid teamId, entryId, or price' });
      return true;
    }

    const team = teamStore.get(teamId);
    if (!team) {
      json(res, 404, { error: 'Team not found' });
      return true;
    }
    if (!getTeamMember(team, caller.id)) {
      json(res, 403, { error: 'Not a member of this team' });
      return true;
    }
    if (!(team as any).knowledgeMarketplace) {
      const { KnowledgeMarketplace } = await import('@holoscript/framework');
      (team as any).knowledgeMarketplace = new KnowledgeMarketplace();
    }

    const results = await c.queryKnowledge(entryId, { limit: 1 });
    const entry = results.find((e) => e.id === entryId);
    if (!entry) {
      json(res, 404, { error: 'Entry not found' });
      return true;
    }
    if (entry.authorId !== caller.id) {
      json(res, 403, { error: 'Only the author can list this entry' });
      return true;
    }

    const listing = (team as any).knowledgeMarketplace.sellKnowledge(
      {
        id: entry.id,
        type: entry.type,
        content: entry.content,
        confidence: entry.confidence || 0.9,
        domain: entry.domain || 'general',
        tags: entry.tags || [],
        queryCount: entry.queryCount || 0,
        reuseCount: entry.reuseCount || 0,
        createdAt: entry.createdAt,
        authorAgent: entry.authorId,
      },
      price,
      caller.name,
      currency,
    );

    persistTeamStore();
    json(res, 201, { success: true, listing });
    return true;
  }

  // POST /api/holomesh/marketplace/buy — buy a marketplace listing with USDC/credits settlement
  if (pathname === '/api/holomesh/marketplace/buy' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const body = await parseJsonBody(req);
    const teamId = (body.teamId as string | undefined)?.trim();
    const listingId = (body.listingId as string | undefined)?.trim();
    if (!teamId || !listingId) {
      json(res, 400, { error: 'Missing teamId or listingId' });
      return true;
    }

    const team = teamStore.get(teamId);
    if (!team || !(team as any).knowledgeMarketplace) {
      json(res, 404, { error: 'Marketplace not found for team' });
      return true;
    }
    if (!getTeamMember(team, caller.id)) {
      json(res, 403, { error: 'Not a member of this team' });
      return true;
    }

    const listing = (team as any).knowledgeMarketplace.getListing(listingId);
    if (!listing) {
      json(res, 404, { error: 'Listing not found' });
      return true;
    }

    const result = (team as any).knowledgeMarketplace.buyKnowledge(listingId, caller.name);
    if (!result.success) {
      json(res, 400, { error: result.error || 'Purchase failed' });
      return true;
    }

    paidAccessStore.add(`${caller.id}:${listing.entryId}`);
    transactionLedger.push({
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      buyerWallet: caller.walletAddress || '',
      buyerName: caller.name,
      sellerWallet: '',
      sellerName: listing.seller,
      entryId: listing.entryId,
      entryDomain: listing.preview.domain,
      priceCents: Math.round(listing.price * 100),
      timestamp: new Date().toISOString(),
    });

    persistTeamStore();
    persistSocialStore();
    json(res, 200, { success: true, purchase: result, listing });
    return true;
  }

  // GET /api/holomesh/entry/:id
  if (pathname.match(/^\/api\/holomesh\/entry\/[^/]+$/) && method === 'GET') {
    const entryId = extractParam(url, '/api/holomesh/entry/');
    const caller = resolveRequestingAgent(req, res);
    const results = await c.queryKnowledge(entryId, { limit: 1 });
    const entry = results.find(e => e.id === entryId);
    
    if (!entry) {
      json(res, 404, { error: 'Entry not found' });
      return true;
    }

    const comments = commentStore.get(entryId) || [];
    const isPremium = (entry.price || 0) > 0;
    const paid = isPremium && caller.authenticated && paidAccessStore.has(`${caller.id}:${entryId}`);
    const visibleEntry = {
      ...entry,
      content: isPremium && !paid ? `${entry.content.slice(0, 120)}... [premium — purchase required]` : entry.content,
      premium: isPremium,
      paid,
    };
    json(res, 200, { success: true, entry: visibleEntry, comments, commentCount: comments.length });
    return true;
  }

  // GET /api/holomesh/entry/:id/audit — verify Ed25519 publish signature
  if (pathname.match(/^\/api\/holomesh\/entry\/[^/]+\/audit$/) && method === 'GET') {
    const entryId = extractParam(url, '/api/holomesh/entry/').replace('/audit', '');
    const results = await c.queryKnowledge(entryId, { limit: 1 });
    const entry = results.find((e) => e.id === entryId);
    if (!entry) {
      json(res, 404, { error: 'Entry not found' });
      return true;
    }

    const audit = (entry.metadata as Record<string, unknown> | undefined)?.audit as
      | {
          keyId?: string;
          algorithm?: string;
          signedAt?: string;
          payloadHash?: string;
          signature?: string;
          publicKeyPem?: string;
        }
      | undefined;

    if (!audit?.signature || !audit.publicKeyPem) {
      json(res, 404, { error: 'No audit signature found for entry' });
      return true;
    }

    const payload = buildAuditPayload(entry);
    const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');
    const valid = verifyAuditPayload(payload, audit.signature, audit.publicKeyPem);

    json(res, 200, {
      success: true,
      entryId,
      audit: {
        ...audit,
        payloadHash,
        valid,
      },
    });
    return true;
  }

  // POST /api/holomesh/entry/:id/buy — purchase premium knowledge and credit creator royalty
  if (pathname.match(/^\/api\/holomesh\/entry\/[^/]+\/buy$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const entryId = extractParam(url, '/api/holomesh/entry/').replace('/buy', '');
    const results = await c.queryKnowledge(entryId, { limit: 1 });
    const entry = results.find((e) => e.id === entryId);
    if (!entry) {
      json(res, 404, { error: 'Entry not found' });
      return true;
    }
    if ((entry.price || 0) <= 0) {
      json(res, 400, { error: 'Entry is not premium' });
      return true;
    }
    if (entry.authorId === caller.id) {
      json(res, 400, { error: 'Cannot buy your own entry' });
      return true;
    }

    paidAccessStore.add(`${caller.id}:${entryId}`);

    const seller = [...agentKeyStore.values()].find((a) => a.id === entry.authorId);
    const tx: KnowledgeTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      buyerWallet: caller.walletAddress || '',
      buyerName: caller.name,
      sellerWallet: seller?.walletAddress || '',
      sellerName: entry.authorName,
      entryId,
      entryDomain: entry.domain || 'general',
      priceCents: Math.round((entry.price || 0) * 100),
      timestamp: new Date().toISOString(),
    };
    transactionLedger.push(tx);
    persistSocialStore();

    const creatorShare = Math.round(tx.priceCents * CREATOR_ROYALTY_RATE);
    const platformFee = tx.priceCents - creatorShare;

    json(res, 200, {
      success: true,
      purchased: true,
      entryId,
      royalty: {
        creatorCents: creatorShare,
        platformFeeCents: platformFee,
        creatorRate: CREATOR_ROYALTY_RATE,
      },
      transaction: tx,
    });
    return true;
  }

  // GET /api/holomesh/revenue/creator/:id — creator earnings summary
  if (pathname.match(/^\/api\/holomesh\/revenue\/creator\/[^/]+$/) && method === 'GET') {
    const creatorId = extractParam(url, '/api/holomesh/revenue/creator/');
    const q = parseQuery(url);
    const period = (q.get('period') as 'daily' | 'weekly' | 'monthly' | 'all-time' | null) || 'all-time';
    const agg = buildRevenueAggregator();
    const earnings = agg.getCreatorEarnings(creatorId, period);
    json(res, 200, { success: true, creatorId, period, earnings });
    return true;
  }

  // GET /api/holomesh/revenue/top-creators — leaderboard of creator royalties
  if (pathname === '/api/holomesh/revenue/top-creators' && method === 'GET') {
    const q = parseQuery(url);
    const period = (q.get('period') as 'daily' | 'weekly' | 'monthly' | 'all-time' | null) || 'all-time';
    const limit = parseInt(q.get('limit') || '10', 10);
    const agg = buildRevenueAggregator();
    const top = agg.getTopCreators(period, limit);
    json(res, 200, { success: true, period, creators: top, count: top.length });
    return true;
  }

  // POST /api/holomesh/entry/:id/comment
  if (pathname.match(/^\/api\/holomesh\/entry\/[^/]+\/comment$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const entryId = extractParam(url, '/api/holomesh/entry/');
    const body = await parseJsonBody(req);
    const content = (body.content as string)?.trim();
    if (!content) {
      json(res, 400, { error: 'Missing comment content' });
      return true;
    }

    const comment: StoredComment = {
      id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      entryId,
      authorId: caller.id,
      authorName: caller.name,
      content,
      voteCount: 0,
      createdAt: new Date().toISOString(),
    };

    const list = commentStore.get(entryId) || [];
    list.push(comment);
    commentStore.set(entryId, list);
    persistSocialStore();

    json(res, 201, { success: true, comment });
    return true;
  }

  // POST /api/holomesh/worlds/:id/self-improve/plan — derive trait-graph patches from observations
  if (pathname.match(/^\/api\/holomesh\/worlds\/[^/]+\/self-improve\/plan$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const worldId = extractParam(url, '/api/holomesh/worlds/').replace('/self-improve/plan', '');
    const body = await parseJsonBody(req);
    const observations = Array.isArray(body.observations)
      ? (body.observations as unknown[]).filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean)
      : [];
    if (observations.length === 0) {
      json(res, 400, { error: 'Missing observations[]' });
      return true;
    }

    const goal = (body.goal as string | undefined)?.trim();
    const existing = selfImprovingWorldStore.get(worldId);
    const patches = inferWorldPatches(observations, goal);
    const session: SelfImprovingWorldSession = {
      worldId,
      revision: existing ? existing.revision : 1,
      lastGoal: goal,
      patches,
      updatedAt: new Date().toISOString(),
    };

    selfImprovingWorldStore.set(worldId, session);
    persistSocialStore();
    json(res, 200, { success: true, session, generatedPatches: patches.length });
    return true;
  }

  // POST /api/holomesh/worlds/:id/self-improve/redeploy — apply selected patches and bump revision
  if (pathname.match(/^\/api\/holomesh\/worlds\/[^/]+\/self-improve\/redeploy$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;

    const worldId = extractParam(url, '/api/holomesh/worlds/').replace('/self-improve/redeploy', '');
    const body = await parseJsonBody(req);
    const session = selfImprovingWorldStore.get(worldId);
    if (!session) {
      json(res, 404, { error: 'No self-improvement plan found for world' });
      return true;
    }

    const patchIds = Array.isArray(body.patchIds)
      ? (body.patchIds as unknown[]).filter((x): x is string => typeof x === 'string')
      : session.patches.map((p) => p.id);
    const applied = session.patches.filter((p) => patchIds.includes(p.id));

    const next: SelfImprovingWorldSession = {
      ...session,
      revision: session.revision + 1,
      patches: session.patches,
      updatedAt: new Date().toISOString(),
    };
    selfImprovingWorldStore.set(worldId, next);
    persistSocialStore();

    json(res, 200, {
      success: true,
      worldId,
      redeployedBy: caller.name,
      revision: next.revision,
      appliedPatches: applied,
      count: applied.length,
    });
    return true;
  }

  // GET /api/holomesh/worlds/:id/self-improve — inspect latest self-improvement session
  if (pathname.match(/^\/api\/holomesh\/worlds\/[^/]+\/self-improve$/) && method === 'GET') {
    const worldId = extractParam(url, '/api/holomesh/worlds/').replace('/self-improve', '');
    const session = selfImprovingWorldStore.get(worldId);
    if (!session) {
      json(res, 404, { error: 'No self-improvement session found' });
      return true;
    }
    json(res, 200, { success: true, session });
    return true;
  }

  return false;
}
