'use client';

// Three.js cross-version compat shim — must run before any WebGLRenderer
// touches a Material. Side-effect import. See lib/threeCompat.ts.
import '../lib/threeCompat';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider } from 'next-auth/react';
import { useState, useEffect, type ReactNode, createContext, useContext, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useGlobalHotkeys } from '../hooks/useGlobalHotkeys';
import { ErrorBoundary } from '@holoscript/ui';
import { initAnalytics, identifyUser } from '../lib/analytics';
import {
  flushFederatedAnalytics,
  isFederatedAnalyticsEnabled,
} from '../lib/federatedAnalytics';
import { useStudioPresetStore } from '../lib/stores/studioPresetStore';
import dynamic from 'next/dynamic';
const DevToolsInit = dynamic(
  () => import('../components/DevToolsInit').then((m) => ({ default: m.DevToolsInit })),
  { ssr: false }
);
import { PluginHostProvider } from '../hooks/usePluginHost';
import { WebVitals } from '../components/WebVitals';
import { StudioCAELMount } from '../components/instrumentation/StudioCAELMount';
import { AgentationWired } from '../components/AgentationWired';

// Old StudioSetupWizard removed — onboarding now handled by /start (Brittney-first)

// ═══════════════════════════════════════════════════════════════════
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

function _ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
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

function FederatedAnalyticsSync() {
  useEffect(() => {
    if (!isFederatedAnalyticsEnabled()) return;
    const intervalMs = 5 * 60 * 1000;
    const timer = setInterval(() => void flushFederatedAnalytics(), intervalMs);
    const flush = () => void flushFederatedAnalytics();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}

function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();

  useEffect(() => {
    const userId = session?.user?.email ?? undefined;
    initAnalytics(userId);
    if (userId) {
      identifyUser(userId, { name: session?.user?.name });
    }
  }, [session]);

  return (
    <>
      {children}
      <FederatedAnalyticsSync />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Root Providers
// ═══════════════════════════════════════════════════════════════════

export function Providers({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useGlobalHotkeys({ enableHistoryShortcuts: pathname !== '/create' });

  // Onboarding handled by /start (Brittney-first) — no popup wizard

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
                <PluginHostProvider>
                  {children}
                </PluginHostProvider>
              </ErrorBoundary>
              <DevToolsInit />
              <WebVitals />
              {/* Paper 24 — installs zundo-CAEL bridge always; activates
                  full UI session recording when ?study=1 in URL. */}
              <StudioCAELMount />
              {process.env.NODE_ENV === 'development' && !pathname?.startsWith('/scan-room') && <AgentationWired />}
            </ToastContext.Provider>
          </ThemeContext.Provider>
        </QueryClientProvider>
      </AnalyticsProvider>
    </SessionProvider>
  );
}
