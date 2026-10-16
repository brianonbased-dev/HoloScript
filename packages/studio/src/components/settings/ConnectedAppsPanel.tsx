'use client';

/**
 * Connected apps: every agent the signed-in user has approved through Studio's
 * OAuth consent page, with a Revoke button. Revoking ends that agent's access
 * and refresh tokens at once (mcp-server revokeGrant). App names are chosen by
 * the app itself and are not verified, so the app id is shown too.
 */
import React, { useCallback, useEffect, useState } from 'react';

export interface ConnectedApp {
  id: string;
  client_id: string;
  client_name: string | null;
  client_name_verified: boolean;
  scopes: string[];
  created_at: string;
  last_used_at: string;
}

const SCOPE_TEXT: Record<string, string> = {
  'tools:read': 'Use read-only HoloScript tools',
  'tools:write': 'Use HoloScript tools that change things',
  social: 'Post and read on HoloMesh as you',
  'user:private': 'See your private data (earnings, credits)',
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? 'unknown'
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function ConnectedAppsPanel() {
  const [apps, setApps] = useState<ConnectedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/oauth/grants', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as { grants?: ConnectedApp[] };
      if (!res.ok) {
        setError('Could not load connected apps.');
        setApps([]);
      } else {
        setApps(data.grants ?? []);
      }
    } catch {
      setError('Could not load connected apps.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (app: ConnectedApp) => {
    setRevokingId(app.id);
    setError('');
    try {
      const res = await fetch(`/api/oauth/grants?id=${encodeURIComponent(app.id)}`, {
        method: 'DELETE',
      });
      if (res.status === 204 || res.status === 404) {
        setApps((prev) => prev.filter((a) => a.id !== app.id));
      } else {
        setError('Could not revoke that app. Try again.');
      }
    } catch {
      setError('Could not revoke that app. Try again.');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="cap-panel" data-testid="connected-apps">
      <div className="cap-header">
        <h2>Connected apps</h2>
        <span className="cap-badge">Agent access</span>
      </div>
      <p className="cap-description">
        Agents and apps you approved to act for you. Revoke one to cut off its access right away.
      </p>

      {loading ? (
        <div className="cap-empty">Loading…</div>
      ) : apps.length === 0 ? (
        <div className="cap-empty">{error ? '' : 'No connected apps.'}</div>
      ) : (
        <ul className="cap-list">
          {apps.map((app) => (
            <li key={app.id} className="cap-row">
              <div className="cap-info">
                <span className="cap-name">
                  {app.client_name || 'Unnamed app'}
                  {!app.client_name_verified && (
                    <span className="cap-unverified" title="The app chose this name; it is not verified.">
                      Unverified name
                    </span>
                  )}
                </span>
                <span className="cap-meta">App id: {app.client_id}</span>
                <ul className="cap-scopes">
                  {app.scopes.map((s) => (
                    <li key={s}>{SCOPE_TEXT[s] ?? `Permission: ${s}`}</li>
                  ))}
                </ul>
                <span className="cap-meta">
                  Approved {fmt(app.created_at)} · Last used {fmt(app.last_used_at)}
                </span>
              </div>
              <button
                className="cap-btn-revoke"
                onClick={() => void revoke(app)}
                disabled={revokingId === app.id}
                aria-label={`Revoke ${app.client_name || app.client_id}`}
              >
                {revokingId === app.id ? 'Revoking…' : 'Revoke'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="cap-status" role="alert">
          {error}
        </div>
      )}

      <style jsx>{`
        .cap-panel {
          background: #1a1a2e;
          border-radius: 12px;
          padding: 24px;
          color: #e0e0e0;
          max-width: 700px;
          margin: 24px auto 0;
        }
        .cap-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }
        .cap-header h2 {
          margin: 0;
          font-size: 1.25rem;
        }
        .cap-badge {
          font-size: 0.75rem;
          padding: 2px 8px;
          border-radius: 999px;
          background: #2d2d4a;
          color: #a0a0ff;
        }
        .cap-description {
          color: #aaa;
          font-size: 0.875rem;
          margin: 0 0 16px;
        }
        .cap-empty {
          color: #888;
          font-size: 0.875rem;
          padding: 12px 0;
        }
        .cap-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .cap-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          padding: 12px;
          border-radius: 8px;
          background: #22223a;
        }
        .cap-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .cap-name {
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cap-unverified {
          font-size: 0.7rem;
          font-weight: 500;
          padding: 1px 6px;
          border-radius: 4px;
          background: #4a3a1a;
          color: #ffcc66;
        }
        .cap-meta {
          font-size: 0.75rem;
          color: #888;
          word-break: break-all;
        }
        .cap-scopes {
          margin: 0;
          padding-left: 18px;
          font-size: 0.8rem;
          color: #ccc;
        }
        .cap-btn-revoke {
          background: transparent;
          border: 1px solid #ff6b6b;
          color: #ff6b6b;
          border-radius: 6px;
          padding: 6px 12px;
          cursor: pointer;
          flex-shrink: 0;
        }
        .cap-btn-revoke:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .cap-status {
          margin-top: 12px;
          font-size: 0.875rem;
          color: #ff9b9b;
        }
      `}</style>
    </div>
  );
}
