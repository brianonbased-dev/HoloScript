'use client';

import React, { useMemo, useState } from 'react';
import { scorePassword } from '@/lib/self-custody-client';

/**
 * Step 2 — Recovery password.
 *
 * Password never leaves the browser except to /api/identity/verify-package
 * (confirmation step) and to /api/identity/self-custody/export/package
 * (server-side scrypt). Never stored client-side after the wizard completes.
 */
export interface Step2Props {
  onContinue: (password: string) => void;
  onBack: () => void;
}

export function Step2Password({ onContinue, onBack }: Step2Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const strength = useMemo(() => scorePassword(password), [password]);
  const mismatch = confirm.length > 0 && confirm !== password;
  const canAdvance =
    password.length > 0 && password === confirm && strength.score >= 2;

  const strengthColor =
    strength.score < 2 ? '#f44' : strength.score < 3 ? '#fa0' : '#4f4';
  const strengthLabel =
    strength.score === 0
      ? 'Too weak'
      : strength.score === 1
        ? 'Weak'
        : strength.score === 2
          ? 'Fair'
          : strength.score === 3
            ? 'Strong'
            : 'Very strong';

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Step 2 — Recovery password</h2>
      <p style={{ color: '#aaa', fontSize: 13, marginBottom: 8 }}>
        This password encrypts your recovery package. Losing it means losing
        access to your account — we cannot reset it. Use a password manager.
      </p>
      <p style={{ color: '#f80', fontSize: 12, marginBottom: 16 }}>
        Anyone with this password AND your package file can impersonate you.
      </p>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#888' }}>
          Recovery password
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-label="recovery-password"
          autoComplete="new-password"
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

      {password.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{
              display: 'flex',
              gap: 4,
              marginBottom: 6,
              height: 4,
            }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  background: i < strength.score + 1 ? strengthColor : '#222',
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: 12, color: strengthColor }}>
            Strength: {strengthLabel}
          </div>
          {strength.feedback.length > 0 && (
            <ul
              style={{
                fontSize: 11,
                color: '#888',
                paddingLeft: 18,
                margin: '4px 0 0 0',
              }}
            >
              {strength.feedback.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#888' }}>
          Confirm password
        </span>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-label="recovery-password-confirm"
          autoComplete="new-password"
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 6,
            border: `1px solid ${mismatch ? '#f44' : '#444'}`,
            background: '#222',
            color: '#eee',
            fontSize: 14,
          }}
        />
        {mismatch && (
          <span style={{ color: '#f44', fontSize: 12 }}>Passwords do not match.</span>
        )}
      </label>

      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
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
          onClick={() => onContinue(password)}
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
          Generate package
        </button>
      </div>
    </div>
  );
}
