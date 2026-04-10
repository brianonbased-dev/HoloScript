'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

/**
 * /u/[username] — Public user profile page.
 *
 * Displays the user's public projects, marketplace listings,
 * bio, and avatar. Viewable by anyone.
 */

interface UserProfile {
  user: {
    id: string;
    name: string;
    avatar: string | null;
    bio: string | null;
    website: string | null;
    joinedAt: string;
  };
  projects: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    createdAt: string;
  }>;
  listings: Array<{
    id: string;
    title: string;
    description: string | null;
    priceCents: number;
    currency: string;
    createdAt: string;
  }>;
}

export default function UserProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/users/${username}`);
        if (!res.ok) {
          setError(res.status === 404 ? 'User not found' : 'Failed to load profile');
          return;
        }
        setProfile(await res.json());
      } catch {
        setError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [username]);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading profile...</div>
    );
  }

  if (error || !profile) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#f44' }}>
        {error ?? 'Profile not found'}
      </div>
    );
  }

  const { user, projects, listings } = profile;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 24, fontFamily: 'system-ui' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
        {user.avatar ? (
          <img
            src={user.avatar}
            alt={user.name}
            style={{ width: 64, height: 64, borderRadius: '50%' }}
          />
        ) : (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#333',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              color: '#fff',
            }}
          >
            {user.name?.[0]?.toUpperCase() ?? '?'}
          </div>
        )}
        <div>
          <h1 style={{ margin: 0, fontSize: 24 }}>{user.name}</h1>
          {user.bio && <p style={{ margin: '4px 0 0', color: '#888' }}>{user.bio}</p>}
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666' }}>
            Joined {new Date(user.joinedAt).toLocaleDateString()}
            {user.website && (
              <>
                {' · '}
                <a
                  href={user.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#4af' }}
                >
                  {user.website.replace(/^https?:\/\//, '')}
                </a>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Public Projects */}
      {projects.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Projects</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 12,
            }}
          >
            {projects.map((p) => (
              <a
                key={p.id}
                href={`/view/${p.id}`}
                style={{
                  display: 'block',
                  padding: 16,
                  borderRadius: 8,
                  border: '1px solid #333',
                  background: '#1a1a1a',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                {p.description && (
                  <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
                    {p.description.slice(0, 100)}
                  </div>
                )}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Marketplace Listings */}
      {listings.length > 0 && (
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Marketplace</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 12,
            }}
          >
            {listings.map((l) => (
              <div
                key={l.id}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  border: '1px solid #333',
                  background: '#1a1a1a',
                }}
              >
                <div style={{ fontWeight: 600 }}>{l.title}</div>
                {l.description && (
                  <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
                    {l.description.slice(0, 100)}
                  </div>
                )}
                <div style={{ marginTop: 8, fontWeight: 600, color: '#4f4' }}>
                  {l.priceCents === 0
                    ? 'Free'
                    : `$${(l.priceCents / 100).toFixed(2)} ${l.currency}`}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {projects.length === 0 && listings.length === 0 && (
        <p style={{ textAlign: 'center', color: '#666', marginTop: 40 }}>
          This user hasn't published anything yet.
        </p>
      )}
    </div>
  );
}
