import { Request, Response, NextFunction } from 'express';
import { verifyMessage } from 'viem';

/**
 * x402PaymentService - M2M (Machine-to-Machine) Economy Middleware
 * 
 * Intercepts requests that require autonomous payment (like an AI Agent buying a sword
 * or a user triggering a paid generation). 
 * 
 * If no valid payment receipt is found, it throws an HTTP 402 Payment Required
 * alongside an EIP-712 payment challenge.
 */
export class x402PaymentService {
  /**
   * Middleware to enforce HTTP 402 payments on any route.
   * 
   * @param costInWei Required cost (e.g. 0.0001 ETH)
   * @param recipientWallet The marketplace or creator receiving the funds
   */
  static requirePayment(costInWei: bigint, recipientWallet: string) {
    // SECURITY [MEDIUM] NO RATE LIMITING: This middleware performs an async cryptographic
    // operation per request. Apply express-rate-limit (or equivalent) on routes that use
    // requirePayment to prevent signature-verification DoS. See docs/security/x402-threat-model.md §4.
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const paymentReceipt = req.headers['x-payment-receipt'];

        // 1. No receipt provided -> Challenge the Agent
        if (!paymentReceipt) {
           res.status(402).json({
            error: "Payment Required",
            message: "This endpoint requires an autonomous M2M payment.",
            challenge: {
              cost: costInWei.toString(),
              currency: "ETH",
              network: "base-sepolia",
              recipient: recipientWallet,
              memo: `Payment for HoloScript Asset: ${req.path}`
            }
          });
          return;
        }

        // 2. Receipt provided -> Verify the Agent's signature & transaction
        // (In a real production environment, we would ping the RPC to confirm the txHash)
        // SECURITY [HIGH] REPLAY ATTACK: A valid signature+txHash can be reused for any number
        // of subsequent requests. Add a nonce or store processed txHashes in Redis/DB and reject
        // duplicates. See docs/security/x402-threat-model.md §3.
        let receipt: { txHash?: unknown; signature?: unknown; agentWallet?: unknown };
        try {
          // SECURITY [MEDIUM] UNTRUSTED INPUT: parse+validate before destructuring.
          const parsed = JSON.parse(paymentReceipt as string);
          if (typeof parsed !== 'object' || parsed === null) throw new Error('Receipt must be a JSON object');
          receipt = parsed;
        } catch {
          res.status(400).json({ error: 'Malformed payment receipt' });
          return;
        }
        const { txHash, signature, agentWallet } = receipt;

        if (!txHash || !signature || !agentWallet) {
          throw new Error("Invalid receipt format");
        }

        // SECURITY [CRITICAL] MISSING ON-CHAIN VERIFICATION: txHash is accepted but never
        // verified against the blockchain. An attacker can present a valid signature with a
        // fabricated or zero-value txHash. Before calling verifyMessage, confirm the tx exists,
        // targets `recipientWallet`, and transfers >= costInWei on the expected network.
        // See docs/security/x402-threat-model.md §2.

        // SECURITY [LOW] SIGNED MESSAGE INCLUDES req.path: the signed message contains the
        // request path which is user-controlled. Ensure routes are canonical (no path traversal)
        // before constructing the signed message string.

        // Verify the signature came from this Agent's stated wallet
        const isValid = await verifyMessage({
          address: agentWallet as `0x${string}`,
          message: `Authorized payment of ${costInWei.toString()} wei for ${req.path}`,
          signature: signature as `0x${string}`
        });

        if (!isValid) {
          res.status(401).json({ error: "Cryptographic signature validation failed." });
          return;
        }

        // 3. Payment Verified -> Proceed to Asset Delivery
        req.app.locals.verifiedPayer = agentWallet;
        next();

      } catch (err) {
        // SECURITY [LOW] ERROR DETAIL LEAK: Do not expose internal error strings to callers.
        // Log the full error server-side; return a generic message over the wire.
        console.error('[x402] Payment verification error:', err);
        res.status(500).json({ error: "Payment verification failed" });
      }
    };
  }
}
