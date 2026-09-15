/**
 * USDC amounts for HoloMesh payouts.
 *
 * Studio records money in US cents; USDC has 6 decimals, so one cent is
 * 10_000 atomic units. The withdraw route used to send
 * `floor(cents / 100) * 1e6`, which dropped the cents: a 150-cent withdrawal
 * was recorded as 150 but paid out 1.00 USDC.
 */
export const USDC_ATOMIC_UNITS_PER_CENT = 10_000;

export function centsToUsdcAtomicUnits(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError(`cents must be a non-negative safe integer, got ${cents}`);
  }
  return (BigInt(cents) * BigInt(USDC_ATOMIC_UNITS_PER_CENT)).toString();
}
