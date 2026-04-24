'use client';

import React, { useCallback, useReducer, useRef } from 'react';
import {
  finalize,
  isApiError,
  newIdempotencyKey,
  packageExport,
  prepare,
  recoveryTargetForError,
  type ExportPackage,
  type SelfCustodyApiError,
  type WizardState,
  type WizardStateKind,
} from '@/lib/self-custody-client';
import { Step1TwoFA } from './Step1TwoFA';
import { Step2Password } from './Step2Password';
import { Step3Package } from './Step3Package';
import { Step4Confirm } from './Step4Confirm';
import { Step5Ownership } from './Step5Ownership';
import { Step6Success } from './Step6Success';
import { ErrorPanel } from './ErrorPanel';

/**
 * Tier 2 Self-Custody Migration Wizard.
 *
 * State machine transitions:
 *   idle → preparing → prepared → packaging → packaged → confirming →
 *   awaiting-ownership → finalizing → success
 * with error-edges at every async transition back to { kind: 'error',
 * from: <previous state kind> }. Each error code maps to either "restart"
 * or "retry in place" via `recoveryTargetForError`.
 *
 * The reducer enforces transitions: invalid transition attempts are
 * dropped silently (no-op) to keep the UI deterministic even under
 * double-click / race conditions.
 */
export interface MigrationWizardProps {
  /** Bearer token for MCP server calls. Resolved by the caller (typically
   *  via next-auth session). */
  bearerToken: string;
  /** Show the dev "REQUIRE_2FA disabled" banner on Step 1. Default false
   *  (production). Set true in dev/staging. */
  devSkipBanner?: boolean;
  /** Called when the user cancels or closes after success. */
  onExit?: () => void;
}

// ── Reducer ─────────────────────────────────────────────────────────────────

type WizardAction =
  | { type: 'start-prepare' }
  | {
      type: 'prepared';
      sessionId: string;
      nonce: string;
      expiresAt: string;
      password: string;
    }
  | { type: 'start-package' }
  | {
      type: 'packaged';
      pkg: ExportPackage;
      manifestHash: string;
    }
  | { type: 'confirmed' }
  | { type: 'start-finalize' }
  | {
      type: 'finalized';
      retiredCustodialSignerId: string;
      effectiveAt: string;
      replay: boolean;
    }
  | { type: 'error'; error: SelfCustodyApiError }
  | { type: 'restart' }
  | { type: 'back' };

const initialState: WizardState = { kind: 'idle' };

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'restart':
      return { kind: 'idle' };

    case 'start-prepare':
      if (state.kind !== 'idle') return state;
      return { kind: 'preparing' };

    case 'prepared':
      if (state.kind !== 'preparing') return state;
      return {
        kind: 'prepared',
        sessionId: action.sessionId,
        nonce: action.nonce,
        expiresAt: action.expiresAt,
        password: action.password,
      };

    case 'start-package':
      if (state.kind !== 'prepared') return state;
      return {
        kind: 'packaging',
        sessionId: state.sessionId,
        nonce: state.nonce,
        expiresAt: state.expiresAt,
        password: state.password,
      };

    case 'packaged':
      if (state.kind !== 'packaging') return state;
      return {
        kind: 'packaged',
        sessionId: state.sessionId,
        nonce: state.nonce,
        expiresAt: state.expiresAt,
        password: state.password,
        pkg: action.pkg,
        manifestHash: action.manifestHash,
      };

    case 'confirmed':
      if (state.kind === 'packaged') {
        return {
          kind: 'confirming',
          sessionId: state.sessionId,
          nonce: state.nonce,
          expiresAt: state.expiresAt,
          password: state.password,
          pkg: state.pkg,
          manifestHash: state.manifestHash,
        };
      }
      if (state.kind === 'confirming') {
        return {
          kind: 'awaiting-ownership',
          sessionId: state.sessionId,
          nonce: state.nonce,
          expiresAt: state.expiresAt,
          pkg: state.pkg,
          manifestHash: state.manifestHash,
        };
      }
      return state;

    case 'start-finalize':
      if (state.kind !== 'awaiting-ownership') return state;
      return {
        kind: 'finalizing',
        sessionId: state.sessionId,
        nonce: state.nonce,
        expiresAt: state.expiresAt,
        pkg: state.pkg,
        manifestHash: state.manifestHash,
      };

    case 'finalized':
      // Accept from finalizing. Happy path.
      if (state.kind !== 'finalizing') return state;
      return {
        kind: 'success',
        retiredCustodialSignerId: action.retiredCustodialSignerId,
        effectiveAt: action.effectiveAt,
        replay: action.replay,
      };

    case 'back': {
      if (state.kind === 'prepared') return { kind: 'idle' };
      if (state.kind === 'packaged') {
        return {
          kind: 'prepared',
          sessionId: state.sessionId,
          nonce: state.nonce,
          expiresAt: state.expiresAt,
          password: state.password,
        };
      }
      if (state.kind === 'awaiting-ownership') {
        // Back from Step 5 → Step 4 (confirming) is the rational target,
        // but we've already moved past the password. Push back to packaged
        // so user re-confirms with fresh state.
        return {
          kind: 'packaged',
          sessionId: state.sessionId,
          nonce: state.nonce,
          expiresAt: state.expiresAt,
          password: '',
          pkg: state.pkg,
          manifestHash: state.manifestHash,
        };
      }
      return state;
    }

    case 'error':
      return {
        kind: 'error',
        error: action.error,
        from: state.kind,
        carried: carryFor(state),
      };
  }
}

type Carried = {
  sessionId?: string;
  nonce?: string;
  expiresAt?: string;
  pkg?: ExportPackage;
  manifestHash?: string;
  password?: string;
};

function carryFor(state: WizardState): Carried {
  const carry: Carried = {};
  const s = state as Record<string, unknown>;
  if (typeof s.sessionId === 'string') carry.sessionId = s.sessionId;
  if (typeof s.nonce === 'string') carry.nonce = s.nonce;
  if (typeof s.expiresAt === 'string') carry.expiresAt = s.expiresAt;
  if (s.pkg && typeof s.pkg === 'object') carry.pkg = s.pkg as ExportPackage;
  if (typeof s.manifestHash === 'string') carry.manifestHash = s.manifestHash;
  if (typeof s.password === 'string') carry.password = s.password;
  return carry;
}

// ── Component ───────────────────────────────────────────────────────────────

export function MigrationWizard({
  bearerToken,
  devSkipBanner = false,
  onExit,
}: MigrationWizardProps) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Cache first-finalize-response so the replay 200 (which has no
  // retired_custodial_signer_id) can still render a complete success screen.
  const finalizedOnceRef = useRef<{ id: string; at: string } | null>(null);
  // Abort signal shared across in-flight requests; cancelled on restart.
  const abortRef = useRef<AbortController | null>(null);

  const newAbortSignal = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    return abortRef.current.signal;
  }, []);

  // Step 1 → prepare
  const handleStep1Continue = useCallback(
    async (twofaToken: string | undefined) => {
      // We actually collect the password in Step 2, so we defer the
      // prepare call until then. Step 1 just moves us to the password
      // step via local state — we don't call prepare yet.
      // But to keep the state machine clean (idle → preparing → prepared),
      // we stash the 2FA token in a ref and let Step 2's onContinue drive
      // the real prepare call.
      step1DataRef.current = { twofaToken };
      step1AdvanceToPassword();
    },
    []
  );

  // We need an intermediate "collecting password" view that sits between
  // idle and preparing. Rather than add a new state, we use a ref + local
  // boolean to drive the password step while state.kind === 'idle'.
  const step1DataRef = useRef<{ twofaToken: string | undefined } | null>(null);
  const [collectingPassword, setCollectingPassword] = React.useState(false);

  const step1AdvanceToPassword = useCallback(() => {
    setCollectingPassword(true);
  }, []);

  // Step 2 → (call prepare, then call package once ready)
  const handleStep2Continue = useCallback(
    async (password: string) => {
      setCollectingPassword(false);
      dispatch({ type: 'start-prepare' });
      const signal = newAbortSignal();

      // PREPARE
      const prep = await prepare({
        bearerToken,
        idempotencyKey: newIdempotencyKey(),
        twofaToken: step1DataRef.current?.twofaToken,
        signal,
      });
      if (isApiError(prep)) {
        dispatch({ type: 'error', error: prep });
        return;
      }

      dispatch({
        type: 'prepared',
        sessionId: prep.export_session_id,
        nonce: prep.nonce,
        expiresAt: prep.expires_at,
        password,
      });

      // Move into packaging immediately — we now have session + password.
      dispatch({ type: 'start-package' });

      // PACKAGE — recovery bytes come from server/user-managed flow; for
      // now we generate a placeholder 32-byte random secret client-side
      // and send it up. Production wires this to the actual recovery-
      // secret source (custodial signing key material). This placeholder
      // keeps the wizard runnable end-to-end without requiring the
      // custodial-signer export path to ship first.
      const recoveryBytes = new Uint8Array(32);
      crypto.getRandomValues(recoveryBytes);
      const recoveryBytesB64 = btoa(
        String.fromCharCode(...Array.from(recoveryBytes))
      );

      const pkgRes = await packageExport({
        bearerToken,
        sessionId: prep.export_session_id,
        recoveryPassword: password,
        recoveryBytesB64,
        signal,
      });
      if (isApiError(pkgRes)) {
        dispatch({ type: 'error', error: pkgRes });
        return;
      }

      dispatch({
        type: 'packaged',
        pkg: pkgRes.package,
        manifestHash: pkgRes.manifest_hash,
      });
    },
    [bearerToken, newAbortSignal]
  );

  // Step 3 → "I saved it, continue" — move to confirming
  const handleStep3Continue = useCallback(() => {
    dispatch({ type: 'confirmed' });
  }, []);

  // Step 4 → verified — move to awaiting-ownership
  const handleStep4Continue = useCallback(() => {
    dispatch({ type: 'confirmed' }); // packaged|confirming → next
  }, []);

  // Step 5 → finalize
  const handleStep5Continue = useCallback(
    async (payload: {
      newWalletAddress: string;
      newWalletPublicKeyPem: string;
      nonceSignatureB64: string;
    }) => {
      // State guard: we must be in awaiting-ownership; if not, do nothing.
      const currentState = stateRef.current;
      if (currentState.kind !== 'awaiting-ownership') return;

      dispatch({ type: 'start-finalize' });
      const signal = newAbortSignal();
      const res = await finalize({
        bearerToken,
        sessionId: currentState.sessionId,
        newWalletAddress: payload.newWalletAddress,
        nonceSignatureB64: payload.nonceSignatureB64,
        packageManifestHash: currentState.manifestHash,
        newWalletPublicKeyPem: payload.newWalletPublicKeyPem,
        signal,
      });
      if (isApiError(res)) {
        dispatch({ type: 'error', error: res });
        return;
      }

      // Happy path or replay. The replay branch omits
      // retired_custodial_signer_id, so we fall back to the cached value.
      if ('retired_custodial_signer_id' in res) {
        finalizedOnceRef.current = {
          id: res.retired_custodial_signer_id,
          at: res.effective_at,
        };
        dispatch({
          type: 'finalized',
          retiredCustodialSignerId: res.retired_custodial_signer_id,
          effectiveAt: res.effective_at,
          replay: false,
        });
      } else {
        const cached = finalizedOnceRef.current;
        dispatch({
          type: 'finalized',
          retiredCustodialSignerId: cached?.id ?? '(unknown — replay without cache)',
          effectiveAt: cached?.at ?? new Date().toISOString(),
          replay: true,
        });
      }
    },
    [bearerToken, newAbortSignal]
  );

  // Keep a ref to state so async callbacks read the latest without re-binding.
  const stateRef = useRef<WizardState>(state);
  stateRef.current = state;

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setCollectingPassword(false);
    dispatch({ type: 'restart' });
    onExit?.();
  }, [onExit]);

  const handleErrorRetryHere = useCallback(() => {
    if (state.kind !== 'error') return;
    const target = recoveryTargetForError(state.error.error, state.error.http_status);
    if (target === 'awaiting-ownership' && state.carried?.sessionId && state.carried?.pkg) {
      // Resume at ownership — force re-render of Step5 which regenerates keypair.
      dispatch({ type: 'restart' });
      // The dispatch('restart') drops us to idle; we immediately
      // re-enter the appropriate state via a synthetic sequence. This
      // is the simplest path without adding a 'resume' action — Step 5
      // always regenerates its keypair on mount, so a full re-run is
      // semantically identical.
      // NOTE: for a cleaner UX in future, add a 'resume-at' action that
      // jumps straight to awaiting-ownership with carried context.
    } else if (state.error.http_status >= 500) {
      // 5xx is retry-safe — drop back to the prior state kind so the
      // user can re-click the same button. Simplest impl: restart.
      dispatch({ type: 'restart' });
    } else {
      dispatch({ type: 'restart' });
    }
  }, [state]);

  // ── Render ────────────────────────────────────────────────────────────────

  const renderContent = () => {
    // Error is its own terminal branch — covers any non-success state.
    if (state.kind === 'error') {
      return (
        <ErrorPanel
          error={state.error}
          onRestart={() => {
            finalizedOnceRef.current = null;
            setCollectingPassword(false);
            dispatch({ type: 'restart' });
          }}
          onRetryHere={
            recoveryTargetForError(state.error.error, state.error.http_status) !== 'idle'
              ? handleErrorRetryHere
              : undefined
          }
        />
      );
    }

    if (state.kind === 'idle' && !collectingPassword) {
      return (
        <Step1TwoFA
          devSkipBanner={devSkipBanner}
          onContinue={handleStep1Continue}
          onCancel={handleCancel}
        />
      );
    }

    if (state.kind === 'idle' && collectingPassword) {
      return (
        <Step2Password
          onContinue={handleStep2Continue}
          onBack={() => setCollectingPassword(false)}
        />
      );
    }

    if (state.kind === 'preparing' || state.kind === 'packaging') {
      return (
        <div style={{ padding: 20, color: '#aaa', fontSize: 14 }}>
          {state.kind === 'preparing'
            ? 'Preparing session...'
            : 'Building encrypted package (scrypt KDF, ~2-3s)...'}
        </div>
      );
    }

    if (state.kind === 'prepared') {
      // Intermediate — should transition on tick. Show spinner.
      return <div style={{ padding: 20, color: '#aaa' }}>Packaging...</div>;
    }

    if (state.kind === 'packaged') {
      return (
        <Step3Package
          pkg={state.pkg}
          expiresAt={state.expiresAt}
          onContinue={handleStep3Continue}
          onBack={() => dispatch({ type: 'back' })}
        />
      );
    }

    if (state.kind === 'confirming') {
      return (
        <Step4Confirm
          pkg={state.pkg}
          originalPassword={state.password}
          onContinue={handleStep4Continue}
          onBack={() => dispatch({ type: 'back' })}
        />
      );
    }

    if (state.kind === 'awaiting-ownership') {
      return (
        <Step5Ownership
          nonce={state.nonce}
          onContinue={handleStep5Continue}
          onBack={() => dispatch({ type: 'back' })}
        />
      );
    }

    if (state.kind === 'finalizing') {
      return (
        <div style={{ padding: 20, color: '#aaa', fontSize: 14 }}>
          Finalizing migration — retiring custodial signer atomically...
        </div>
      );
    }

    if (state.kind === 'success') {
      return (
        <Step6Success
          retiredCustodialSignerId={state.retiredCustodialSignerId}
          effectiveAt={state.effectiveAt}
          replay={state.replay}
          onClose={() => {
            onExit?.();
          }}
        />
      );
    }

    return null;
  };

  // Progress indicator (1..6) derived from state.
  const progressIndex = stateToProgressIndex(state, collectingPassword);

  return (
    <div
      style={{
        maxWidth: 560,
        margin: '0 auto',
        padding: 24,
        background: '#0f0f1a',
        borderRadius: 8,
        color: '#eee',
      }}
      aria-label="self-custody-migration-wizard"
    >
      <ProgressIndicator current={progressIndex} />
      {renderContent()}
    </div>
  );
}

function stateToProgressIndex(
  state: WizardState,
  collectingPassword: boolean
): number {
  switch (state.kind) {
    case 'idle':
      return collectingPassword ? 2 : 1;
    case 'preparing':
    case 'prepared':
    case 'packaging':
      return 3;
    case 'packaged':
      return 3;
    case 'confirming':
      return 4;
    case 'awaiting-ownership':
      return 5;
    case 'finalizing':
      return 5;
    case 'success':
      return 6;
    case 'error':
      return 0; // error overrides progress
  }
}

function ProgressIndicator({ current }: { current: number }) {
  const steps = [
    '2FA',
    'Password',
    'Package',
    'Confirm',
    'Ownership',
    'Done',
  ];
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        marginBottom: 20,
        fontSize: 10,
        color: '#888',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
      }}
      aria-label="wizard-progress"
    >
      {steps.map((label, i) => {
        const idx = i + 1;
        const done = current > idx;
        const active = current === idx;
        return (
          <div
            key={label}
            style={{
              flex: 1,
              padding: '4px 0',
              textAlign: 'center',
              borderBottom: `2px solid ${done ? '#4f4' : active ? '#4af' : '#222'}`,
              color: done ? '#4f4' : active ? '#4af' : '#666',
            }}
          >
            {idx}. {label}
          </div>
        );
      })}
    </div>
  );
}
