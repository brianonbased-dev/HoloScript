'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useState, useEffect, type ReactNode, createContext, useContext, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useGlobalHotkeys } from '../hooks/useGlobalHotkeys';
import { ErrorBoundary } from '@holoscript/ui';
import { initAnalytics, identifyUser } from '../lib/analytics';
import { useStudioPresetStore } from '../lib/stores/studioPresetStore';
import { useMagicMoment } from '../hooks/useMagicMoment';
import dynamic from 'next/dynamic';
import { DevToolsInit } from '../components/DevToolsInit';
import { AppShell } from '../components/AppShell';

// Wizards removed for Academy// ═══════════════════════════════════════════════════════════════════
// Theme Context
// ═══════════════════════════════════════════════════════════════════

type Theme = 'dark' | 'light';
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'dark',
  toggle: () => {},
});
export const useTheme = () => useContext(ThemeContext);

// ═══════════════════════════════════════════════════════════════════
// Toast / Notification System
// ═══════════════════════════════════════════════════════════════════

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  durationMs: number;
}

const ToastContext = createContext<{
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type'], durationMs?: number) => void;
  removeToast: (id: string) => void;
}>({
  toasts: [],
  addToast: () => {},
  removeToast: () => {},
});
export const useToast = () => useContext(ToastContext);

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null;

  const typeStyles: Record<Toast['type'], string> = {
    info: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    error: 'border-red-500/30 bg-red-500/10 text-red-300',
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg animate-fade-in ${typeStyles[toast.type]}`}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => onRemove(toast.id)}
            className="ml-2 opacity-60 transition hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Analytics Provider (uses useSession, must be inside SessionProvider)
// ═══════════════════════════════════════════════════════════════════

function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();

  useEffect(() => {
    const userId = session?.user?.email ?? undefined;
    initAnalytics(userId);
    if (userId) {
      identifyUser(userId, { name: session?.user?.name });
    }
  }, [session]);

  return <>{children}</>;
}

// ═══════════════════════════════════════════════════════════════════
// Root Providers
// ═══════════════════════════════════════════════════════════════════

export function Providers({ children }: { children: ReactNode }) {
  useGlobalHotkeys();

  // Wizards removed for Academy
  // Theme
  const [theme, setTheme] = useState<Theme>('dark');
  const toggleTheme = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = useCallback(
    (message: string, type: Toast['type'] = 'info', durationMs = 4000) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, message, type, durationMs }]);
      if (durationMs > 0) {
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), durationMs);
      }
    },
    []
  );
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // React Query
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <AnalyticsProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeContext.Provider value={{ theme, toggle: toggleTheme }}>
            <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
              <ErrorBoundary showReloadButton>
                <AppShell>{children}</AppShell>
              </ErrorBoundary>
              <ToastContainer toasts={toasts} onRemove={removeToast} />

              <DevToolsInit />
            </ToastContext.Provider>
          </ThemeContext.Provider>
        </QueryClientProvider>
      </AnalyticsProvider>
    </SessionProvider>
  );
}
