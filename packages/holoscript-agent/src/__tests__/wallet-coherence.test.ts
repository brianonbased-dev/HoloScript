/**
 * wallet-coherence — boot-time self-heal decision matrix (W.820).
 *
 * Asserts the pure decision: coherent key passes through; a stray key (derived ≠ declared) degrades
 * to bearer-only when a bearer carries the true identity, halts when there is no bearer, and always
 * halts under the strict HALT flag. The holojetson lesson is encoded: a mismatched key is REJECTED
 * (never adopted) — the declared/registered identity wins, carried by the bearer.
 */
import { describe, it, expect } from 'vitest';
import { decideWalletCoherence } from '../wallet-coherence';

const ORIN = '0xb9256a676521783c5b13DFD1E7A7e1205aC71996'; // declared / mesh-registered
const STRAY = '0x38a79967D6A5bff590CD6858839B3708f4ee4633'; // wrong key derived address

describe('decideWalletCoherence', () => {
  it('coherent: key-derived address matches the declared wallet', () => {
    expect(
      decideWalletCoherence({
        derivedAddress: ORIN,
        declaredWallet: ORIN,
        hasBearer: true,
        halt: false,
      })
    ).toEqual({ coherent: true });
  });

  it('coherent regardless of case (checksum vs lowercase)', () => {
    expect(
      decideWalletCoherence({
        derivedAddress: ORIN.toLowerCase(),
        declaredWallet: ORIN,
        hasBearer: false,
        halt: false,
      })
    ).toEqual({ coherent: true });
  });

  it('no local key → coherent (already bearer-only, nothing to reconcile)', () => {
    expect(
      decideWalletCoherence({
        derivedAddress: undefined,
        declaredWallet: ORIN,
        hasBearer: true,
        halt: false,
      })
    ).toEqual({ coherent: true });
  });

  it('stray key + bearer present → degrade to bearer-only (the holojetson self-heal)', () => {
    const d = decideWalletCoherence({
      derivedAddress: STRAY,
      declaredWallet: ORIN,
      hasBearer: true,
      halt: false,
    });
    expect(d.coherent).toBe(false);
    expect(d).toMatchObject({ action: 'degrade-to-bearer-only' });
    if (!d.coherent) expect(d.reason).toContain(STRAY);
  });

  it('stray key + NO bearer → halt (nothing carries the declared identity)', () => {
    const d = decideWalletCoherence({
      derivedAddress: STRAY,
      declaredWallet: ORIN,
      hasBearer: false,
      halt: false,
    });
    expect(d).toMatchObject({ coherent: false, action: 'halt' });
  });

  it('stray key + HALT flag → halt even with a bearer (strict/CI mode)', () => {
    const d = decideWalletCoherence({
      derivedAddress: STRAY,
      declaredWallet: ORIN,
      hasBearer: true,
      halt: true,
    });
    expect(d).toMatchObject({ coherent: false, action: 'halt' });
  });

  it('never adopts the stray key — declared identity is always the survivor', () => {
    // A degrade decision must reference dropping the stray key, not switching identity to it.
    const d = decideWalletCoherence({
      derivedAddress: STRAY,
      declaredWallet: ORIN,
      hasBearer: true,
      halt: false,
    });
    if (!d.coherent && d.action === 'degrade-to-bearer-only') {
      expect(d.reason).toMatch(/ignoring the stray key|bearer carries/i);
    } else {
      throw new Error('expected degrade-to-bearer-only');
    }
  });
});
