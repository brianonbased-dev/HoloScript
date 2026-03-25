/**
 * Credit guard middleware for Absorb Service API routes.
 *
 * Pattern mirrors requireAuth() — returns a NextResponse error on
 * insufficient credits, or the operation cost info on success.
 */

import { NextResponse } from 'next/server';
import { checkBalance } from './creditService';
import { OPERATION_COSTS, type OperationType } from './pricing';

export interface CreditGateResult {
  userId: string;
  costCents: number;
  operationType: OperationType;
}

/**
 * Check that a user has sufficient credits for an operation.
 * Returns a CreditGateResult on success, or a NextResponse (402) on failure.
 */
export async function requireCredits(
  userId: string,
  operationType: OperationType,
): Promise<CreditGateResult | NextResponse> {
  const cost = OPERATION_COSTS[operationType];
  if (!cost) {
    return NextResponse.json(
      { error: `Unknown operation type: ${operationType}` },
      { status: 400 },
    );
  }

  const balance = await checkBalance(userId, cost.baseCostCents);

  if (!balance.sufficient) {
    return NextResponse.json(
      {
        error: 'Insufficient credits',
        required: cost.baseCostCents,
        balance: balance.balanceCents,
        description: cost.description,
        purchaseUrl: '/absorb?tab=credits',
      },
      { status: 402 },
    );
  }

  return {
    userId,
    costCents: cost.baseCostCents,
    operationType,
  };
}

/**
 * Type guard to check if requireCredits returned an error response.
 */
export function isCreditError(result: CreditGateResult | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
