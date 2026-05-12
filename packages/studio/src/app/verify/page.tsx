'use client';

/**
 * Studio Verify Page — Secrets Broker Device Flow Approval
 *
 * Allows an operator (founder / desktop user) to approve a device-flow
 * authorization request from a mobile, headless, or web surface.
 *
 * URL params:
 *   ?team=team_xxx          — target team id
 *   ?code=XXXX-XXXX        — pre-fill user_code
 *
 * Flow:
 * 1. Surface calls POST /api/holomesh/team/:id/secrets/device-flow
 * 2. Surface shows user_code + verification_uri to operator
 * 3. Operator visits /verify?team=xxx&code=XXXX-XXXX
 * 4. Operator reviews handle / surface / TTL and clicks Approve
 * 5. Backend mints a capability token for the surface
 *
 * @module app/verify/page
 */

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Shield,
  Copy,
  Check,
  Smartphone,
  Monitor,
  Server,
  Globe,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface VerifyFormState {
  teamId: string;
  userCode: string;
  handle: string;
  surface: 'mobile' | 'desktop' | 'headless' | 'web';
  ttlSeconds: number;
}

interface VerifySuccess {
  success: true;
  device_code: string;
  token_id: string;
  approved_at: string;
}

interface VerifyError {
  success: false;
  error: string;
}

// ── Surface metadata ───────────────────────────────────────────────────────

const SURFACE_META: Record<
  VerifyFormState['surface'],
  { label: string; icon: React.ReactNode; description: string }
> = {
  mobile: {
    label: 'Mobile',
    icon: <Smartphone className="h-4 w-4" />,
    description: 'Phone / tablet agent',
  },
  desktop: {
    label: 'Desktop',
    icon: <Monitor className="h-4 w-4" />,
    description: 'Cursor / VS Code / Claude',
  },
  headless: {
    label: 'Headless',
    icon: <Server className="h-4 w-4" />,
    description: 'Daemon / CI / server agent',
  },
  web: {
    label: 'Web',
    icon: <Globe className="h-4 w-4" />,
    description: 'Browser-based agent',
  },
};

const DEFAULT_CAPABILITIES = ['mesh:read'];

// ── Components ───────────────────────────────────────────────────────────────

function VerifyForm() {
  const searchParams = useSearchParams();

  const [form, setForm] = useState<VerifyFormState>({
    teamId: searchParams.get('team') || '',
    userCode: searchParams.get('code') || '',
    handle: '',
    surface: 'mobile',
    ttlSeconds: 900,
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    | { type: 'success'; data: VerifySuccess }
    | { type: 'error'; message: string }
    | null
  >(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Update URL params when they change (e.g., user edits team/code)
  useEffect(() => {
    const url = new URL(window.location.href);
    if (form.teamId) url.searchParams.set('team', form.teamId);
    else url.searchParams.delete('team');
    if (form.userCode) url.searchParams.set('code', form.userCode);
    else url.searchParams.delete('code');
    window.history.replaceState({}, '', url.toString());
  }, [form.teamId, form.userCode]);

  const canSubmit =
    form.teamId.trim().length > 0 &&
    form.userCode.trim().length >= 4;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(
        `/api/holomesh/team/${encodeURIComponent(form.teamId.trim())}/secrets/device-flow/verify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_code: form.userCode.trim().toUpperCase(),
            handle: form.handle.trim() || undefined,
            surface: form.surface,
            capabilities: DEFAULT_CAPABILITIES,
            ttl_seconds: form.ttlSeconds,
          }),
        }
      );

      const data = (await res.json()) as VerifySuccess | VerifyError;

      if (res.ok && 'success' in data && data.success) {
        setResult({ type: 'success', data: data as VerifySuccess });
      } else {
        setResult({
          type: 'error',
          message: (data as VerifyError).error || `Request failed (${res.status})`,
        });
      }
    } catch (err) {
      setResult({
        type: 'error',
        message: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#0a0a1a] via-[#0d1117] to-[#0a0a1a] px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0a0a12] p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20">
            <Shield className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Authorize Device</h1>
            <p className="text-sm text-white/50">
              Approve a new surface for your HoloMesh team
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Team ID */}
          <div>
            <label className="mb-1 block text-sm font-medium text-white/70">
              Team ID
            </label>
            <input
              type="text"
              value={form.teamId}
              onChange={(e) => setForm((f) => ({ ...f, teamId: e.target.value }))}
              placeholder="e.g. team_1777834718247_unr35n"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
              required
            />
          </div>

          {/* User Code */}
          <div>
            <label className="mb-1 block text-sm font-medium text-white/70">
              User Code
            </label>
            <input
              type="text"
              value={form.userCode}
              onChange={(e) =>
                setForm((f) => ({ ...f, userCode: e.target.value.toUpperCase() }))
              }
              placeholder="XXXX-XXXX"
              maxLength={12}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-mono tracking-widest text-white placeholder-white/30 outline-none transition focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
              required
            />
            <p className="mt-1 text-xs text-white/40">
              Enter the code displayed on the device you want to authorize.
            </p>
          </div>

          {/* Handle */}
          <div>
            <label className="mb-1 block text-sm font-medium text-white/70">
              Agent Handle <span className="text-white/30">(optional)</span>
            </label>
            <input
              type="text"
              value={form.handle}
              onChange={(e) => setForm((f) => ({ ...f, handle: e.target.value }))}
              placeholder="my-phone-agent"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
            />
          </div>

          {/* Surface */}
          <div>
            <label className="mb-2 block text-sm font-medium text-white/70">
              Surface Type
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(SURFACE_META) as VerifyFormState['surface'][]).map((key) => {
                const meta = SURFACE_META[key];
                const active = form.surface === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, surface: key }))}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition ${
                      active
                        ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300'
                        : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:text-white/80'
                    }`}
                  >
                    {meta.icon}
                    <span className="font-medium">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* TTL */}
          <div>
            <label className="mb-1 block text-sm font-medium text-white/70">
              Token Lifetime
            </label>
            <select
              value={form.ttlSeconds}
              onChange={(e) =>
                setForm((f) => ({ ...f, ttlSeconds: Number(e.target.value) }))
              }
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white outline-none transition focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30"
            >
              <option value={300}>5 minutes</option>
              <option value={900}>15 minutes</option>
              <option value={1800}>30 minutes</option>
              <option value={3600}>1 hour</option>
            </select>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit || loading}
            className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition ${
              canSubmit && !loading
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-white/5 text-white/30 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Authorizing...
              </>
            ) : (
              <>
                <Shield className="h-4 w-4" />
                Authorize Device
              </>
            )}
          </button>
        </form>

        {/* Result */}
        {result && (
          <div className="mt-6">
            {result.type === 'success' ? (
              <div className="space-y-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 shrink-0 text-emerald-400" />
                  <div>
                    <p className="text-sm font-medium text-emerald-300">
                      Device authorized successfully
                    </p>
                    <p className="text-xs text-emerald-400/70">
                      The surface can now connect using the issued capability token.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <ResultRow
                    label="Token ID"
                    value={result.data.token_id}
                    onCopy={() => copyToClipboard(result.data.token_id, 'tokenId')}
                    copied={copied === 'tokenId'}
                  />
                  <ResultRow
                    label="Device Code"
                    value={result.data.device_code}
                    onCopy={() => copyToClipboard(result.data.device_code, 'deviceCode')}
                    copied={copied === 'deviceCode'}
                  />
                  <ResultRow
                    label="Approved At"
                    value={new Date(result.data.approved_at).toLocaleString()}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-300">Authorization failed</p>
                  <p className="text-xs text-red-400/70">{result.message}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="mt-6 text-center text-xs text-white/20">
        HoloScript Secrets Broker — Device Flow Verification
      </p>
    </main>
  );
}

function ResultRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
        <p className="truncate text-xs font-mono text-white/80">{value}</p>
      </div>
      {onCopy && (
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded-md p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white/70"
          title="Copy"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

// ── Page export with Suspense boundary ─────────────────────────────────────

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0a0a1a]">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
        </div>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}
