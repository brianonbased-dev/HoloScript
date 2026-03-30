'use client';

/**
 * GitHubOAuthModal — GitHub OAuth Device Flow UI
 *
 * Handles the GitHub OAuth device authorization flow:
 * 1. Request device code from backend
 * 2. Show user_code and verification URL to user
 * 3. Poll backend until user authorizes
 * 4. Return access token to parent
 *
 * @module components/integrations/GitHubOAuthModal
 */

import { useState, useEffect } from 'react';
import { X, ExternalLink, CheckCircle, Loader2, AlertCircle, Copy, Check } from 'lucide-react';

interface GitHubOAuthModalProps {
  onSuccess: (accessToken: string) => void;
  onClose: () => void;
}

type OAuthState = 'initializing' | 'waiting_for_user' | 'polling' | 'success' | 'error' | 'expired';

interface DeviceCodeData {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export function GitHubOAuthModal({ onSuccess, onClose }: GitHubOAuthModalProps) {
  const [state, setState] = useState<OAuthState>('initializing');
  const [deviceData, setDeviceData] = useState<DeviceCodeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expiresIn, setExpiresIn] = useState<number>(0);

  // Start device flow
  useEffect(() => {
    startDeviceFlow();
  }, []);

  // Countdown timer for expiration
  useEffect(() => {
    if (deviceData && expiresIn > 0) {
      const timer = setTimeout(() => {
        setExpiresIn((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (expiresIn === 0 && deviceData) {
      setState('expired');
    }
  }, [expiresIn, deviceData]);

  const startDeviceFlow = async () => {
    try {
      setState('initializing');
      setError(null);

      const response = await fetch('/api/connectors/oauth/github/start', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || 'Failed to start OAuth flow');
      }

      const data: DeviceCodeData = await response.json();
      setDeviceData(data);
      setExpiresIn(data.expires_in);
      setState('waiting_for_user');

      // Start polling
      pollForAuthorization(data.device_code, data.interval);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const pollForAuthorization = async (deviceCode: string, interval: number) => {
    setState('polling');

    let attempts = 0;
    const maxAttempts = 120; // 10 minutes at 5-second intervals

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setState('expired');
        setError('Authorization timed out');
        return;
      }

      attempts++;

      try {
        const response = await fetch('/api/connectors/oauth/github/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device_code: deviceCode }),
        });

        const data = await response.json();

        if (data.status === 'success') {
          setState('success');
          onSuccess(data.access_token);
          setTimeout(() => {
            onClose();
          }, 1500);
          return;
        }

        if (data.status === 'error') {
          setState('error');
          setError(data.error);
          return;
        }

        if (data.status === 'slow_down') {
          // Increase interval if GitHub tells us to slow down
          setTimeout(poll, (interval + 5) * 1000);
          return;
        }

        if (data.status === 'pending') {
          // Continue polling
          setTimeout(poll, interval * 1000);
          return;
        }
      } catch (err) {
        setState('error');
        setError(err instanceof Error ? err.message : 'Polling failed');
      }
    };

    // Start first poll after interval
    setTimeout(poll, interval * 1000);
  };

  const handleCopyCode = async () => {
    if (deviceData?.user_code) {
      await navigator.clipboard.writeText(deviceData.user_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a12] p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Connect GitHub</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-white/40 transition hover:bg-white/10 hover:text-white/80"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4">
          {/* Initializing */}
          {state === 'initializing' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
              <p className="text-sm text-white/60">Initializing OAuth flow...</p>
            </div>
          )}

          {/* Waiting for user authorization */}
          {(state === 'waiting_for_user' || state === 'polling') && deviceData && (
            <div className="space-y-4">
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                <p className="mb-3 text-sm text-white/80">
                  To authorize HoloScript Studio, visit GitHub and enter this code:
                </p>

                {/* User Code */}
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex-1 rounded-lg bg-white/5 px-4 py-3 font-mono text-2xl font-bold tracking-wider text-indigo-300">
                    {deviceData.user_code}
                  </div>
                  <button
                    onClick={handleCopyCode}
                    className="rounded-lg bg-white/10 p-3 transition hover:bg-white/20"
                    title="Copy code"
                  >
                    {copied ? (
                      <Check className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <Copy className="h-5 w-5 text-white/70" />
                    )}
                  </button>
                </div>

                {/* Verification URL */}
                <a
                  href={deviceData.verification_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-lg bg-indigo-500/20 px-4 py-2 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/30"
                >
                  Open GitHub Authorization
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>

              {/* Status */}
              <div className="flex items-center gap-3 rounded-lg bg-white/5 px-4 py-3">
                {state === 'polling' && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                    <span className="text-sm text-white/70">Waiting for authorization...</span>
                  </>
                )}
                {state === 'waiting_for_user' && (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-400" />
                    <span className="text-sm text-white/70">Please authorize on GitHub</span>
                  </>
                )}
                <div className="ml-auto font-mono text-xs text-white/40">
                  {formatTime(expiresIn)}
                </div>
              </div>
            </div>
          )}

          {/* Success */}
          {state === 'success' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <CheckCircle className="h-12 w-12 text-emerald-400" />
              <div className="text-center">
                <p className="text-lg font-semibold text-white">Connected!</p>
                <p className="text-sm text-white/60">GitHub successfully authorized</p>
              </div>
            </div>
          )}

          {/* Error */}
          {(state === 'error' || state === 'expired') && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                <div>
                  <p className="text-sm font-medium text-red-300">
                    {state === 'expired' ? 'Authorization Expired' : 'Authorization Failed'}
                  </p>
                  <p className="text-xs text-red-400/70">{error || 'Please try again'}</p>
                </div>
              </div>

              <button
                onClick={startDeviceFlow}
                className="w-full rounded-lg bg-indigo-500/20 px-4 py-2 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/30"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
