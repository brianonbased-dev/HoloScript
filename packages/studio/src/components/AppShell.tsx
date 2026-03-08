'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

const RightPanelSidebar = dynamic(
  () => import('./panels/RightPanelSidebar').then(m => ({ default: m.RightPanelSidebar })),
  { ssr: false },
);

// ═══════════════════════════════════════════════════════════════════
// Navigation Items
// ═══════════════════════════════════════════════════════════════════

interface NavItem {
  label: string;
  href: string;
  icon: string; // Emoji icons for simplicity — swap for Lucide later
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Create', href: '/create', icon: '✨', description: 'New scene from prompt' },
  { label: 'Projects', href: '/projects', icon: '📁', description: 'Your saved work' },
  { label: 'Templates', href: '/templates', icon: '📐', description: 'Start from a preset' },
  { label: 'Playground', href: '/playground', icon: '🎮', description: 'Code sandbox' },
  { label: 'Shader Lab', href: '/shader-editor', icon: '🎨', description: 'Shader graph editor' },
  { label: 'Registry', href: '/registry', icon: '📦', description: 'Trait & asset registry' },
];

const SECONDARY_ITEMS: NavItem[] = [
  { label: 'Remote', href: '/remote', icon: '📱', description: 'Mobile companion' },
  { label: 'Shared', href: '/shared', icon: '🌐', description: 'Shared scenes' },
  { label: 'View', href: '/view', icon: '👁️', description: 'Scene viewer' },
];

// ═══════════════════════════════════════════════════════════════════
// Responsive Hook
// ═══════════════════════════════════════════════════════════════════

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

// ═══════════════════════════════════════════════════════════════════
// Breadcrumbs
// ═══════════════════════════════════════════════════════════════════

function Breadcrumbs({ pathname }: { pathname: string }) {
  if (pathname === '/') return null;

  const segments = pathname.split('/').filter(Boolean);

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-studio-muted">
      <Link href="/" className="transition hover:text-studio-text">Home</Link>
      {segments.map((seg, i) => {
        const href = '/' + segments.slice(0, i + 1).join('/');
        const isLast = i === segments.length - 1;
        const label = seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, ' ');
        return (
          <span key={href} className="flex items-center gap-1.5">
            <span className="text-studio-border">/</span>
            {isLast ? (
              <span className="text-studio-text font-medium">{label}</span>
            ) : (
              <Link href={href} className="transition hover:text-studio-text">{label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sidebar
// ═══════════════════════════════════════════════════════════════════

function SidebarLink({ item, isActive, collapsed, onClick }: { item: NavItem; isActive: boolean; collapsed: boolean; onClick?: () => void }) {
  return (
    <Link
      href={item.href}
      title={item.description}
      onClick={onClick}
      className={`
        flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition min-h-[44px]
        ${isActive
          ? 'bg-studio-accent/10 text-studio-accent font-medium'
          : 'text-studio-muted hover:bg-studio-panel hover:text-studio-text'
        }
        ${collapsed ? 'justify-center px-2' : ''}
      `}
    >
      <span className="text-base flex-shrink-0">{item.icon}</span>
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════
// App Shell
// ═══════════════════════════════════════════════════════════════════

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auto-collapse sidebar on mobile/small tablet
  useEffect(() => {
    if (isMobile) {
      setCollapsed(true);
      setMobileMenuOpen(false);
    }
  }, [isMobile]);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

  // Don't show shell on standalone POE pages (they have their own layouts)
  const standalonePaths = ['/', '/play', '/learn'];
  if (standalonePaths.includes(pathname)) return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile: hamburger button */}
      {isMobile && (
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="fixed top-0 left-0 z-50 flex h-10 w-10 items-center justify-center text-studio-muted hover:text-studio-text md:hidden"
          title="Toggle navigation"
          aria-label="Toggle navigation menu"
        >
          <span className="text-lg">{mobileMenuOpen ? '✕' : '☰'}</span>
        </button>
      )}

      {/* Mobile overlay backdrop */}
      {isMobile && mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={closeMobileMenu}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — drawer on mobile, persistent on desktop */}
      <aside
        className={`
          flex flex-col border-r border-studio-border bg-studio-bg
          transition-all duration-200
          ${isMobile
            ? `fixed inset-y-0 left-0 z-40 w-64 shadow-2xl transform ${
                mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
              }`
            : collapsed ? 'w-14' : 'w-56'
          }
        `}
      >
        {/* Logo */}
        <div className="flex h-12 items-center justify-between border-b border-studio-border px-3">
          {(!collapsed || isMobile) && (
            <Link href="/" className="flex items-center gap-2 text-sm font-bold tracking-tight">
              <span className="text-studio-accent">◈</span>
              <span>HoloScript</span>
            </Link>
          )}
          {!isMobile && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-studio-muted transition hover:bg-studio-panel hover:text-studio-text"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? '▸' : '◂'}
            </button>
          )}
          {isMobile && (
            <button
              onClick={closeMobileMenu}
              className="flex h-8 w-8 items-center justify-center rounded-md text-studio-muted transition hover:bg-studio-panel hover:text-studio-text"
              title="Close menu"
            >
              ✕
            </button>
          )}
        </div>

        {/* Primary Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV_ITEMS.map(item => (
            <SidebarLink
              key={item.href}
              item={item}
              isActive={pathname.startsWith(item.href)}
              collapsed={!isMobile && collapsed}
              onClick={isMobile ? closeMobileMenu : undefined}
            />
          ))}

          {/* Separator */}
          <div className="my-3 border-t border-studio-border" />

          {SECONDARY_ITEMS.map(item => (
            <SidebarLink
              key={item.href}
              item={item}
              isActive={pathname.startsWith(item.href)}
              collapsed={!isMobile && collapsed}
              onClick={isMobile ? closeMobileMenu : undefined}
            />
          ))}
        </nav>

        {/* Footer */}
        {(!collapsed || isMobile) && (
          <div className="border-t border-studio-border p-3">
            <p className="text-[10px] text-studio-muted leading-relaxed">
              v0.1.0 · Runs locally · Free
            </p>
          </div>
        )}
      </aside>

      {/* Main content + Right panel */}
      <main className="flex flex-1 overflow-hidden">
        {/* Page column */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top bar with breadcrumbs */}
          <header className="flex h-10 items-center border-b border-studio-border px-4">
            {/* Spacer for hamburger on mobile */}
            {isMobile && <div className="w-8 shrink-0" />}
            <Breadcrumbs pathname={pathname} />
          </header>

          {/* Page content */}
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </div>

        {/* Right panel sidebar — Safety / Marketplace / Platform / Traits */}
        {!isMobile && <RightPanelSidebar />}
      </main>
    </div>
  );
}
