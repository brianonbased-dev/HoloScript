/**
 * @fileoverview x402 Payment Service
 * @module @holoscript/marketplace-api
 *
 * TODO: CRITICAL - Implement x402 HTTP 402 Payment Protocol Service
 *
 * PURPOSE:
 * Handle HTTP 402 "Payment Required" protocol for machine-to-machine payments
 * across Hololand's 3-layer economy (AR → VRR → VR).
 *
 * VISION:
 * x402 enables frictionless AI agent payments for VR experiences. Users pay once,
 * AI agents autonomously pay for micro-services. Example: User pays $50 for VR
 * menu, AI agent autonomously pays $0.01 for each ingredient detail fetch.
 *
 * REQUIREMENTS:
 * 1. HTTP 402 Status Code: Return 402 + WWW-Authenticate header for paywalled endpoints
 * 2. Multiple Facilitators: Support Coinbase CDP, PayAI, Meridian, x402.rs
 * 3. Multi-Chain: Base L2 (primary), Ethereum, Solana
 * 4. Multi-Asset: USDC (primary), ETH, SOL, custom tokens
 * 5. Gasless Transactions: Coinbase subsidizes Base L2 gas (~$0.01/tx)
 * 6. State Persistence: Payment receipts → database, blockchain verification
 * 7. Layer Pricing: AR free → VRR $5-20 → VR $50-500
 * 8. AI Agent Support: AgentKit integration for autonomous payments
 *
 * EXAMPLE x402 FLOW:
 * 1. User requests VRR access: GET /api/vrr/phoenix-brew-twin
 * 2. Server checks payment status → unpaid
 * 3. Server returns 402 Payment Required:
 *    ```
 *    HTTP/1.1 402 Payment Required
 *    WWW-Authenticate: x402 facilitator="https://cdp.coinbase.com/x402" price="5.00" asset="USDC" network="base"
 *    Content-Type: application/json
 *
 *    {
 *      "error": "Payment required",
 *      "price": 5.00,
 *      "asset": "USDC",
 *      "network": "base",
 *      "facilitator": "https://cdp.coinbase.com/x402",
 *      "payment_id": "pay_abc123"
 *    }
 *    ```
 * 4. Client (or AI agent) pays via facilitator
 * 5. Facilitator confirms payment → callback to server
 * 6. Server grants access → returns VRR content
 *
 * INTEGRATION POINTS:
 * - Coinbase AgentKit SDK (packages/core/src/agents/AgentKitIntegration.ts)
 * - VRRCompiler.ts (@x402_paywall trait)
 * - ARCompiler.ts (AR → VRR upgrade payment)
 * - Supabase (payment receipts, user subscriptions)
 * - Base L2 blockchain (transaction verification)
 *
 * RESEARCH REFERENCES:
 * - HOLOLAND_INTEGRATION_TODOS.md (x402PaymentService section)
 * - uAA2++_Protocol/7.AUTONOMIZE/autonomous-todos/TODO-1_x402-adoption-validation.md (x402 is open source)
 * - uAA2++_Protocol/7.AUTONOMIZE/autonomous-todos/TODO-3_gasless-subsidy-economics.md (profitable model)
 * - uAA2++_Protocol/5.GROW P.028: "Machine Economy Flywheel"
 *
 * ARCHITECTURE DECISIONS:
 * 1. Why x402 over Stripe/traditional payments?
 *    - x402: Machine-to-machine, no user intervention, permissionless
 *    - Stripe: Requires user authentication, card on file, 2.9% + $0.30 fees
 *    - Decision: x402 for AI agents, Stripe for human fallback
 *
 * 2. Why Base L2 over Ethereum L1?
 *    - Base L2: ~$0.01/tx (gasless subsidy), 2s confirmation
 *    - Ethereum L1: ~$5-50/tx, 15s confirmation
 *    - Decision: Base L2 primary, Ethereum L1 for high-value only
 *
 * 3. Why USDC over native crypto?
 *    - USDC: Stable, predictable pricing ($5 = $5 tomorrow)
 *    - ETH/SOL: Volatile, $5 today = $3 or $7 tomorrow
 *    - Decision: USDC for business payments, ETH/SOL for trading
 *
 * 4. Payment Receipt Storage:
 *    - On-chain: Transaction hash, timestamp, amount, payer address
 *    - Off-chain (Supabase): User metadata, content access grants, expiry
 *    - Hybrid: Verify on-chain, fast lookup off-chain
 *
 * IMPLEMENTATION TASKS:
 * [x] Define x402PaymentServiceOptions interface
 * [ ] Implement return402Response() - HTTP 402 response with WWW-Authenticate header
 * [ ] Implement verifyPayment() - Verify transaction on blockchain
 * [ ] Implement grantAccess() - Grant content access after payment
 * [ ] Implement facilitatorCallback() - Handle payment confirmation webhooks
 * [ ] Implement multiChainSupport() - Base, Ethereum, Solana transaction verification
 * [ ] Implement gaslessSubsidy() - Coinbase Base L2 gasless transaction support
 * [ ] Implement agentKitIntegration() - AI agent autonomous payment handling
 * [ ] Implement receiptStorage() - Store payment receipts in Supabase
 * [ ] Implement subscriptionManagement() - Recurring VR access passes
 * [ ] Add tests (x402PaymentService.test.ts)
 * [ ] Add E2E test (simulate AR → VRR payment flow)
 * [ ] Add webhook endpoint (/api/payments/x402/callback)
 *
 * ESTIMATED COMPLEXITY: 9/10 (very high - multi-chain, blockchain verification, webhook handling)
 * ESTIMATED TIME: 2 weeks (includes testing, security audit, documentation)
 * PRIORITY: CRITICAL (blocks all paid features, revenue generation)
 *
 * BLOCKED BY:
 * - Nothing (can implement now, x402 protocol is open source)
 *
 * UNBLOCKS:
 * - VRRCompiler.ts (@x402_paywall trait)
 * - ARCompiler.ts (AR → VRR upgrade)
 * - Business revenue (all paid VRR/VR content)
 * - AI agent economy (autonomous payments)
 *
 * PRICING STRATEGY:
 * - AR Layer: FREE (teaser, QR scans, business discovery)
 * - VRR Layer: $5-20 (quests, 1:1 twins, business interactions)
 * - VR Layer: $50-500 (full Hololand immersion, premium menus)
 * - Micro-payments: $0.01-0.10 (AI agent API calls, asset fetches)
 *
 * EXAMPLE API USAGE:
 * ```typescript
 * // Middleware: Protect VRR endpoint with x402 paywall
 * app.get('/api/vrr/:twin_id', x402PaymentService.requirePayment({
 *   price: 5.00,
 *   asset: 'USDC',
 *   network: 'base',
 *   facilitator: 'coinbase'
 * }), async (req, res) => {
 *   const twin = await getVRRTwin(req.params.twin_id);
 *   res.json(twin);
 * });
 *
 * // AI agent pays for VRR access
 * const agentWallet = new AgentKitWallet({ network: 'base' });
 * const payment = await agentWallet.pay({
 *   endpoint: 'https://api.hololand.io/api/vrr/phoenix-brew',
 *   price: 5.00,
 *   asset: 'USDC'
 * });
 * // → x402PaymentService receives payment, grants access
 * ```
 */

import type { Request, Response, NextFunction } from 'express';

export interface x402PaymentServiceOptions {
  facilitators: Array<{
    name: 'coinbase' | 'payai' | 'meridian' | 'x402rs';
    endpoint: string;
    api_key?: string;
  }>;
  networks: Array<{
    name: 'base' | 'ethereum' | 'solana';
    rpc_url: string;
    chain_id: number;
  }>;
  assets: Array<{
    symbol: 'USDC' | 'ETH' | 'SOL';
    contract_address?: string; // ERC-20 token address
  }>;
  gasless: {
    enabled: boolean;
    subsidy_provider: 'coinbase' | 'custom';
    max_gas_price: number; // wei
  };
  receipt_storage: {
    provider: 'supabase' | 'postgresql';
    table: string;
  };
  webhook_endpoint: string; // /api/payments/x402/callback
}

export interface x402PaymentRequest {
  payment_id: string;
  price: number;
  asset: 'USDC' | 'ETH' | 'SOL';
  network: 'base' | 'ethereum' | 'solana';
  facilitator: string; // URL
  content_id: string; // VRR twin ID, VR menu ID, etc.
  payer_address?: string; // Optional (for user payments)
  agent_id?: string; // Optional (for AI agent payments)
}

export interface x402PaymentReceipt {
  payment_id: string;
  transaction_hash: string;
  block_number: number;
  timestamp: number;
  payer_address: string;
  recipient_address: string;
  amount: number;
  asset: string;
  network: string;
  content_id: string;
  access_granted: boolean;
  access_expires_at?: number; // Unix timestamp (for subscriptions)
}

export class x402PaymentService {
  private options: x402PaymentServiceOptions;

  constructor(options: x402PaymentServiceOptions) {
    this.options = options;
  }

  // Express middleware: Require payment before accessing endpoint
  requirePayment(config: { price: number; asset: string; network: string }) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        // 1. Check if request has valid payment receipt
        const paymentId = req.headers['x-payment-id'] as string;
        if (paymentId) {
          const receipt = await this.verifyPayment(paymentId);
          if (receipt && receipt.access_granted) {
            (req as any).paymentReceipt = receipt;
            return next();
          }
        }

        // 2. No payment → return 402 with WWW-Authenticate header
        return this.return402Response(res, {
          payment_id: `x402_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          price: config.price,
          asset: config.asset as any,
          network: config.network as any,
          facilitator: this.selectFacilitator(config.network),
          content_id: req.params.twin_id || req.params.menu_id || 'unknown_content',
        });
      } catch (err) {
        return res.status(500).json({ error: 'Payment verification error' });
      }
    };
  }

  private selectFacilitator(network: string): string {
    const facilitator = this.options.facilitators[0]; // Simplistic fallback
    return facilitator ? facilitator.endpoint : 'https://cdp.coinbase.com/x402';
  }

  // Return HTTP 402 Payment Required response
  return402Response(res: Response, request: x402PaymentRequest) {
    res
      .status(402)
      .header(
        'WWW-Authenticate',
        `x402 facilitator="${request.facilitator}" price="${request.price}" asset="${request.asset}" network="${request.network}"`
      )
      .json({
        error: 'Payment required',
        price: request.price,
        asset: request.asset,
        network: request.network,
        facilitator: request.facilitator,
        payment_id: request.payment_id,
        content_id: request.content_id,
      });
  }

  // Verify payment on blockchain
  async verifyPayment(paymentId: string): Promise<x402PaymentReceipt | null> {
    try {
      // 1. Lookup payment in database
      const payment = await this.getPaymentFromDB(paymentId);
      if (!payment) return null;

      // 2. Mock verification of transaction on blockchain
      // In a real implementation this would use viem or ethers.js
      const txReceipt = await this.getBlockchainReceipt(payment.transaction_hash, payment.network);

      // 3. Validate amount, recipient, timestamp
      // Assuming a mock recipient check passing
      if (txReceipt.amount >= payment.amount) {
        return {
          ...payment,
          access_granted: true,
        };
      }
      return null;
    } catch (e) {
      console.error('Payment verification failed', e);
      return null;
    }
  }

  private async getPaymentFromDB(paymentId: string): Promise<x402PaymentReceipt | null> {
    // Stub implementation hooking into Supabase concept
    // Normally: supabase.from(this.options.receipt_storage.table).select().eq('payment_id', paymentId)
    return null;
  }

  private async getBlockchainReceipt(txHash: string, network: string) {
    // Stub blockchain RPC call
    return { amount: 10, recipient: '0xValidRecipient' };
  }

  // Handle facilitator payment confirmation callback
  async facilitatorCallback(req: Request, res: Response) {
    const { payment_id, transaction_hash, network, creator_address, agent_address } = req.body;

    try {
      // 1. Verify transaction on blockchain
      const receipt = await this.verifyPayment(payment_id);

      if (receipt) {
        // 2. Grant access to content
        await this.grantAccess(payment_id, receipt.content_id);

        // 3. Process Revenue Splits (80/10/10 model)
        const split = this.processRevenueSplit(
          receipt.amount,
          creator_address || '0xPlatformCreator',
          agent_address
        );

        // 4. Store receipt in database
        await this.storeReceipt(receipt);

        res.json({ success: true, access_granted: true, split });
      } else {
        res.status(400).json({ success: false, error: 'Payment verification failed' });
      }
    } catch (e) {
      res.status(500).json({ success: false, error: 'Callback processing error' });
    }
  }

  private async grantAccess(paymentId: string, contentId: string) {
    // Stub: store the linkage that this payment unlocks this content
  }

  private async storeReceipt(receipt: x402PaymentReceipt) {
    // Stub: supabase insert
  }

  /**
   * Automates the revenue split: 80% Creator, 10% Platform, 10% Agent.
   * If there is no agent, the platform takes the agent's 10% (20% total).
   */
  processRevenueSplit(amount: number, creatorAddress: string, agentAddress?: string) {
    const creatorShare = amount * 0.8;
    const agentShare = agentAddress ? amount * 0.1 : 0;
    const platformShare = amount - creatorShare - agentShare;

    return {
      creator: { address: creatorAddress, amount: creatorShare },
      platform: { amount: platformShare },
      agent: agentAddress ? { address: agentAddress, amount: agentShare } : null,
    };
  }
}
