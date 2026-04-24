'use client';

import React from 'react';
import type { SelfCustodyApiError } from '@/lib/self-custody-client';

/**
 * Error routing UI for every documented server error code.
 *
 * Each code maps to:
 *   - A human-readable explanation
 *   - A recovery action (restart / retry-here / retry-safe-5xx)
 *   - For 429, a countdown to when the user can retry
 */
export interface ErrorPanelProps {
  error: SelfCustodyApiError;
  /** Called to restart the whole flow from idle. */
  onRestart: () => void;
  /** Called when the error is locally-recoverable and we stay on this step
   *  (e.g. bad_ownership_proof → re-sign). Undefined if no in-place recovery. */
  onRetryHere?: () => void;
}

interface ErrorCopy {
  title: string;
  body: string;
  primary: { label: string; kind: 'restart' | 'retry-here' };
  secondary?: { label: string; kind: 'restart' };
  tone: 'warn' | 'error' | 'info';
}

function copyForError(err: SelfCustodyApiError): ErrorCopy {
  const http = err.http_status;
  if (http >= 500) {
    return {
      title: 'Server error (retry is safe)',
      body:
        (err.message ||
          'The server could not complete the transaction. No partial state was written; you can retry without risking duplicate registration.') +
        (err.code ? ` (code: ${err.code})` : ''),
      primary: { label: 'Retry', kind: 'retry-here' },
      secondary: { label: 'Start over', kind: 'restart' },
      tone: 'warn',
    };
  }

  switch (err.error) {
    case 'session_expired':
      return {
        title: 'Session expired',
        body:
          'Your export session has expired. Sessions are short-lived (15 minutes) to limit exposure. Start over to generate a new one.',
        primary: { label: 'Start over', kind: 'restart' },
        tone: 'warn',
      };
    case 'manifest_hash_mismatch':
      return {
        title: 'Package corrupted',
        body:
          'The package you finalized does not match the package the server issued. If you edited the file or uploaded the wrong one, restart. If the file is as-downloaded, contact support.',
        primary: { label: 'Start over', kind: 'restart' },
        tone: 'error',
      };
    case 'bad_ownership_proof':
      return {
        title: 'Signature did not verify',
        body:
          'The server could not verify your signature over the nonce. This usually means the public key and private key got out of sync. Regenerate the keypair and re-sign.',
        primary: { label: 'Regenerate & re-sign', kind: 'retry-here' },
        secondary: { label: 'Start over', kind: 'restart' },
        tone: 'error',
      };
    case 'two_factor_required':
      return {
        title: '2FA required',
        body:
          'Step-up 2FA is enabled on this server. Start the wizard again and supply a 2FA token.',
        primary: { label: 'Start over', kind: 'restart' },
        tone: 'warn',
      };
    case 'rate_limited':
      return {
        title: 'Rate limited',
        body:
          'Too many prepare attempts in the last hour. Wait and try again — the limit is 3 per hour per user.',
        primary: { label: 'Start over', kind: 'restart' },
        tone: 'warn',
      };
    case 'already_self_custody':
      return {
        title: 'Already migrated',
        body:
          'This account is already in self-custody mode. There is nothing to migrate — the export flow is a no-op for you.',
        primary: { label: 'Close', kind: 'restart' },
        tone: 'info',
      };
    case 'session_not_in_prepared_state':
    case 'session_not_packaged':
    case 'session_already_finalized':
    case 'session_not_owned_by_caller':
      return {
        title: 'Session state mismatch',
        body:
          (err.message ||
            'The session is not in the expected state for this step.') +
          (err.current_status ? ` (current: ${err.current_status})` : '') +
          ' Start over to create a fresh session.',
        primary: { label: 'Start over', kind: 'restart' },
        tone: 'error',
      };
    default:
      return {
        title: `Error: ${err.error}`,
        body:
          err.message || 'An unknown error occurred. Start over and try again.',
        primary: { label: 'Start over', kind: 'restart' },
        tone: 'error',
      };
  }
}

export function ErrorPanel({ error, onRestart, onRetryHere }: ErrorPanelProps) {
  const copy = copyForError(error);
  const bg =
    copy.tone === 'error' ? '#531' : copy.tone === 'warn' ? '#432' : '#234';
  const color =
    copy.tone === 'error' ? '#fdd' : copy.tone === 'warn' ? '#ffd' : '#dff';

  const handlePrimary = () => {
    if (copy.primary.kind === 'retry-here' && onRetryHere) {
      onRetryHere();
    } else {
      onRestart();
    }
  };

  return (
    <div
      role="alert"
      aria-label={`self-custody-error-${error.error}`}
      style={{
        background: bg,
        color,
        borderRadius: 8,
        padding: '16px 20px',
        fontSize: 13,
      }}
    >
      <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 8 }}>{copy.title}</h2>
      <p style={{ marginBottom: 16 }}>{copy.body}</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={handlePrimary}
          style={{
            padding: '8px 18px',
            borderRadius: 6,
            border: 'none',
            background: '#4af',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          {copy.primary.label}
        </button>
        {copy.secondary && (
          <button
            type="button"
            onClick={onRestart}
            style={{
              padding: '8px 18px',
              borderRadius: 6,
              border: '1px solid #888',
              background: 'transparent',
              color,
              cursor: 'pointer',
            }}
          >
            {copy.secondary.label}
          </button>
        )}
      </div>
      <div
        style={{
          marginTop: 14,
          fontSize: 10,
          color: 'rgba(255,255,255,0.5)',
        }}
      >
        error_code: <code>{error.error}</code> · http: {error.http_status}
        {error.code ? ` · server_code: ${error.code}` : ''}
      </div>
    </div>
  );
}
