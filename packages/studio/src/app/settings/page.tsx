'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';
import { SAVE_FEEDBACK_DURATION } from '@/lib/ui-timings';

/**
 * /settings — Account settings page.
 *
 * Allows users to:
 *   - Edit display name, bio, website
 *   - Set up Stripe Connect for marketplace payouts
 *   - View earnings summary
 */

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Stripe Connect state
  const [stripeStatus, setStripeStatus] = useState<
    'loading' | 'not_started' | 'pending' | 'complete'
  >('loading');
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [connectingStripe, setConnectingStripe] = useState(false);

  // Oracle Boost state
  type OracleStatus = {
    oracle_ready: boolean;
    always_on: boolean;
    tier: string;
    ide_client: string;
    hardware_target: string;
    checks: Record<string, string | number | undefined>;
    message?: string;
  };
  const [oracleStatus, setOracleStatus] = useState<OracleStatus | null>(null);
  const [oracleLoading, setOracleLoading] = useState(false);
  const [oracleSetupRunning, setOracleSetupRunning] = useState(false);
  const [oracleSetupResult, setOracleSetupResult] = useState<string | null>(null);
  const [oracleTelemetry, setOracleTelemetry] = useState<{ total_entries: number; summary: Record<string, Record<string, number>> } | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;

    // Load existing profile
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

    // Load Stripe Connect status
    fetch('/api/stripe/connect')
      .then((r) => r.json())
      .then((data) => {
        setStripeStatus(data.status ?? 'not_started');
        setTotalEarnings(data.totalEarningsCents ?? 0);
      })
      .catch(() => setStripeStatus('not_started'));

    // Load Oracle Boost status
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
      .then(([status, telemetry]) => {
        setOracleStatus(status as OracleStatus);
        setOracleTelemetry(telemetry);
      })
      .catch((err) => { logger.warn('[SettingsPage] loading oracle status/telemetry failed:', err); })
      .finally(() => setOracleLoading(false));
  }, [session?.user?.id]);

  if (status === 'loading') {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading...</div>;
  }

  if (!session?.user) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>
        Please sign in to access settings.
      </div>
    );
  }

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

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 24, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Settings</h1>

      {/* Profile Section */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>Profile</h2>

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

        <button
          onClick={saveProfile}
          disabled={saving}
          style={{
            padding: '8px 20px',
            borderRadius: 6,
            border: 'none',
            background: saved ? '#2a5' : '#4af',
            color: '#fff',
            fontSize: 14,
            cursor: saving ? 'wait' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save Profile'}
        </button>
      </section>

      {/* Stripe Connect Section */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>Creator Payouts</h2>

        {stripeStatus === 'loading' && <p style={{ color: '#888' }}>Checking payment setup...</p>}

        {stripeStatus === 'not_started' && (
          <div>
            <p style={{ color: '#888', marginBottom: 12 }}>
              Set up Stripe Connect to receive payouts when your marketplace items sell. Creators
              receive 80% of each sale.
            </p>
            <button
              onClick={startStripeConnect}
              disabled={connectingStripe}
              style={{
                padding: '10px 24px',
                borderRadius: 6,
                border: 'none',
                background: '#635bff',
                color: '#fff',
                fontSize: 14,
                cursor: connectingStripe ? 'wait' : 'pointer',
              }}
            >
              {connectingStripe ? 'Setting up...' : 'Set Up Payouts'}
            </button>
          </div>
        )}

        {stripeStatus === 'pending' && (
          <div>
            <p style={{ color: '#fa0', marginBottom: 12 }}>
              Stripe Connect onboarding is not yet complete. Click below to continue.
            </p>
            <button
              onClick={startStripeConnect}
              disabled={connectingStripe}
              style={{
                padding: '10px 24px',
                borderRadius: 6,
                border: 'none',
                background: '#635bff',
                color: '#fff',
                fontSize: 14,
                cursor: connectingStripe ? 'wait' : 'pointer',
              }}
            >
              {connectingStripe ? 'Loading...' : 'Continue Setup'}
            </button>
          </div>
        )}

        {stripeStatus === 'complete' && (
          <div>
            <p style={{ color: '#4f4', marginBottom: 8 }}>
              Payouts are set up. You'll receive 80% of each marketplace sale.
            </p>
            <p style={{ fontSize: 24, fontWeight: 700 }}>
              Total Earnings: ${(totalEarnings / 100).toFixed(2)}
            </p>
          </div>
        )}
      </section>

      {/* Oracle Boost Section */}
      <section style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Oracle Boost</h2>
          {oracleStatus?.always_on && (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                background: '#1a3',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              Always On
            </span>
          )}
          {oracleStatus && !oracleStatus.always_on && (
            <span
              style={{
                padding: '2px 8px',
                borderRadius: 4,
                background: oracleStatus.oracle_ready ? '#1a3' : '#a31',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              {oracleStatus.oracle_ready ? 'Ready' : 'Not Ready'}
            </span>
          )}
        </div>

        {oracleLoading && <p style={{ color: '#888' }}>Checking oracle status...</p>}

        {oracleStatus && (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#888' }}>Tier: <strong style={{ color: '#eee' }}>{oracleStatus.tier}</strong></span>
              <span style={{ fontSize: 12, color: '#888' }}>IDE: <strong style={{ color: '#eee' }}>{oracleStatus.ide_client}</strong></span>
              <span style={{ fontSize: 12, color: '#888' }}>Hardware: <strong style={{ color: '#eee' }}>{oracleStatus.hardware_target}</strong></span>
            </div>

            {!oracleStatus.always_on && (
              <div
                style={{
                  background: '#1a1a2e',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 12,
                  fontSize: 13,
                }}
              >
                {Object.entries(oracleStatus.checks)
                  .filter(([k]) => !k.endsWith('_entry_count'))
                  .map(([key, val]) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '4px 0',
                        borderBottom: '1px solid #2a2a3e',
                      }}
                    >
                      <span style={{ color: '#aaa' }}>{key.replace(/_/g, ' ')}</span>
                      <span
                        style={{
                          color:
                            val === 'pass' ? '#4f4' : val === 'fail' ? '#f44' : '#888',
                          fontWeight: 600,
                        }}
                      >
                        {String(val)}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {!oracleStatus.oracle_ready && !oracleStatus.always_on && (
              <>
                {oracleStatus.message && (
                  <p style={{ color: '#fa0', fontSize: 13, marginBottom: 10 }}>
                    {oracleStatus.message}
                  </p>
                )}
                <button
                  onClick={async () => {
                    setOracleSetupRunning(true);
                    setOracleSetupResult(null);
                    try {
                      const tier = (session as { user: { tier?: string } }).user?.tier ?? 'free';
                      const res = await fetch('/api/studio/oracle-boost/setup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tier }),
                      });
                      const data = await res.json();
                      setOracleSetupResult(data.message ?? 'Done');
                      // Re-fetch status
                      const updated = await fetch('/api/studio/oracle-boost/status', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tier }),
                      }).then((r) => r.json());
                      setOracleStatus(updated as OracleStatus);
                    } catch {
                      setOracleSetupResult('Setup failed. Check console.');
                    } finally {
                      setOracleSetupRunning(false);
                    }
                  }}
                  disabled={oracleSetupRunning}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#4af',
                    color: '#fff',
                    fontSize: 14,
                    cursor: oracleSetupRunning ? 'wait' : 'pointer',
                    marginBottom: 8,
                  }}
                >
                  {oracleSetupRunning ? 'Setting up...' : 'Run Setup'}
                </button>
                {oracleSetupResult && (
                  <p style={{ fontSize: 13, color: '#aaa', marginTop: 6 }}>{oracleSetupResult}</p>
                )}
              </>
            )}

            {oracleTelemetry && oracleTelemetry.total_entries > 0 && (
              <div
                style={{
                  background: '#111',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginTop: 8,
                  fontSize: 12,
                  color: '#888',
                }}
              >
                <div style={{ marginBottom: 4, color: '#ccc', fontWeight: 600 }}>
                  Telemetry — {oracleTelemetry.total_entries} consultations
                </div>
                {Object.entries(oracleTelemetry.summary).map(([group, counts]) => (
                  <div key={group} style={{ marginTop: 6 }}>
                    <span style={{ color: '#666', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
                      {group.replace('by', 'by ')}
                    </span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
                      {Object.entries(counts).map(([k, v]) => (
                        <span key={k} style={{ background: '#1e1e2e', padding: '2px 6px', borderRadius: 4 }}>
                          {k}: {v}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Account Info */}
      <section>
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>Account</h2>
        <div style={{ fontSize: 13, color: '#888' }}>
          <p>Email: {session.user.email}</p>
          <p>User ID: {session.user.id}</p>
        </div>
      </section>
    </div>
  );
}
