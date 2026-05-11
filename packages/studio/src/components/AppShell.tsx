'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import type { LucideIcon } from 'lucide-react';
import {
  MessageCircle,
  Sparkles,
  Wand2,
  FolderGit2,
  Code2,
  Globe,
  Users,
  Bot,
  Zap,
  BookOpen,
  ImagePlus,
  Check,
  Plus,
  ClipboardList,
  Menu,
  X,
  Settings,
} from 'lucide-react';
import {
  STUDIO_LAB_NAVIGATION_ITEMS,
  STUDIO_PRIMARY_NAVIGATION_ITEMS,
  STUDIO_SETTINGS_NAVIGATION_ITEM,
  isStudioLabNavigationEnabled,
  type StudioNavigationId,
  type StudioNavigationItemDefinition,
} from '@/lib/studio/surfaceClassification';

const RightPanelSidebar = dynamic(
  () => import('./panels/RightPanelSidebar').then((m) => ({ default: m.RightPanelSidebar })),
  { ssr: false }
);

// ═══════════════════════════════════════════════════════════════════
// Navigation Items
// ═══════════════════════════════════════════════════════════════════

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

const ICON_BY_NAV_ID: Record<StudioNavigationId, LucideIcon> = {
  start: MessageCircle,
  workspace: Code2,
  create: Wand2,
  projects: FolderGit2,
  settings: Settings,
  vibe: Sparkles,
  integrations: Zap,
  agents: Bot,
  teams: Users,
  holomesh: Globe,
  absorb: BookOpen,
  playground: ImagePlus,
};

function toNavItem(item: StudioNavigationItemDefinition): NavItem {
  return {
    label: item.label,
    href: item.href,
    icon: ICON_BY_NAV_ID[item.id],
    description: item.description,
  };
}

const CORE_ITEMS = STUDIO_PRIMARY_NAVIGATION_ITEMS.map(toNavItem);
const LAB_ITEMS = isStudioLabNavigationEnabled()
  ? STUDIO_LAB_NAVIGATION_ITEMS.map(toNavItem)
  : [];
const SETTINGS_ITEM = toNavItem(STUDIO_SETTINGS_NAVIGATION_ITEM);

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
      <Link href="/" className="transition hover:text-studio-text">
        Home
      </Link>
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
              <Link href={href} className="transition hover:text-studio-text">
                {label}
              </Link>
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

function SidebarLink({
  item,
  isActive,
  collapsed,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={item.description}
      onClick={onClick}
      className={`
        flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition min-h-[44px]
        ${
          isActive
            ? 'bg-studio-accent/10 text-studio-accent font-medium'
            : 'text-studio-muted hover:bg-studio-panel hover:text-studio-text'
        }
        ${collapsed ? 'justify-center px-2' : ''}
      `}
    >
      {Icon && <Icon size={18} className="flex-shrink-0" />}
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Team Selector (sidebar widget)
// ═══════════════════════════════════════════════════════════════════

interface TeamEntry {
  id: string;
  name: string;
  role?: string;
}

const ACTIVE_TEAM_KEY = 'holomesh_active_team_id';

function TeamSelector({ collapsed }: { collapsed: boolean }) {
  const [teams, setTeams] = useState<TeamEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Load teams from agent self-profile
  useEffect(() => {
    fetch('/api/holomesh/agent/self')
      .then((r) => r.json())
      .then((d) => {
        const list: TeamEntry[] = Array.isArray(d?.teams)
          ? d.teams.map((t: { id: string; name: string; role?: string }) => ({
              id: t.id,
              name: t.name,
              role: t.role,
            }))
          : [];
        setTeams(list);
        const saved =
          typeof localStorage !== 'undefined' ? localStorage.getItem(ACTIVE_TEAM_KEY) : null;
        const found = saved && list.find((t) => t.id === saved);
        if (found) {
          setActiveId(found.id);
        } else if (list.length > 0) {
          setActiveId(list[0].id);
          if (typeof localStorage !== 'undefined')
            localStorage.setItem(ACTIVE_TEAM_KEY, list[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const switchTeam = (id: string) => {
    setActiveId(id);
    if (typeof localStorage !== 'undefined') localStorage.setItem(ACTIVE_TEAM_KEY, id);
    setOpen(false);
  };

  const activeTeam = teams.find((t) => t.id === activeId);

  if (teams.length === 0) {
    // Minimal "Join a team" link when the agent is on no teams
    return (
      <div className="px-2 mb-1">
        <Link
          href="/teams"
          title="Discover teams"
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-studio-muted hover:bg-studio-panel hover:text-studio-text transition ${collapsed ? 'justify-center px-2' : ''}`}
        >
          <Users size={16} className="flex-shrink-0" />
          {!collapsed && <span>Join a team</span>}
        </Link>
      </div>
    );
  }

  return (
    <div ref={ref} className="px-2 mb-1 relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={activeTeam ? `Active team: ${activeTeam.name}` : 'Select team'}
        className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition hover:bg-studio-panel ${open ? 'bg-studio-panel text-studio-text' : 'text-studio-muted'} ${collapsed ? 'justify-center px-2' : ''}`}
      >
        <Users size={16} className="flex-shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-left">{activeTeam?.name ?? 'Select team'}</span>
            <span className="text-[10px]">{open ? '▴' : '▾'}</span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-2 right-2 bottom-full mb-1 z-50 rounded-lg border border-studio-border bg-studio-bg shadow-xl overflow-hidden">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => switchTeam(team.id)}
              className={`w-full text-left flex items-center gap-2 px-3 py-2 text-xs transition hover:bg-studio-panel ${team.id === activeId ? 'text-studio-accent font-medium' : 'text-studio-text'}`}
            >
              <span className="flex-1 truncate">{team.name}</span>
              {team.id === activeId && <Check size={14} />}
            </button>
          ))}
          <div className="border-t border-studio-border" />
          <Link
            href="/teams"
            onClick={() => setOpen(false)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-studio-muted hover:bg-studio-panel hover:text-studio-text transition"
          >
            <Plus size={14} /> Discover teams
          </Link>
          {activeId && (
            <Link
              href={`/teams/${activeId}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs text-studio-muted hover:bg-studio-panel hover:text-studio-text transition"
            >
              <ClipboardList size={14} /> Open board
            </Link>
          )}
        </div>
      )}
    </div>
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

  // Don't show shell on standalone POE pages (they have their own layouts).
  // Wrap in a scrolling container because globals.css locks html/body to
  // overflow:hidden — AppShell normally provides the scroll region, so
  // standalone routes need their own.
  const standalonePaths = ['/', '/play', '/learn'];
  if (standalonePaths.includes(pathname)) {
    return <div className="h-screen overflow-y-auto">{children}</div>;
  }

  // /create has its own full-bleed layout with GlobalNavigation — don't
  // render a duplicate AppShell sidebar on top of it.
  if (pathname.startsWith('/create')) {
    return <>{children}</>;
  }

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
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
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
          ${
            isMobile
              ? `fixed inset-y-0 left-0 z-40 w-64 shadow-2xl transform ${
                  mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                }`
              : collapsed
                ? 'w-14'
                : 'w-48'
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
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <span aria-hidden="true">{collapsed ? '▸' : '◂'}</span>
            </button>
          )}
          {isMobile && (
            <button
              onClick={closeMobileMenu}
              className="flex h-8 w-8 items-center justify-center rounded-md text-studio-muted transition hover:bg-studio-panel hover:text-studio-text"
              aria-label="Close menu"
              title="Close menu"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Primary Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {CORE_ITEMS.map((item) => (
            <SidebarLink
              key={item.href}
              item={item}
              isActive={pathname.startsWith(item.href)}
              collapsed={!isMobile && collapsed}
              onClick={isMobile ? closeMobileMenu : undefined}
            />
          ))}

          {LAB_ITEMS.length > 0 && (
            <>
              <div className="my-3 border-t border-studio-border" />
              {LAB_ITEMS.map((item) => (
                <SidebarLink
                  key={item.href}
                  item={item}
                  isActive={pathname.startsWith(item.href)}
                  collapsed={!isMobile && collapsed}
                  onClick={isMobile ? closeMobileMenu : undefined}
                />
              ))}
            </>
          )}

          {LAB_ITEMS.length > 0 && (
            <>
              <div className="my-3 border-t border-studio-border" />
              <TeamSelector collapsed={!isMobile && collapsed} />
            </>
          )}
          <SidebarLink
            item={SETTINGS_ITEM}
            isActive={pathname.startsWith('/settings')}
            collapsed={!isMobile && collapsed}
            onClick={isMobile ? closeMobileMenu : undefined}
          />
        </nav>

        {/* Footer */}
        {(!collapsed || isMobile) && (
          <div className="border-t border-studio-border p-3">
            <p className="text-[10px] text-studio-muted leading-relaxed">
              v7.0.0 · Open platform for spatial computing
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
          <div className="flex-1 overflow-auto">{children}</div>
        </div>

        {/* Right panel sidebar — Safety / Marketplace / Platform / Traits */}
        {!isMobile &&
          (pathname.startsWith('/create') || pathname.startsWith('/projects/')) && (
            <RightPanelSidebar />
          )}
      </main>
    </div>
  );
}
