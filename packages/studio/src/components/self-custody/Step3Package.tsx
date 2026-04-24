'use client';

import React, { useEffect, useState } from 'react';
import type { ExportPackage } from '@/lib/self-custody-client';

/**
 * Step 3 — Package prepared and downloadable.
 *
 * Shows a live countdown to session expiry + a download button. The package
 * file is a JSON blob the user saves locally. The confirmation step (Step 4)
 * requires re-entering the password to prove they can recover.
 */
export interface Step3Props {
  pkg: ExportPackage;
  expiresAt: string; // ISO
  onContinue: () => void;
  onBack: () => void;
}

function useCountdown(expiresAtIso: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const target = new Date(expiresAtIso).getTime();
  const msLeft = Math.max(0, target - now);
  const mins = Math.floor(msLeft / 60_000);
  const secs = Math.floor((msLeft % 60_000) / 1000);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function Step3Package({ pkg, expiresAt, onContinue, onBack }: Step3Props) {
  const [downloaded, setDownloaded] = useState(false);
  const countdown = useCountdown(expiresAt);

  function handleDownload() {
    const blob = new Blob([JSON.stringify(pkg, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const hashShort = pkg.manifest_hash.replace('sha256:', '').slice(0, 12);
    a.download = `holoscript-recovery-${pkg.user_id}-${hashShort}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Step 3 — Download recovery package</h2>
      <p style={{ color: '#aaa', fontSize: 13, marginBottom: 12 }}>
        Your recovery package has been encrypted with your password. Save it
        somewhere safe — you&apos;ll need both the file AND your password to
        recover. This package can only be issued once.
      </p>

      <div
        style={{
          background: '#1a1a2e',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          fontSize: 12,
          color: '#bbb',
        }}
        aria-label="package-summary"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Version</span><strong style={{ color: '#eee' }}>{pkg.version}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>KDF / Cipher</span>
          <strong style={{ color: '#eee' }}>
            {pkg.encryption.kdf} / {pkg.encryption.cipher}
          </strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Manifest hash</span>
          <code style={{ fontSize: 10, color: '#8cf' }}>
            {pkg.manifest_hash.slice(0, 32)}...
          </code>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Session expires in</span>
          <strong
            style={{
              color: countdown === '0:00' ? '#f44' : '#fa0',
              fontVariantNumeric: 'tabular-nums',
            }}
            aria-label="countdown"
          >
            {countdown}
          </strong>
        </div>
      </div>

      <button
        type="button"
        onClick={handleDownload}
        style={{
          padding: '10px 20px',
          borderRadius: 6,
          border: 'none',
          background: downloaded ? '#2a5' : '#4af',
          color: '#fff',
          fontSize: 14,
          cursor: 'pointer',
          marginBottom: 16,
        }}
      >
        {downloaded ? '\u2713 Package downloaded' : 'Download package file'}
      </button>

      <details
        style={{
          background: '#1a1a2e',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 16,
          fontSize: 13,
          color: '#bbb',
        }}
      >
        <summary style={{ cursor: 'pointer', color: '#eee' }}>
          How to import this into wallet software
        </summary>
        <p style={{ marginTop: 8 }}>
          The package contains your recovery secret encrypted with your
          password. Wallet software that supports HoloScript v3.0 recovery
          packages can decrypt and import the secret directly. See{' '}
          <a
            href="https://docs.holoscript.net/self-custody/wallet-import"
            style={{ color: '#4af' }}
            target="_blank"
            rel="noreferrer"
          >
            docs.holoscript.net/self-custody/wallet-import
          </a>{' '}
          for the current wallet list.
        </p>
      </details>

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
          disabled={!downloaded}
          style={{
            padding: '8px 20px',
            borderRadius: 6,
            border: 'none',
            background: downloaded ? '#4af' : '#335',
            color: '#fff',
            cursor: downloaded ? 'pointer' : 'not-allowed',
          }}
        >
          I&apos;ve saved it — continue
        </button>
      </div>
    </div>
  );
}
