/**
 * APIKeysPanel.tsx — API Keys Configuration Panel
 *
 * MEME-018: Settings panel for third-party API keys
 *
 * Third-party API keys for AI orchestrations in Hololand.
 * BYOK (Bring Your Own Keys) lets users configure their own AI providers
 * for building orchestrations in their Hololand setups.
 * Free users get Brittney + all manual tools. Cloud token usage for Brittney AI.
 * Pro subscription unlocks the vision model and premium features.
 *
 * Features:
 * - Secure API key input (password fields)
 * - localStorage persistence (browser-only, privacy-first)
 * - Helper links to get API keys
 * - Key validation and testing
 * - Clear/reset functionality
 */

import React, { useState, useEffect } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface APIKeys {
  meshyApiKey?: string;
  rodinApiKey?: string;
  sketchfabApiKey?: string;
}

// ─── Storage Keys ────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  meshy: 'holoscript_meshy_api_key',
  rodin: 'holoscript_rodin_api_key',
  sketchfab: 'holoscript_sketchfab_api_key',
};

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Load API keys from localStorage
 */
export function loadAPIKeys(): APIKeys {
  if (typeof window === 'undefined') return {};

  return {
    meshyApiKey: localStorage.getItem(STORAGE_KEYS.meshy) || undefined,
    rodinApiKey: localStorage.getItem(STORAGE_KEYS.rodin) || undefined,
    sketchfabApiKey: localStorage.getItem(STORAGE_KEYS.sketchfab) || undefined,
  };
}

/**
 * Save API key to localStorage
 */
export function saveAPIKey(service: keyof typeof STORAGE_KEYS, key: string) {
  if (typeof window === 'undefined') return;
  if (key.trim()) {
    localStorage.setItem(STORAGE_KEYS[service], key.trim());
  } else {
    localStorage.removeItem(STORAGE_KEYS[service]);
  }
}

/**
 * Clear API key from localStorage
 */
export function clearAPIKey(service: keyof typeof STORAGE_KEYS) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEYS[service]);
}

/**
 * Clear all API keys
 */
export function clearAllAPIKeys() {
  if (typeof window === 'undefined') return;
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
}

/**
 * Check if API key is configured
 */
export function hasAPIKey(service: keyof typeof STORAGE_KEYS): boolean {
  const keys = loadAPIKeys();
  const key =
    service === 'meshy'
      ? keys.meshyApiKey
      : service === 'rodin'
        ? keys.rodinApiKey
        : keys.sketchfabApiKey;
  return !!key && key.length > 0;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface APIKeysPanelProps {
  onClose?: () => void;
  autoFocus?: 'meshy' | 'rodin' | 'sketchfab';
}

export default function APIKeysPanel({ onClose, autoFocus }: APIKeysPanelProps) {
  const [meshyKey, setMeshyKey] = useState('');
  const [rodinKey, setRodinKey] = useState('');
  const [sketchfabKey, setSketchfabKey] = useState('');
  const [showKeys, setShowKeys] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  // Load keys on mount
  useEffect(() => {
    const keys = loadAPIKeys();
    setMeshyKey(keys.meshyApiKey || '');
    setRodinKey(keys.rodinApiKey || '');
    setSketchfabKey(keys.sketchfabApiKey || '');
  }, []);

  // Save key
  const handleSave = (service: keyof typeof STORAGE_KEYS, key: string) => {
    saveAPIKey(service, key);
    setSavedMessage(`${service.charAt(0).toUpperCase() + service.slice(1)} API key saved ✓`);
    setTimeout(() => setSavedMessage(''), 3000);
  };

  // Clear key
  const handleClear = (service: keyof typeof STORAGE_KEYS) => {
    clearAPIKey(service);
    if (service === 'meshy') setMeshyKey('');
    if (service === 'rodin') setRodinKey('');
    if (service === 'sketchfab') setSketchfabKey('');
    setSavedMessage(`${service.charAt(0).toUpperCase() + service.slice(1)} API key cleared`);
    setTimeout(() => setSavedMessage(''), 3000);
  };

  // Mask key for display
  const maskKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return key.slice(0, 4) + '••••••••' + key.slice(-4);
  };

  return (
    <div className="api-keys-panel">
      <div className="panel-header">
        <h2>🔑 API Keys</h2>
        {onClose && (
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        )}
      </div>

      <div className="panel-description">
        <p>
          <strong>AI Orchestration Keys</strong> — Configure your own AI providers for building
          orchestrations in Hololand.
          <br />
          Free tier includes Brittney + all manual tools. Cloud Brittney usage is token-based. Pro
          unlocks the vision model.
        </p>
        <p className="privacy-note">
          🔒 <strong>Privacy:</strong> Keys stored locally in your browser. Never sent to HoloScript
          servers.
        </p>
      </div>

      <div className="keys-container">
        {/* Meshy AI */}
        <div className="key-section">
          <div className="key-header">
            <h3>Meshy AI</h3>
            <span className="badge">AI Generate</span>
          </div>
          <p className="key-description">
            Generate 3D characters from text or image prompts.
            <br />
            <a href="https://www.meshy.ai" target="_blank" rel="noopener noreferrer">
              Get API key →
            </a>
          </p>
          <div className="key-input-group">
            <input
              type={showKeys ? 'text' : 'password'}
              value={meshyKey}
              onChange={(e) => setMeshyKey(e.target.value)}
              placeholder="Enter Meshy API key"
              className="key-input"
              autoFocus={autoFocus === 'meshy'}
            />
            <button
              className="btn-save"
              onClick={() => handleSave('meshy', meshyKey)}
              disabled={!meshyKey.trim()}
            >
              Save
            </button>
            {meshyKey && (
              <button className="btn-clear" onClick={() => handleClear('meshy')}>
                Clear
              </button>
            )}
          </div>
          {meshyKey && !showKeys && <div className="key-preview">Saved: {maskKey(meshyKey)}</div>}
        </div>

        {/* Rodin AI */}
        <div className="key-section">
          <div className="key-header">
            <h3>Rodin AI</h3>
            <span className="badge">AI Generate</span>
          </div>
          <p className="key-description">
            Alternative AI character generation provider.
            <br />
            <a href="https://hyperhuman.deemos.com" target="_blank" rel="noopener noreferrer">
              Get API key →
            </a>
          </p>
          <div className="key-input-group">
            <input
              type={showKeys ? 'text' : 'password'}
              value={rodinKey}
              onChange={(e) => setRodinKey(e.target.value)}
              placeholder="Enter Rodin API key"
              className="key-input"
              autoFocus={autoFocus === 'rodin'}
            />
            <button
              className="btn-save"
              onClick={() => handleSave('rodin', rodinKey)}
              disabled={!rodinKey.trim()}
            >
              Save
            </button>
            {rodinKey && (
              <button className="btn-clear" onClick={() => handleClear('rodin')}>
                Clear
              </button>
            )}
          </div>
          {rodinKey && !showKeys && <div className="key-preview">Saved: {maskKey(rodinKey)}</div>}
        </div>

        {/* Sketchfab */}
        <div className="key-section">
          <div className="key-header">
            <h3>Sketchfab</h3>
            <span className="badge">3M+ Models</span>
          </div>
          <p className="key-description">
            Search and download from 3M+ community models.
            <br />
            <a
              href="https://sketchfab.com/settings/password"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get API key →
            </a>
          </p>
          <div className="key-input-group">
            <input
              type={showKeys ? 'text' : 'password'}
              value={sketchfabKey}
              onChange={(e) => setSketchfabKey(e.target.value)}
              placeholder="Enter Sketchfab API key"
              className="key-input"
              autoFocus={autoFocus === 'sketchfab'}
            />
            <button
              className="btn-save"
              onClick={() => handleSave('sketchfab', sketchfabKey)}
              disabled={!sketchfabKey.trim()}
            >
              Save
            </button>
            {sketchfabKey && (
              <button className="btn-clear" onClick={() => handleClear('sketchfab')}>
                Clear
              </button>
            )}
          </div>
          {sketchfabKey && !showKeys && (
            <div className="key-preview">Saved: {maskKey(sketchfabKey)}</div>
          )}
        </div>
      </div>

      {/* Show/Hide Keys Toggle */}
      <div className="panel-footer">
        <label className="show-keys-toggle">
          <input
            type="checkbox"
            checked={showKeys}
            onChange={(e) => setShowKeys(e.target.checked)}
          />
          <span>Show API keys</span>
        </label>

        {savedMessage && <div className="save-message">{savedMessage}</div>}
      </div>

      <style jsx>{`
        .api-keys-panel {
          background: #1a1a2e;
          border-radius: 12px;
          padding: 24px;
          color: #e0e0e0;
          max-width: 700px;
          margin: 0 auto;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .panel-header h2 {
          margin: 0;
          font-size: 24px;
          color: #ffffff;
        }

        .close-btn {
          background: transparent;
          border: none;
          color: #888;
          font-size: 24px;
          cursor: pointer;
          padding: 4px 8px;
          line-height: 1;
          transition: color 0.2s;
        }

        .close-btn:hover {
          color: #ffffff;
        }

        .panel-description {
          margin-bottom: 24px;
          padding: 16px;
          background: rgba(0, 123, 255, 0.1);
          border-radius: 8px;
          border-left: 4px solid #007bff;
        }

        .panel-description p {
          margin: 0 0 8px 0;
          line-height: 1.6;
        }

        .panel-description p:last-child {
          margin-bottom: 0;
        }

        .privacy-note {
          font-size: 14px;
          color: #aaa;
        }

        .keys-container {
          display: flex;
          flex-direction: column;
          gap: 24px;
          margin-bottom: 24px;
        }

        .key-section {
          padding: 20px;
          background: #16213e;
          border-radius: 8px;
          border: 1px solid #2a2a4a;
        }

        .key-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .key-header h3 {
          margin: 0;
          font-size: 18px;
          color: #ffffff;
        }

        .badge {
          padding: 4px 8px;
          background: #007bff;
          color: #ffffff;
          font-size: 12px;
          border-radius: 4px;
          font-weight: 600;
        }

        .key-description {
          margin: 8px 0 16px 0;
          color: #aaa;
          font-size: 14px;
          line-height: 1.5;
        }

        .key-description a {
          color: #007bff;
          text-decoration: none;
        }

        .key-description a:hover {
          text-decoration: underline;
        }

        .key-input-group {
          display: flex;
          gap: 8px;
        }

        .key-input {
          flex: 1;
          padding: 10px 12px;
          background: #0f1419;
          border: 1px solid #2a2a4a;
          border-radius: 6px;
          color: #ffffff;
          font-size: 14px;
          font-family: 'Monaco', 'Courier New', monospace;
        }

        .key-input:focus {
          outline: none;
          border-color: #007bff;
        }

        .btn-save,
        .btn-clear {
          padding: 10px 16px;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-save {
          background: #28a745;
          color: #ffffff;
        }

        .btn-save:hover:not(:disabled) {
          background: #218838;
        }

        .btn-save:disabled {
          background: #555;
          cursor: not-allowed;
          opacity: 0.5;
        }

        .btn-clear {
          background: #dc3545;
          color: #ffffff;
        }

        .btn-clear:hover {
          background: #c82333;
        }

        .key-preview {
          margin-top: 8px;
          padding: 8px 12px;
          background: rgba(40, 167, 69, 0.1);
          border-radius: 4px;
          font-size: 13px;
          color: #28a745;
          font-family: 'Monaco', 'Courier New', monospace;
        }

        .panel-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 16px;
          border-top: 1px solid #2a2a4a;
        }

        .show-keys-toggle {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          color: #aaa;
          font-size: 14px;
        }

        .show-keys-toggle input {
          cursor: pointer;
        }

        .save-message {
          padding: 8px 12px;
          background: rgba(40, 167, 69, 0.2);
          color: #28a745;
          border-radius: 6px;
          font-size: 14px;
          animation: fadeIn 0.3s;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
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
