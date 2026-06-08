'use client';

/**
 * Settings — /settings host component.
 *
 * **Native body**: The full page surface (heading, section scaffolding, Stripe/Oracle
 * blocks, account info) is defined in `compositions/studio/settings.hsplus` and
 * rendered by HoloSurfaceRenderer.  SettingsView is reduced to its irreducible
 * host responsibilities:
 *
 *   1. Load profile / stripe / oracle state via API fetch chains.
 *   2. Bridge all data into composition state via setState() on every update.
 *   3. Handle emits that require React side-effects:
 *      - "save"         → saveProfile() (PUT /api/users/:id)
 *      - "stripe-setup" → startStripeConnect() (POST /api/stripe/connect)
 *      - "oracle-setup" → run oracle setup fetch + re-poll status
 *
 * **Form inputs** stay as React controlled inputs in host state because
 * HoloSurfaceRenderer input is readOnly — the bridge writes displayName/bio/website
 * back to composition state for display, but onChange is React-native.
 *
 * @see compositions/studio/settings.hsplus — source of truth for layout / UI
 * @module settings/SettingsView
 */

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';
import { SAVE_FEEDBACK_DURATION } from '@/lib/ui-timings';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';

// ── Types (kept host-side; not exposed to composition) ─────────────────────────

type StripeStatus = 'loading' | 'not_started' | 'pending' | 'complete';

type OracleStatus = {
  oracle_ready: boolean;
  always_on: boolean;
  tier: string;
  ide_client: string;
  hardware_target: string;
  checks: Record<string, string | number | undefined>;
  message?: string;
};

// ── Component ──────────────────────────────────────────────────────────────────

export function SettingsView() {
  const { data: session, status } = useSession();

  // ── Profile form state (React-controlled; kept in host) ────────────────────
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── Stripe Connect state ───────────────────────────────────────────────────
  const [stripeStatus, setStripeStatus] = useState<StripeStatus>('loading');
  const [totalEarningsCents, setTotalEarningsCents] = useState(0);
  const [connectingStripe, setConnectingStripe] = useState(false);

  // ── Oracle Boost state ─────────────────────────────────────────────────────
  const [oracleStatus, setOracleStatus] = useState<OracleStatus | null>(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleSetupRunning, setOracleSetupRunning] = useState(false);
  const [oracleTelemetry, setOracleTelemetry] = useState<{
    total_entries: number;
    summary: Record<string, Record<string, number>>;
  } | null>(null);

  // ── Composition bridge ─────────────────────────────────────────────────────
  const composition = useHoloComposition('/api/surface/settings');

  // ── Data fetching ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user?.id) return;

    // Profile
    fetch(`/api/users/${session.user.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.user) {
          setDisplayName(data.user.name ?? '');
          setBio(data.user.bio ?? '');
          setWebsite(data.user.website ?? '');
        }
      })
      .catch((err) => logger.warn('Swallowed error caught:', err));

    // Stripe Connect status
    fetch('/api/stripe/connect')
      .then((r) => r.json())
      .then((data) => {
        setStripeStatus(data.status ?? 'not_started');
        setTotalEarningsCents(data.totalEarningsCents ?? 0);
      })
      .catch(() => setStripeStatus('not_started'));

    // Oracle Boost status + telemetry
    const tier = (session as { user: { tier?: string } }).user?.tier ?? 'free';
    setOracleLoading(true);
    Promise.all([
      fetch('/api/studio/oracle-boost/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      }).then((r) => r.json()),
      fetch(`/api/studio/oracle-boost/telemetry?tier=${tier}&limit=200`).then((r) => r.json()),
    ])
      .then(([oStatus, telemetry]) => {
        setOracleStatus(oStatus as OracleStatus);
        setOracleTelemetry(telemetry);
      })
      .catch((err) => {
        logger.warn('[SettingsView] loading oracle status/telemetry failed:', err);
      })
      .finally(() => setOracleLoading(false));
  }, [session?.user?.id]);

  // ── Bridge data into composition state ────────────────────────────────────
  useEffect(() => {
    if (!composition.loading) {
      composition.setState({
        displayName,
        bio,
        website,
        saving,
        saved,
        stripeStatus,
        totalEarningsCents,
        oracleReady: oracleStatus?.oracle_ready ?? false,
        oracleAlwaysOn: oracleStatus?.always_on ?? false,
        oracleTier: oracleStatus?.tier ?? '',
        oracleLoading,
        oracleConsultations: oracleTelemetry?.total_entries ?? 0,
        isSignedIn: !!session?.user,
        sessionLoading: status === 'loading',
        email: session?.user?.email ?? '',
        userId: session?.user?.id ?? '',
      });
    }
  }, [
    displayName,
    bio,
    website,
    saving,
    saved,
    stripeStatus,
    totalEarningsCents,
    oracleStatus,
    oracleLoading,
    oracleTelemetry,
    session,
    status,
    composition.loading,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Async handlers ─────────────────────────────────────────────────────────

  async function saveProfile() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch(`/api/users/${session!.user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, bio, website }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), SAVE_FEEDBACK_DURATION);
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  }

  async function startStripeConnect() {
    setConnectingStripe(true);
    try {
      const res = await fetch('/api/stripe/connect', { method: 'POST' });
      const data = await res.json();
      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl;
      } else if (data.status === 'complete') {
        setStripeStatus('complete');
      }
    } catch {
      // Silently fail
    } finally {
      setConnectingStripe(false);
    }
  }

  async function runOracleSetup() {
    setOracleSetupRunning(true);
    try {
      const tier = (session as { user: { tier?: string } }).user?.tier ?? 'free';
      await fetch('/api/studio/oracle-boost/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      // Re-poll status after setup
      const updated = await fetch('/api/studio/oracle-boost/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      }).then((r) => r.json());
      setOracleStatus(updated as OracleStatus);
    } catch {
      // Silently fail
    } finally {
      setOracleSetupRunning(false);
    }
  }

  // ── Emit handler ───────────────────────────────────────────────────────────

  const handleEmit = (event: string) => {
    if (event === 'save') {
      void saveProfile();
    } else if (event === 'stripe-setup') {
      void startStripeConnect();
    } else if (event === 'oracle-setup') {
      void runOracleSetup();
    }
  };

  // ── Form inputs (React-controlled; must stay in host) ─────────────────────
  // HoloSurfaceRenderer input is readOnly — controlled inputs live here and
  // compose a @slot-style overlay over the rendered surface.

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #444',
    background: '#222',
    color: '#eee',
    fontSize: 14,
    outline: 'none',
  } as const;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {!composition.loading && !composition.error ? (
        <>
          <HoloSurfaceRenderer
            nodes={composition.nodes}
            state={composition.state}
            computed={composition.computed}
            templates={composition.templates}
            onEmit={handleEmit}
            className="holo-surface-settings"
          />
          {/* Form inputs overlay — kept in host because HoloSurfaceRenderer
              renders inputs as readOnly; controlled state lives here */}
          {composition.state['showContent'] && (
            <div
              style={{
                maxWidth: 600,
                margin: '0 auto',
                padding: '0 24px',
                fontFamily: 'system-ui',
              }}
            >
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#888' }}>
                  Display Name
                </span>
                <input
                  style={inputStyle}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                />
              </label>

              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#888' }}>
                  Bio
                </span>
                <textarea
                  style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about yourself"
                />
              </label>

              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={{ display: 'block', marginBottom: 4, fontSize: 13, color: '#888' }}>
                  Website
                </span>
                <input
                  style={inputStyle}
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yoursite.com"
                />
              </label>
            </div>
          )}
        </>
      ) : (
        // Fallback while composition loads — minimal shell keeps layout stable
        <div style={{ maxWidth: 600, margin: '0 auto', padding: 24, fontFamily: 'system-ui' }}>
          <h1 style={{ fontSize: 24, marginBottom: 24 }}>Settings</h1>

          {status === 'loading' && (
            <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading...</div>
          )}

          {status !== 'loading' && !session?.user && (
            <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
              Please sign in to access settings.
            </div>
          )}
        </div>
      )}
    </>
  );
}
