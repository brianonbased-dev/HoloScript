'use client';

import React, { useState } from 'react';
import {
  verifyPackageLocally,
  type ExportPackage,
  type VerifyPackageOK,
} from '@/lib/self-custody-client';

/**
 * Step 4 — Confirm recoverability.
 *
 * Non-destructive verification: re-enter the password and prove that the
 * package + password pair can decrypt the recovery bytes. Zero server
 * interaction with the MCP server — only a call to Studio's internal
 * /api/identity/verify-package proxy.
 *
 * If this step fails, the user must either retype their password or
 * restart the whole flow (the package is already committed server-side,
 * one-time consumable per Invariant #2).
 */
export interface Step4Props {
  pkg: ExportPackage;
  /** Original password from Step 2 — used only to default-check if the user
   *  made no typo. We do NOT auto-advance; user re-enters. */
  originalPassword?: string;
  onContinue: () => void;
  onBack: () => void;
}

type VerifyStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'ok'; result: VerifyPackageOK }
  | { kind: 'manifest_bad' }
  | { kind: 'wrong_password' }
  | { kind: 'error'; message: string };

export function Step4Confirm({ pkg, onContinue, onBack }: Step4Props) {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<VerifyStatus>({ kind: 'idle' });

  async function handleVerify() {
    setStatus({ kind: 'checking' });
    const r = await verifyPackageLocally(pkg, password);
    if (!r.ok) {
      setStatus({ kind: 'error', message: r.error });
      return;
    }
    if (!r.manifest_hash_ok) {
      setStatus({ kind: 'manifest_bad' });
      return;
    }
    if (!r.decrypt_ok) {
      setStatus({ kind: 'wrong_password' });
      return;
    }
    setStatus({ kind: 'ok', result: r });
  }

  const canContinue = status.kind === 'ok';
  const canVerify = password.length > 0 && status.kind !== 'checking';

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Step 4 — Confirm recoverability</h2>
      <p style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>
        Re-enter your password. We&apos;ll decrypt the package locally to prove
        you can recover your secret. Nothing is sent to the identity server in
        this step.
      </p>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#888' }}>
          Recovery password (retype)
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (status.kind !== 'idle') setStatus({ kind: 'idle' });
          }}
          aria-label="recovery-password-verify"
          autoComplete="off"
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

      <button
        type="button"
        onClick={handleVerify}
        disabled={!canVerify}
        style={{
          padding: '8px 20px',
          borderRadius: 6,
          border: 'none',
          background: canVerify ? '#4af' : '#335',
          color: '#fff',
          cursor: canVerify ? 'pointer' : 'not-allowed',
          marginBottom: 16,
        }}
      >
        {status.kind === 'checking' ? 'Verifying...' : 'Verify locally'}
      </button>

      {status.kind === 'ok' && (
        <div
          style={{
            background: '#0a3',
            color: '#fff',
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: 13,
            marginBottom: 12,
          }}
          role="status"
          aria-label="verify-success"
        >
          <strong>Recoverable.</strong> Package integrity verified and
          payload decrypted successfully. You can continue.
        </div>
      )}

      {status.kind === 'wrong_password' && (
        <div
          style={{
            background: '#531',
            color: '#fdd',
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: 13,
            marginBottom: 12,
          }}
          role="alert"
          aria-label="verify-wrong-password"
        >
          <strong>Password didn&apos;t decrypt.</strong> Double-check the
          password you used in Step 2. The manifest hash verified — only the
          password is off.
        </div>
      )}

      {status.kind === 'manifest_bad' && (
        <div
          style={{
            background: '#531',
            color: '#fdd',
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: 13,
            marginBottom: 12,
          }}
          role="alert"
          aria-label="verify-manifest-bad"
        >
          <strong>Package appears corrupted.</strong> Manifest hash does not
          match. Restart the migration flow.
        </div>
      )}

      {status.kind === 'error' && (
        <div
          style={{
            background: '#531',
            color: '#fdd',
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: 13,
            marginBottom: 12,
          }}
          role="alert"
        >
          Verification error: {status.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: '1px solid #444',
            background: 'transparent',
            color: '#ccc',
            cursor: 'pointer',
          }}
        >
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          style={{
            padding: '8px 20px',
            borderRadius: 6,
            border: 'none',
            background: canContinue ? '#4af' : '#335',
            color: '#fff',
            cursor: canContinue ? 'pointer' : 'not-allowed',
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
