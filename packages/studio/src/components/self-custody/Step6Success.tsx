'use client';

import React from 'react';

/**
 * Step 6 — Migration complete.
 *
 * Shows the retired custodial signer id + effective_at timestamp. On replay
 * (same session finalized twice, happens if user re-runs finalize after an
 * idempotent 200), retiredCustodialSignerId is undefined — the UI reads the
 * cached-first-value from the wizard reducer and we display that.
 */
export interface Step6Props {
  retiredCustodialSignerId: string;
  effectiveAt: string;
  /** True when this was a server-replay response. */
  replay: boolean;
  onClose: () => void;
}

export function Step6Success({
  retiredCustodialSignerId,
  effectiveAt,
  replay,
  onClose,
}: Step6Props) {
  const effectiveDate = (() => {
    try {
      return new Date(effectiveAt).toLocaleString();
    } catch {
      return effectiveAt;
    }
  })();

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 12, color: '#4f4' }}>
        Migration complete
      </h2>
      <p style={{ color: '#aaa', fontSize: 13, marginBottom: 20 }}>
        Your account is now in self-custody mode. The custodial signer has
        been retired and can no longer sign on your behalf. Your new wallet
        is the only authority.
      </p>

      <div
        style={{
          background: '#0a3',
          color: '#fff',
          borderRadius: 6,
          padding: '14px 18px',
          fontSize: 13,
          marginBottom: 20,
        }}
      >
        <div style={{ marginBottom: 6 }}>
          <strong>Status:</strong> self_custody_active
        </div>
        <div style={{ marginBottom: 6 }}>
          <strong>Retired custodial signer:</strong>{' '}
          <code style={{ fontSize: 11 }}>{retiredCustodialSignerId}</code>
        </div>
        <div>
          <strong>Effective:</strong> {effectiveDate}
        </div>
        {replay && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: '#ffd',
              opacity: 0.9,
            }}
          >
            (server reported this as a replay — the migration had already
            completed; you&apos;re looking at the cached result.)
          </div>
        )}
      </div>

      <div
        style={{
          background: '#1a1a2e',
          borderRadius: 6,
          padding: '10px 14px',
          fontSize: 12,
          color: '#aaa',
          marginBottom: 20,
        }}
      >
        <strong style={{ color: '#eee' }}>What changes now:</strong>
        <ul style={{ paddingLeft: 18, marginTop: 4 }}>
          <li>The custodial-signing API is permanently disabled for your account.</li>
          <li>You sign all future actions with your wallet private key.</li>
          <li>Lose the wallet + recovery package and we cannot help you recover.</li>
        </ul>
      </div>

      <button
        type="button"
        onClick={onClose}
        style={{
          padding: '8px 20px',
          borderRadius: 6,
          border: 'none',
          background: '#4af',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        Close
      </button>
    </div>
  );
}
