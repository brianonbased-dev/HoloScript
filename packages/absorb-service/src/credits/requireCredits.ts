/**
 * Credit guard middleware for Absorb Service API routes.
 *
 * Framework-agnostic: returns a plain CreditError object on failure,
 * or a CreditGateResult on success. Consumers (Express, Next.js, etc.)
 * map the error to their own response format.
 */

import { checkBalance } from './creditService';
import { OPERATION_COSTS, type OperationType } from './pricing';

export interface CreditGateResult {
  userId: string;
  costCents: number;
  operationType: OperationType;
}

export interface CreditError {
  error: string;
  status: number;
  required?: number;
  balance?: number;
  description?: string;
  purchaseUrl?: string;
}

/**
 * Check that a user has sufficient credits for an operation.
 * Returns a CreditGateResult on success, or a CreditError on failure.
 */
export async function requireCredits(
  userId: string,
  operationType: OperationType,
): Promise<CreditGateResult | CreditError> {
  const cost = OPERATION_COSTS[operationType];
  if (!cost) {
    return {
      error: `Unknown operation type: ${operationType}`,
      status: 400,
    };
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
