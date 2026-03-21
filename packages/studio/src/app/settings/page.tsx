'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';

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
  const [stripeStatus, setStripeStatus] = useState<'loading' | 'not_started' | 'pending' | 'complete'>('loading');
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [connectingStripe, setConnectingStripe] = useState(false);

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
      .catch(() => {});

    // Load Stripe Connect status
    fetch('/api/stripe/connect')
      .then((r) => r.json())
      .then((data) => {
        setStripeStatus(data.status ?? 'not_started');
        setTotalEarnings(data.totalEarningsCents ?? 0);
      })
      .catch(() => setStripeStatus('not_started'));
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
      setTimeout(() => setSaved(false), 2000);
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

        {stripeStatus === 'loading' && (
          <p style={{ color: '#888' }}>Checking payment setup...</p>
        )}

        {stripeStatus === 'not_started' && (
          <div>
            <p style={{ color: '#888', marginBottom: 12 }}>
              Set up Stripe Connect to receive payouts when your marketplace items sell.
              Creators receive 80% of each sale.
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
