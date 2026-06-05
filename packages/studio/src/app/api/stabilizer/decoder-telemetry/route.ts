import { NextResponse } from 'next/server';
import telemetry from '@/data/stabilizer-decoder-telemetry.json';

/**
 * /api/stabilizer/decoder-telemetry — Stabilizer-Fleet decoder telemetry for the
 * /operations console (D.081 operate surface, EXP-5-real Phase 4).
 *
 * The payload is CORPUS-REPLAY: derived from the committed EXP-5-real receipts —
 * Phase 1 (toric-code threshold under correlated errors) + Phase 2 (real cryptographic
 * CAEL-verifier Z-syndrome). These are REAL decoder numbers from validated runs, NOT
 * synthetic placeholders; the `provenanceBadge` field says `corpus-replay` so the panel
 * never reads as live fleet telemetry (W.684 anti-false-green).
 *
 * Phase 3 (live fleet) overwrites the data file with live-fleet telemetry and flips the
 * badge to `live-fleet`; this route is unchanged.
 */
export async function GET() {
  return NextResponse.json(telemetry, { headers: { 'cache-control': 'no-store' } });
}
