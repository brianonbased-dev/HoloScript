/**
 * Credit guard middleware for Absorb Service API routes.
 *
 * Framework-agnostic: returns a plain CreditError object on failure,
 * or a CreditGateResult on success. Consumers (Express, Next.js, etc.)
 * map the error to their own response format.
 *
 * When `options.orchestratorGated` is true the call was already quota-checked
 * by the MCPMe orchestrator (mcp-orchestrator / billing mesh). In this case
 * absorb-service skips its own credit deduction to prevent double billing.
 */

import { checkBalance } from './creditService';
import { OPERATION_COSTS, type OperationType } from './pricing';

export interface CreditGateResult {
  userId: string;
  costCents: number;
  operationType: OperationType;
  /** True when billing was handled upstream by the MCPMe orchestrator. */
  orchestratorBilled?: boolean;
}

export interface CreditError {
  error: string;
  status: number;
  required?: number;
  balance?: number;
  description?: string;
  purchaseUrl?: string;
}

export interface RequireCreditsOptions {
  /**
   * When true, the MCPMe orchestrator already deducted compute units for this
   * operation. Return a zero-cost gate result so route handlers can proceed
   * without touching the internal credit balance.
   */
  orchestratorGated?: boolean;
}

/**
 * Check that a user has sufficient credits for an operation.
 * Returns a CreditGateResult on success, or a CreditError on failure.
 */
export async function requireCredits(
  userId: string,
  operationType: OperationType,
  options: RequireCreditsOptions = {}
): Promise<CreditGateResult | CreditError> {
  const cost = OPERATION_COSTS[operationType];
  if (!cost) {
    return {
      error: `Unknown operation type: ${operationType}`,
      status: 400,
    };
  }

  // Fast path: billing handled upstream by the MCPMe orchestrator mesh.
  if (options.orchestratorGated) {
    return { userId, costCents: 0, operationType, orchestratorBilled: true };
  }

  const balance = await checkBalance(userId, cost.baseCostCents);

  if (!balance.sufficient) {
    return {
      error: 'Insufficient credits',
      status: 402,
      required: cost.baseCostCents,
      balance: balance.balanceCents,
      description: cost.description,
      purchaseUrl: '/absorb?tab=credits',
    };
  }

  return {
    userId,
    costCents: cost.baseCostCents,
    operationType,
  };
}

/**
 * Type guard to check if requireCredits returned an error.
 */
export function isCreditError(result: CreditGateResult | CreditError): result is CreditError {
  return 'error' in result && 'status' in result;
}
