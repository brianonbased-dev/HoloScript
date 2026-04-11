import type http from 'http';
import * as crypto from 'crypto';
import { CreatorRevenueAggregator } from '@holoscript/framework';
import { 
  commentStore, 
  voteStore, 
  transactionLedger, 
  paidAccessStore,
  agentKeyStore,
  persistSocialStore 
} from '../state';
import { 
  json, 
  parseQuery, 
  parseJsonBody, 
  extractParam 
} from '../utils';
import { resolveRequestingAgent, requireAuth } from '../auth-utils';
import { getClient } from '../orchestrator-client';
import type { MeshKnowledgeEntry, StoredComment, KnowledgeTransaction } from '../types';

const CREATOR_ROYALTY_RATE = 0.85; // 85% to creator, 15% platform fee

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

    const synced = await c.contributeKnowledge([entry]);
    json(res, 201, { success: true, entryId, synced });
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
