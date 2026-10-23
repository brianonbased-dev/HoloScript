/**
 * Claim-link + replay MCP tools (A19, SPEC-absorb-paper-ingest-20261023 a/b).
 *
 * holo_claim_links   - claimId -> code symbols, receipts, status, mismatches;
 *                      filePath|symbol -> claims that cite it.
 * holo_replay_answer - re-run the keyword->graph->embed->llm cascade over a
 *                      local doc graph and check it against the pinned
 *                      graphSnapshotHash + gitCommitHash.
 * Local only: filesystem + git; no network, no Railway, no remote embeddings.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { resolve } from 'node:path';
import {
  buildDocGraph,
  gitHead,
  loadPaperClaims,
  queryClaimLinks,
  runCascade,
  replayAnswer,
  type RepoRoots,
} from '../engine/paper';
import { computeGraphSnapshotHash } from '../engine/AnswerProvenance';

export const claimLinkTools: Tool[] = [
  {
    name: 'holo_claim_links',
    description:
      'Paper claim provenance. With {claimId} (e.g. "claim:p5:4") returns the code symbols, receipt files (sha256 + commit), ledger status and any mismatches between the receipt and the claim. With {filePath} or {symbol} returns the claims that cite it. Reads a LEDGER.md (and optional .tex) from local disk.',
    inputSchema: {
      type: 'object',
      properties: {
        claimId: { type: 'string', description: 'claim:<paper>:<row#>' },
        filePath: { type: 'string', description: 'Repo path, e.g. HoloScript/packages/... ' },
        symbol: { type: 'string', description: 'Code symbol name' },
        ledgerPath: { type: 'string', description: 'Absolute or cwd-relative path to LEDGER.md' },
        texPath: { type: 'string', description: 'Optional paper .tex path' },
        roots: {
          type: 'object',
          description: 'Map of ledger path prefixes to local checkouts, e.g. {"HoloScript": "...", "ai-ecosystem": "..."}',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['ledgerPath'],
    },
  },
  {
    name: 'holo_replay_answer',
    description:
      'Replay a codebase answer deterministically. Rebuilds the local doc graph from {paths}, checks it against {graphSnapshotHash} and {gitCommitHash}, re-runs the chained keyword->graph->embed->llm cascade for {query}, and reports whether the replay matches (and, if the chain was tampered, the first failing layer).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        graphSnapshotHash: { type: 'string' },
        gitCommitHash: { type: 'string' },
        paths: { type: 'array', items: { type: 'string' }, description: 'Doc dirs/files to graph (.md/.tex)' },
        base: { type: 'string', description: 'Base dir for relative paths (default cwd)' },
        stored: { type: 'object', description: 'Optional stored cascade run to compare against' },
      },
      required: ['query', 'graphSnapshotHash', 'gitCommitHash', 'paths'],
    },
  },
];

function rootsFrom(args: Record<string, unknown>): RepoRoots {
  const r = (args.roots ?? {}) as Record<string, string>;
  const out: RepoRoots = {};
  for (const [k, v] of Object.entries(r)) if (typeof v === 'string') out[k] = resolve(v);
  return out;
}

export async function handleClaimLinkTool(name: string, args: Record<string, unknown>): Promise<unknown | null> {
  if (name === 'holo_claim_links') {
    if (typeof args.ledgerPath !== 'string') return { error: 'ledgerPath is required' };
    const ingest = loadPaperClaims({
      ledgerPath: resolve(args.ledgerPath),
      texPath: typeof args.texPath === 'string' ? resolve(args.texPath) : undefined,
      roots: rootsFrom(args),
    });
    const q = {
      claimId: typeof args.claimId === 'string' ? args.claimId : undefined,
      filePath: typeof args.filePath === 'string' ? args.filePath : undefined,
      symbol: typeof args.symbol === 'string' ? args.symbol : undefined,
    };
    if (!q.claimId && !q.filePath && !q.symbol) return { error: 'one of claimId, filePath, symbol is required' };
    return queryClaimLinks(ingest.graph, q);
  }
  if (name === 'holo_replay_answer') {
    const base = resolve(typeof args.base === 'string' ? args.base : process.cwd());
    const paths = Array.isArray(args.paths) ? (args.paths as string[]).map((p) => resolve(base, p)) : [];
    if (!paths.length || typeof args.query !== 'string') return { error: 'query and paths are required' };
    const { graph } = await buildDocGraph(paths, base);
    const currentCommit = gitHead(base);
    const snapshot = computeGraphSnapshotHash(graph.serialize());
    const pins = {
      graphSnapshotHash: { expected: args.graphSnapshotHash, actual: snapshot, ok: args.graphSnapshotHash === snapshot },
      gitCommitHash: { expected: args.gitCommitHash, actual: currentCommit, ok: args.gitCommitHash === currentCommit },
    };
    if (args.stored && typeof args.stored === 'object') {
      return { pins, ...replayAnswer(graph, args.stored as never, currentCommit) };
    }
    const run = runCascade(graph, args.query, { gitCommitHash: currentCommit });
    return { pins, deterministic: pins.graphSnapshotHash.ok && pins.gitCommitHash.ok, run };
  }
  return null;
}