/**
 * Revenue Splitter — Import-Chain Royalty Calculator
 *
 * Pure math module that calculates how revenue flows through the
 * import chain when someone collects a HoloScript composition.
 * No blockchain dependency — deterministic calculation from provenance data.
 *
 * Revenue flow for a collect:
 *   1. Platform fee (default 2.5%)
 *   2. Referral reward (default 2%, if referrer exists)
 *   3. Import royalties (5% per level, max 3 levels, split equally among imports)
 *   4. Creator gets remainder
 *
 * @module revenue-splitter
 */

import type {
  RevenueFlow,
  RevenueDistribution,
  ImportChainNode,
  RevenueCalculatorOptions,
} from './protocol-types';

import { PROTOCOL_CONSTANTS } from './protocol-types';

// =============================================================================
// REVENUE DISTRIBUTION
// =============================================================================

/**
 * Calculate revenue distribution for a collect event.
 *
 * Given a collect price, the composition's import chain, and the creator,
 * compute who gets paid what.
 *
 * @param collectPrice - Total price in wei
 * @param creator - Creator identifier (address or @username)
 * @param importChain - Resolved import chain nodes (depth 1 = direct imports)
 * @param options - Override default fee/royalty rates
 * @returns Complete revenue distribution with all flows
 */
export function calculateRevenueDistribution(
  collectPrice: bigint,
  creator: string,
  importChain: ImportChainNode[],
  options: RevenueCalculatorOptions = {}
): RevenueDistribution {
  const {
    platformFeeBps = PROTOCOL_CONSTANTS.PLATFORM_FEE_BPS,
    importRoyaltyBps = PROTOCOL_CONSTANTS.IMPORT_ROYALTY_BPS,
    maxImportDepth = PROTOCOL_CONSTANTS.MAX_IMPORT_DEPTH,
    referralBps = PROTOCOL_CONSTANTS.DEFAULT_REFERRAL_BPS,
    referrer,
    platformAddress = 'platform',
  } = options;

  const flows: RevenueFlow[] = [];

  if (collectPrice === 0n) {
    return { totalPrice: 0n, flows: [] };
  }

  const bpsDenom = BigInt(PROTOCOL_CONSTANTS.BPS_DENOMINATOR);
  let remaining = collectPrice;

  // 1. Platform fee
  const platformFee = (collectPrice * BigInt(platformFeeBps)) / bpsDenom;
  if (platformFee > 0n) {
    flows.push({
      recipient: platformAddress,
      amount: platformFee,
      reason: 'platform',
      bps: platformFeeBps,
    });
    remaining -= platformFee;
  }

  // 2. Referral reward (only if referrer exists)
  if (referrer) {
    const referralAmount = (collectPrice * BigInt(referralBps)) / bpsDenom;
    if (referralAmount > 0n) {
      flows.push({
        recipient: referrer,
        amount: referralAmount,
        reason: 'referral',
        bps: referralBps,
      });
      remaining -= referralAmount;
    }
  }

  // 3. Import royalties — 5% per level, split equally among imports at each level
  const flattenedByDepth = flattenImportsByDepth(importChain, maxImportDepth);

  for (const [depth, nodes] of flattenedByDepth.entries()) {
    if (nodes.length === 0) continue;

    const levelRoyalty = (collectPrice * BigInt(importRoyaltyBps)) / bpsDenom;
    const perImportRoyalty = levelRoyalty / BigInt(nodes.length);

    // Distribute dust to first import at this level
    const dust = levelRoyalty - perImportRoyalty * BigInt(nodes.length);

    for (let i = 0; i < nodes.length; i++) {
      const amount = i === 0 ? perImportRoyalty + dust : perImportRoyalty;
      if (amount > 0n) {
        flows.push({
          recipient: nodes[i].author,
          amount,
          reason: 'import_royalty',
          depth,
          bps: Math.floor(importRoyaltyBps / nodes.length),
        });
        remaining -= amount;
      }
    }
  }

  // 4. Creator gets remainder
  if (remaining > 0n) {
    const creatorBps = PROTOCOL_CONSTANTS.BPS_DENOMINATOR
      - platformFeeBps
      - (referrer ? referralBps : 0)
      - (importRoyaltyBps * flattenedByDepth.size);

    flows.push({
      recipient: creator,
      amount: remaining,
      reason: 'creator',
      bps: Math.max(creatorBps, 0),
    });
  }

  return { totalPrice: collectPrice, flows };
}

// =============================================================================
// IMPORT CHAIN RESOLUTION
// =============================================================================

/**
 * Flatten the import chain tree into a map of depth → nodes.
 * Deduplicates by contentHash (same import at different paths counted once).
 */
function flattenImportsByDepth(
  chain: ImportChainNode[],
  maxDepth: number
): Map<number, ImportChainNode[]> {
  const byDepth = new Map<number, ImportChainNode[]>();
  const seen = new Set<string>();

  function walk(nodes: ImportChainNode[], depth: number): void {
    if (depth > maxDepth) return;

    for (const node of nodes) {
      if (seen.has(node.contentHash)) continue;
      seen.add(node.contentHash);

      const list = byDepth.get(depth) ?? [];
      list.push(node);
      byDepth.set(depth, list);

      if (node.children.length > 0) {
        walk(node.children, depth + 1);
      }
    }
  }

  walk(chain, 1);
  return byDepth;
}

/**
 * Build an import chain from a provenance block using a resolver function.
 * The resolver looks up a ProtocolRecord by content hash.
 *
 * @param imports - Direct imports from the composition's provenance
 * @param resolver - Async function that fetches a record by content hash
 * @param maxDepth - Maximum depth to resolve (default: PROTOCOL_CONSTANTS.MAX_IMPORT_DEPTH)
 * @returns Resolved import chain tree
 */
export async function resolveImportChain(
  imports: Array<{ hash?: string; author?: string; path: string }>,
  resolver: (contentHash: string) => Promise<{ importHashes: string[]; author: string } | null>,
  maxDepth: number = PROTOCOL_CONSTANTS.MAX_IMPORT_DEPTH
): Promise<ImportChainNode[]> {
  const seen = new Set<string>();

  async function resolve(
    importList: Array<{ hash?: string; author?: string; path: string }>,
    depth: number
  ): Promise<ImportChainNode[]> {
    if (depth > maxDepth) return [];

    const nodes: ImportChainNode[] = [];

    for (const imp of importList) {
      const hash = imp.hash;
      if (!hash || seen.has(hash)) continue;
      seen.add(hash);

      const record = await resolver(hash);
      const author = record?.author ?? imp.author ?? 'unknown';

      const children = record && depth < maxDepth
        ? await resolve(
          record.importHashes.map(h => ({ hash: h, path: '', author: '' })),
          depth + 1
        )
        : [];

      nodes.push({
        contentHash: hash,
        author,
        depth,
        children,
      });
    }

    return nodes;
  }

  return resolve(imports, 1);
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

/**
 * Format a revenue distribution for human-readable display.
 * Returns an array of strings like:
 *   "92.5% → @brian (creator)"
 *   "5.0% → @maria (import royalty, depth 1)"
 *   "2.5% → platform"
 */
export function formatRevenueDistribution(dist: RevenueDistribution): string[] {
  if (dist.totalPrice === 0n) return ['Free collect — no revenue distribution'];

  return dist.flows.map(flow => {
    const pct = (Number(flow.amount) / Number(dist.totalPrice) * 100).toFixed(1);
    const depthLabel = flow.depth ? `, depth ${flow.depth}` : '';
    return `${pct}% → ${flow.recipient} (${flow.reason}${depthLabel})`;
  });
}

/**
 * Convert ETH string to wei (bigint).
 */
export function ethToWei(eth: string): bigint {
  const parts = eth.split('.');
  const whole = parts[0] || '0';
  const fraction = (parts[1] || '').padEnd(18, '0').slice(0, 18);
  return BigInt(whole) * 10n ** 18n + BigInt(fraction);
}

/**
 * Convert wei (bigint) to ETH string.
 */
export function weiToEth(wei: bigint): string {
  const str = wei.toString().padStart(19, '0');
  const whole = str.slice(0, str.length - 18) || '0';
  const fraction = str.slice(str.length - 18).replace(/0+$/, '') || '0';
  return `${whole}.${fraction}`;
}
