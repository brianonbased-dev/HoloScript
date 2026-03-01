'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

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

function SidebarLink({ item, isActive, collapsed }: { item: NavItem; isActive: boolean; collapsed: boolean }) {
  return (
    <Link
      href={item.href}
      title={item.description}
      className={`
        flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition
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
  const [collapsed, setCollapsed] = useState(false);

  // Don't show shell on the home page (it has its own layout)
  if (pathname === '/') return <>{children}</>;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`
          flex flex-col border-r border-studio-border bg-studio-bg
          transition-[width] duration-200
          ${collapsed ? 'w-14' : 'w-56'}
        `}
      >
        {/* Logo */}
        <div className="flex h-12 items-center justify-between border-b border-studio-border px-3">
          {!collapsed && (
            <Link href="/" className="flex items-center gap-2 text-sm font-bold tracking-tight">
              <span className="text-studio-accent">◈</span>
              <span>HoloScript</span>
            </Link>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-studio-muted transition hover:bg-studio-panel hover:text-studio-text"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? '▸' : '◂'}
          </button>
        </div>

        {/* Primary Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV_ITEMS.map(item => (
            <SidebarLink
              key={item.href}
              item={item}
              isActive={pathname.startsWith(item.href)}
              collapsed={collapsed}
            />
          ))}

          {/* Separator */}
          <div className="my-3 border-t border-studio-border" />

          {SECONDARY_ITEMS.map(item => (
            <SidebarLink
              key={item.href}
              item={item}
              isActive={pathname.startsWith(item.href)}
              collapsed={collapsed}
            />
          ))}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="border-t border-studio-border p-3">
            <p className="text-[10px] text-studio-muted leading-relaxed">
              v0.1.0 · Runs locally · Free
            </p>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar with breadcrumbs */}
        <header className="flex h-10 items-center border-b border-studio-border px-4">
          <Breadcrumbs pathname={pathname} />
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
