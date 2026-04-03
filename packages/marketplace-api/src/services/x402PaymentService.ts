import { Request, Response, NextFunction } from 'express';
import { verifyMessage, createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem';
import { base } from 'viem/chains';

/**
 * x402PaymentService - M2M (Machine-to-Machine) Economy Middleware
 *
 * Intercepts requests that require autonomous payment (like an AI Agent buying a sword
 * or a user triggering a paid generation).
 *
 * If no valid payment receipt is found, it throws an HTTP 402 Payment Required
 * alongside an EIP-712 payment challenge.
 */

const ERC20_TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

/** USDC has 6 decimals */
const USDC_DECIMALS = 6;

// ─── Rate Limiter (in-memory sliding window) ─────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  let entry = rateLimitStore.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    rateLimitStore.set(key, entry);
  }

  // Prune timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (entry.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  entry.timestamps.push(now);
  return false;
}

// Periodic cleanup to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (entry.timestamps.length === 0) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60_000);

// ─── Nonce Store (replay attack prevention) ──────────────────────────────────

/** Set of consumed txHash values to prevent replay attacks */
const consumedTxHashes = new Set<string>();

// ─── Receipt Validation ──────────────────────────────────────────────────────

interface ValidatedReceipt {
  txHash: string;
  signature: string;
  agentWallet: string;
}

function validateReceipt(raw: unknown): ValidatedReceipt | null {
  if (typeof raw !== 'object' || raw === null) return null;

  const obj = raw as Record<string, unknown>;

  if (typeof obj.txHash !== 'string' || !obj.txHash) return null;
  if (typeof obj.signature !== 'string' || !obj.signature) return null;
  if (typeof obj.agentWallet !== 'string' || !obj.agentWallet) return null;

  // Validate txHash format: must be 0x-prefixed 64-char hex
  if (!/^0x[0-9a-fA-F]{64}$/.test(obj.txHash)) return null;

  // Validate wallet address format: must be 0x-prefixed 40-char hex
  if (!/^0x[0-9a-fA-F]{40}$/.test(obj.agentWallet)) return null;

  // Validate signature format: must be 0x-prefixed hex
  if (!/^0x[0-9a-fA-F]+$/.test(obj.signature)) return null;

  return {
    txHash: obj.txHash,
    signature: obj.signature,
    agentWallet: obj.agentWallet,
  };
}

// ─── On-Chain Verification ───────────────────────────────────────────────────

/**
 * Verify that a transaction exists on-chain, was successful,
 * transfers >= costInWei to the recipientWallet.
 */
async function verifyOnChain(
  txHash: `0x${string}`,
  recipientWallet: string,
  costInWei: bigint,
  rpcUrl?: string
): Promise<{ verified: boolean; error?: string }> {
  try {
    const client = createPublicClient({
      chain: base,
      transport: http(rpcUrl ?? process.env.BASE_RPC_URL),
    });

    const receipt = await client.getTransactionReceipt({ hash: txHash });

    // Transaction must be successful
    if (receipt.status !== 'success') {
      return { verified: false, error: 'Transaction failed on-chain' };
    }

    // Decode Transfer events and sum amounts to recipient
    let totalToRecipient = 0n;

    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: [ERC20_TRANSFER_EVENT],
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName === 'Transfer') {
          const args = decoded.args as { from: string; to: string; value: bigint };
          if (args.to.toLowerCase() === recipientWallet.toLowerCase()) {
            totalToRecipient += args.value;
          }
        }
      } catch {
        // Not a Transfer event, skip
        continue;
      }
    }

    // Verify amount is sufficient
    if (totalToRecipient < costInWei) {
      return { verified: false, error: 'Insufficient payment amount' };
    }

    return { verified: true };
  } catch {
    return { verified: false, error: 'On-chain verification failed' };
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export class x402PaymentService {
  /**
   * Middleware to enforce HTTP 402 payments on any route.
   *
   * @param costInWei Required cost (e.g. 0.0001 ETH)
   * @param recipientWallet The marketplace or creator receiving the funds
   */
  static requirePayment(costInWei: bigint, recipientWallet: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Rate limiting: prevent signature-verification DoS
        const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown';
        if (isRateLimited(clientIp)) {
          res.status(429).json({ error: 'Too many requests. Please try again later.' });
          return;
        }

        const paymentReceipt = req.headers['x-payment-receipt'];

        // 1. No receipt provided -> Challenge the Agent
        if (!paymentReceipt) {
          res.status(402).json({
            error: 'Payment Required',
            message: 'This endpoint requires an autonomous M2M payment.',
            challenge: {
              cost: costInWei.toString(),
              currency: 'ETH',
              network: 'base-sepolia',
              recipient: recipientWallet,
              memo: `Payment for HoloScript Asset: ${req.path}`,
            },
          });
          return;
        }

        // 2. Receipt provided -> Parse and validate input
        let parsed: unknown;
        try {
          parsed = JSON.parse(paymentReceipt as string);
        } catch {
          res.status(400).json({ error: 'Malformed payment receipt' });
          return;
        }

        const receipt = validateReceipt(parsed);
        if (!receipt) {
          res.status(400).json({ error: 'Invalid receipt format or missing required fields' });
          return;
        }

        // 3. Replay attack prevention: reject reused txHashes
        if (consumedTxHashes.has(receipt.txHash)) {
          res.status(409).json({ error: 'Transaction has already been used for payment' });
          return;
        }

        // 4. On-chain verification: confirm tx exists, succeeded, and paid enough
        const onChainResult = await verifyOnChain(
          receipt.txHash as `0x${string}`,
          recipientWallet,
          costInWei
        );

        if (!onChainResult.verified) {
          res.status(402).json({ error: 'On-chain payment verification failed' });
          return;
        }

        // 5. Verify the cryptographic signature came from the stated wallet
        // Canonicalize path to prevent path traversal in signed message
        const canonicalPath = req.path.replace(/\/+/g, '/').replace(/\.\./g, '');
        const isValid = await verifyMessage({
          address: receipt.agentWallet as `0x${string}`,
          message: `Authorized payment of ${costInWei.toString()} wei for ${canonicalPath}`,
          signature: receipt.signature as `0x${string}`,
        });

        if (!isValid) {
          res.status(401).json({ error: 'Payment signature verification failed' });
          return;
        }

        // 6. Mark txHash as consumed (prevent replay)
        consumedTxHashes.add(receipt.txHash);

        // 7. Payment Verified -> Proceed to Asset Delivery
        req.app.locals.verifiedPayer = receipt.agentWallet;
        next();
      } catch (err) {
        // Sanitized error: log full error internally, return generic message
        console.error('[x402] Payment verification error:', err);
        res.status(500).json({ error: 'Payment verification failed' });
      }
    };
  }

  /**
   * Clear the consumed nonces set (for testing purposes only).
   * @internal
   */
  static _resetNonces(): void {
    consumedTxHashes.clear();
  }

  /**
   * Check if a txHash has been consumed (for testing/debugging).
   * @internal
   */
  static _isConsumed(txHash: string): boolean {
    return consumedTxHashes.has(txHash);
  }
}
