'use client';

import React, { useEffect, useState } from 'react';
import {
  generateBrowserWalletKeypair,
  signServerNonce,
  type BrowserKeypair,
} from '@/lib/self-custody-client';

/**
 * Step 5 — Ownership proof.
 *
 * User claims a new wallet by generating an Ed25519 keypair in the browser
 * and signing the server-issued nonce. We do NOT persist the private key
 * anywhere — it lives in the CryptoKey object for this component's lifetime
 * only. After finalize, we throw it away. User is expected to export the
 * public key hex as their new wallet address and import the equivalent
 * private key into their preferred wallet software.
 *
 * This is a simplified flow — production could let the user paste in a
 * wallet address they already control AND a signature they already produced
 * elsewhere. The browser-keypair path is the frictionless version.
 */
export interface Step5Props {
  nonce: string; // hex
  onContinue: (payload: {
    newWalletAddress: string;
    newWalletPublicKeyPem: string;
    nonceSignatureB64: string;
  }) => void;
  onBack: () => void;
}

type KeypairState =
  | { kind: 'generating' }
  | { kind: 'ready'; kp: BrowserKeypair; signature: string }
  | { kind: 'failed'; message: string };

export function Step5Ownership({ nonce, onContinue, onBack }: Step5Props) {
  const [state, setState] = useState<KeypairState>({ kind: 'generating' });
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const kp = await generateBrowserWalletKeypair();
        const signature = await signServerNonce(kp.privateKey, nonce);
        if (cancelled) return;
        setState({ kind: 'ready', kp, signature });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: 'failed',
          message:
            err instanceof Error
              ? err.message
              : 'Unable to generate wallet keypair in this browser.',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  async function regenerate() {
    setState({ kind: 'generating' });
    try {
      const kp = await generateBrowserWalletKeypair();
      const signature = await signServerNonce(kp.privateKey, nonce);
      setState({ kind: 'ready', kp, signature });
    } catch (err) {
      setState({
        kind: 'failed',
        message:
          err instanceof Error
            ? err.message
            : 'Unable to generate wallet keypair.',
      });
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Step 5 — Prove ownership of the new wallet</h2>
      <p style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>
        We generated an Ed25519 keypair in your browser and signed the server
        nonce. Finalizing below binds this public key to your account — the
        custodial signer is retired atomically in the same request.
      </p>

      <div
        style={{
          background: '#1a1a2e',
          borderRadius: 8,
          padding: '12px 16px',
          fontSize: 12,
          color: '#bbb',
          marginBottom: 16,
        }}
      >
        <div style={{ marginBottom: 6 }}>
          <span style={{ color: '#888' }}>Server nonce: </span>
          <code style={{ color: '#8cf' }}>{nonce.slice(0, 16)}...{nonce.slice(-8)}</code>
        </div>

        {state.kind === 'generating' && (
          <div aria-label="keypair-generating" style={{ color: '#fa0' }}>
            Generating keypair and signing nonce...
          </div>
        )}

        {state.kind === 'ready' && (
          <>
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: '#888' }}>New wallet address: </span>
              <code style={{ color: '#eee' }} aria-label="wallet-address">
                {state.kp.publicKeyHex.slice(0, 18)}...{state.kp.publicKeyHex.slice(-6)}
              </code>
            </div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ color: '#888' }}>Signature (b64): </span>
              <code style={{ color: '#8cf', fontSize: 10 }}>
                {state.signature.slice(0, 32)}...
              </code>
            </div>
            <button
              type="button"
              onClick={() => setRevealed(!revealed)}
              style={{
                background: 'transparent',
                color: '#4af',
                border: 'none',
                cursor: 'pointer',
                fontSize: 11,
                padding: 0,
              }}
            >
              {revealed ? 'Hide' : 'Show'} full public key PEM
            </button>
            {revealed && (
              <pre
                style={{
                  background: '#111',
                  padding: 8,
                  borderRadius: 4,
                  fontSize: 10,
                  color: '#8cf',
                  overflow: 'auto',
                  marginTop: 6,
                }}
              >
                {state.kp.publicKeyPem}
              </pre>
            )}
          </>
        )}

        {state.kind === 'failed' && (
          <div aria-label="keypair-failed" style={{ color: '#f44' }}>
            <strong>Keypair generation failed.</strong> {state.message}
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={regenerate}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: '1px solid #f44',
                  background: 'transparent',
                  color: '#f44',
                  cursor: 'pointer',
                  fontSize: 11,
                }}
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>

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
          onClick={() => {
            if (state.kind !== 'ready') return;
            onContinue({
              newWalletAddress: state.kp.publicKeyHex,
              newWalletPublicKeyPem: state.kp.publicKeyPem,
              nonceSignatureB64: state.signature,
            });
          }}
          disabled={state.kind !== 'ready'}
          style={{
            padding: '8px 20px',
            borderRadius: 6,
            border: 'none',
            background: state.kind === 'ready' ? '#4af' : '#335',
            color: '#fff',
            cursor: state.kind === 'ready' ? 'pointer' : 'not-allowed',
          }}
        >
          Finalize migration
        </button>
      </div>
    </div>
  );
}
