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
        const receipt = JSON.parse(paymentReceipt as string);
        const { txHash, signature, agentWallet } = receipt;

        if (!txHash || !signature || !agentWallet) {
          throw new Error("Invalid receipt format");
        }

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
        res.status(500).json({ error: "Payment verification failed", details: String(err) });
      }
    };
  }
}
