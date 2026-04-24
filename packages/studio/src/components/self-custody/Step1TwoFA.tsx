'use client';

import React, { useState } from 'react';

/**
 * Step 1 — 2FA step-up challenge.
 *
 * Server gates on REQUIRE_2FA env var. When unset, server accepts requests
 * without a 2FA token but logs a WARN. We still show this step for a clear
 * dev-surface banner so operators know the gap exists.
 */
export interface Step1Props {
  /** When true, we run with no server-side 2FA enforcement. */
  devSkipBanner: boolean;
  /** Invoked when the user advances. `token` is undefined when skipped. */
  onContinue: (token: string | undefined) => void;
  onCancel: () => void;
}

export function Step1TwoFA({ devSkipBanner, onContinue, onCancel }: Step1Props) {
  const [token, setToken] = useState('');
  const [skip, setSkip] = useState(devSkipBanner);

  const canAdvance = skip || token.trim().length > 0;

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Step 1 — Verify it&apos;s you</h2>
      <p style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>
        Migrating to self-custody is permanent. We require a second factor before
        proceeding. Enter a code from your authenticator app or hardware key.
      </p>

      {devSkipBanner && (
        <div
          style={{
            background: '#332',
            border: '1px solid #a80',
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: 12,
            color: '#ffd',
            marginBottom: 16,
          }}
          role="alert"
          aria-label="dev-banner"
        >
          <strong>DEV MODE:</strong> REQUIRE_2FA is disabled on this server.
          The migration will proceed without 2FA. Do not ship this configuration
          to production.
        </div>
      )}

      {!skip && (
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#888' }}>
            2FA Code (shape: <code>2fa:&lt;your-token&gt;</code> during dev)
          </span>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            aria-label="two-factor-token"
            placeholder="2fa:XXXXXX"
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #444',
              background: '#222',
              color: '#eee',
              fontSize: 14,
            }}
          />
        </label>
      )}

      {devSkipBanner && (
        <label style={{ display: 'block', marginBottom: 12, fontSize: 12, color: '#aaa' }}>
          <input
            type="checkbox"
            checked={skip}
            onChange={(e) => setSkip(e.target.checked)}
            style={{ marginRight: 6 }}
          />
          Skip 2FA (dev only — server not enforcing)
        </label>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid #444',
            background: 'transparent',
            color: '#ccc',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onContinue(skip ? undefined : token.trim())}
          disabled={!canAdvance}
          style={{
            padding: '8px 20px',
            borderRadius: 6,
            border: 'none',
            background: canAdvance ? '#4af' : '#335',
            color: '#fff',
            cursor: canAdvance ? 'pointer' : 'not-allowed',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
