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
import type { MeshKnowledgeEntry, StoredComment, KnowledgeTransaction } from '../types';

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

  return false;
}
