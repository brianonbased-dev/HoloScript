'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { STATUS_RESET_DURATION } from '@/lib/ui-timings';

interface ApiKey {
  id: string;
  label: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface NewKeyReveal {
  rawKey: string;
  id: string;
}

export default function BrittneyAPIKeysPanel() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<NewKeyReveal | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const flash = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(''), STATUS_RESET_DURATION);
  };

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/api-keys');
      if (res.ok) {
        const data = await res.json();
        setKeys((data.keys ?? []) as ApiKey[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/user/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel }),
      });
      if (res.ok) {
        const data = await res.json();
        setRevealed({ rawKey: data.rawKey as string, id: data.id as string });
        setNewLabel('');
        await loadKeys();
      } else {
        const err = await res.json();
        flash((err as { error?: string }).error ?? 'Failed to create key');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!revealed) return;
    await navigator.clipboard.writeText(revealed.rawKey);
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setRevealed(null);
    }, 3000);
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this key? Any requests using it will fail immediately.')) return;
    setRevokingId(id);
    try {
      const res = await fetch(`/api/user/api-keys/${id}`, { method: 'DELETE' });
      if (res.ok) {
        flash('Key revoked');
        await loadKeys();
      }
    } finally {
      setRevokingId(null);
    }
  };

  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const activeKeys = keys.filter((k) => !k.revokedAt);
  const revokedKeys = keys.filter((k) => k.revokedAt);

  return (
    <div className="bak-panel">
      <div className="bak-header">
        <h2>Brittney API Keys</h2>
        <span className="bak-badge">Programmatic Access</span>
      </div>

      <div className="bak-description">
        <p>
          Call Brittney from scripts, terminals, and AI agents — no browser session required.
          <br />
          Each key is shown <strong>once</strong> at creation and never again.
        </p>
        <p className="bak-note">
          Usage: <code>Authorization: Bearer bk_…</code> on any request to{' '}
          <code>/api/brittney</code>
        </p>
      </div>

      {/* One-time reveal banner */}
      {revealed && (
        <div className="bak-reveal">
          <div className="bak-reveal-header">
            <span>Copy your key now — it will not be shown again</span>
            <button className="bak-dismiss" onClick={() => setRevealed(null)}>
              ✕
            </button>
          </div>
          <div className="bak-reveal-key">
            <code>{revealed.rawKey}</code>
            <button className={`bak-copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy}>
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      <div className="bak-section">
        <h3>Create new key</h3>
        <div className="bak-create-row">
          <input
            type="text"
            className="bak-input"
            placeholder="Label (optional, e.g. &quot;my agent&quot;)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            maxLength={64}
          />
          <button
            className="bak-btn-create"
            onClick={() => void handleCreate()}
            disabled={creating || activeKeys.length >= 10}
          >
            {creating ? 'Creating…' : 'Create Key'}
          </button>
        </div>
        {activeKeys.length >= 10 && (
          <p className="bak-limit-note">
            Maximum 10 active keys. Revoke one before creating a new key.
          </p>
        )}
      </div>

      {/* Active keys */}
      <div className="bak-section">
        <h3>Active keys ({activeKeys.length})</h3>
        {loading ? (
          <div className="bak-empty">Loading…</div>
        ) : activeKeys.length === 0 ? (
          <div className="bak-empty">No active keys — create one above.</div>
        ) : (
          <div className="bak-key-list">
            {activeKeys.map((key) => (
              <div key={key.id} className="bak-key-row">
                <div className="bak-key-info">
                  <span className="bak-key-prefix">{key.keyPrefix}…</span>
                  {key.label && <span className="bak-key-label">{key.label}</span>}
                  <span className="bak-key-meta">
                    Created {fmt(key.createdAt)} · Last used {fmt(key.lastUsedAt)}
                  </span>
                </div>
                <button
                  className="bak-btn-revoke"
                  onClick={() => void handleRevoke(key.id)}
                  disabled={revokingId === key.id}
                >
                  {revokingId === key.id ? 'Revoking…' : 'Revoke'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Revoked keys (collapsed) */}
      {revokedKeys.length > 0 && (
        <details className="bak-revoked">
          <summary>Revoked keys ({revokedKeys.length})</summary>
          <div className="bak-key-list">
            {revokedKeys.map((key) => (
              <div key={key.id} className="bak-key-row revoked">
                <div className="bak-key-info">
                  <span className="bak-key-prefix">{key.keyPrefix}…</span>
                  {key.label && <span className="bak-key-label">{key.label}</span>}
                  <span className="bak-key-meta">Revoked {fmt(key.revokedAt)}</span>
                </div>
                <span className="bak-revoked-tag">Revoked</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {statusMsg && <div className="bak-status">{statusMsg}</div>}

      <style jsx>{`
        .bak-panel {
          background: #1a1a2e;
          border-radius: 12px;
          padding: 24px;
          color: #e0e0e0;
          max-width: 700px;
          margin: 0 auto;
        }

        .bak-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .bak-header h2 {
          margin: 0;
          font-size: 24px;
          color: #ffffff;
        }

        .bak-badge {
          padding: 4px 10px;
          background: #007bff;
          color: #ffffff;
          font-size: 12px;
          border-radius: 4px;
          font-weight: 600;
        }

        .bak-description {
          margin-bottom: 24px;
          padding: 16px;
          background: rgba(0, 123, 255, 0.1);
          border-radius: 8px;
          border-left: 4px solid #007bff;
        }

        .bak-description p {
          margin: 0 0 8px 0;
          line-height: 1.6;
        }

        .bak-description p:last-child {
          margin-bottom: 0;
        }

        .bak-note {
          font-size: 13px;
          color: #aaa;
        }

        .bak-note code {
          background: rgba(255, 255, 255, 0.08);
          padding: 1px 5px;
          border-radius: 3px;
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 12px;
        }

        /* One-time reveal */
        .bak-reveal {
          margin-bottom: 24px;
          padding: 16px;
          background: rgba(40, 167, 69, 0.12);
          border: 1px solid #28a745;
          border-radius: 8px;
        }

        .bak-reveal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-weight: 600;
          color: #28a745;
        }

        .bak-dismiss {
          background: transparent;
          border: none;
          color: #888;
          font-size: 16px;
          cursor: pointer;
          padding: 0 4px;
          line-height: 1;
        }

        .bak-dismiss:hover {
          color: #ffffff;
        }

        .bak-reveal-key {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .bak-reveal-key code {
          flex: 1;
          padding: 10px 12px;
          background: #0f1419;
          border: 1px solid #28a745;
          border-radius: 6px;
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 13px;
          color: #28a745;
          word-break: break-all;
        }

        .bak-copy-btn {
          padding: 10px 18px;
          background: #28a745;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
          white-space: nowrap;
        }

        .bak-copy-btn:hover {
          background: #218838;
        }

        .bak-copy-btn.copied {
          background: #155724;
        }

        /* Section */
        .bak-section {
          padding: 20px;
          background: #16213e;
          border-radius: 8px;
          border: 1px solid #2a2a4a;
          margin-bottom: 16px;
        }

        .bak-section h3 {
          margin: 0 0 14px 0;
          font-size: 16px;
          color: #ffffff;
        }

        /* Create form */
        .bak-create-row {
          display: flex;
          gap: 8px;
        }

        .bak-input {
          flex: 1;
          padding: 10px 12px;
          background: #0f1419;
          border: 1px solid #2a2a4a;
          border-radius: 6px;
          color: #ffffff;
          font-size: 14px;
        }

        .bak-input:focus {
          outline: none;
          border-color: #007bff;
        }

        .bak-input::placeholder {
          color: #555;
        }

        .bak-btn-create {
          padding: 10px 18px;
          background: #007bff;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
          white-space: nowrap;
        }

        .bak-btn-create:hover:not(:disabled) {
          background: #0056b3;
        }

        .bak-btn-create:disabled {
          background: #555;
          cursor: not-allowed;
          opacity: 0.6;
        }

        .bak-limit-note {
          margin: 8px 0 0 0;
          font-size: 13px;
          color: #e67e22;
        }

        /* Key list */
        .bak-key-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .bak-key-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 14px;
          background: #0f1419;
          border-radius: 6px;
          border: 1px solid #2a2a4a;
          gap: 12px;
        }

        .bak-key-row.revoked {
          opacity: 0.55;
        }

        .bak-key-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }

        .bak-key-prefix {
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 13px;
          color: #ffffff;
        }

        .bak-key-label {
          font-size: 13px;
          color: #aaa;
        }

        .bak-key-meta {
          font-size: 12px;
          color: #666;
        }

        .bak-btn-revoke {
          padding: 6px 14px;
          background: transparent;
          color: #dc3545;
          border: 1px solid #dc3545;
          border-radius: 5px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .bak-btn-revoke:hover:not(:disabled) {
          background: #dc3545;
          color: #ffffff;
        }

        .bak-btn-revoke:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .bak-empty {
          color: #666;
          font-size: 14px;
          padding: 8px 0;
        }

        /* Revoked section */
        .bak-revoked {
          padding: 14px 16px;
          background: #16213e;
          border-radius: 8px;
          border: 1px solid #2a2a4a;
          margin-bottom: 16px;
        }

        .bak-revoked summary {
          cursor: pointer;
          font-size: 14px;
          color: #888;
          user-select: none;
        }

        .bak-revoked .bak-key-list {
          margin-top: 12px;
        }

        .bak-revoked-tag {
          font-size: 12px;
          padding: 3px 8px;
          background: rgba(220, 53, 69, 0.15);
          color: #dc3545;
          border-radius: 4px;
          flex-shrink: 0;
        }

        /* Status flash */
        .bak-status {
          padding: 10px 14px;
          background: rgba(40, 167, 69, 0.2);
          color: #28a745;
          border-radius: 6px;
          font-size: 14px;
          animation: bakFadeIn 0.2s;
        }

        @keyframes bakFadeIn {
          from {
            opacity: 0;
            transform: translateY(-6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
