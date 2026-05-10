'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  ChevronDown,
  Command,
  FolderTree,
  Home,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { CommandPalette } from '@/components/command-palette/CommandPalette';

export interface WorkbenchActivityItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface WorkbenchLayoutState {
  primarySidebarOpen: boolean;
  inspectorOpen: boolean;
  bottomPanelOpen: boolean;
  primarySidebarWidth: number;
  inspectorWidth: number;
  bottomPanelHeight: number;
}

export interface WorkbenchShellProps {
  perspectiveId: string;
  title: string;
  subtitle?: string;
  activityItems?: WorkbenchActivityItem[];
  primarySidebar?: React.ReactNode;
  primarySidebarTitle?: string;
  inspector?: React.ReactNode;
  inspectorTitle?: string;
  bottomPanel?: React.ReactNode;
  bottomPanelTitle?: string;
  statusItems?: React.ReactNode;
  commandPalette?: React.ReactNode;
  children: React.ReactNode;
}

const DEFAULT_LAYOUT: WorkbenchLayoutState = {
  primarySidebarOpen: true,
  inspectorOpen: false,
  bottomPanelOpen: true,
  primarySidebarWidth: 248,
  inspectorWidth: 320,
  bottomPanelHeight: 168,
};

const DEFAULT_ACTIVITY_ITEMS: WorkbenchActivityItem[] = [
  { id: 'start', label: 'Start', href: '/start', icon: Home },
  { id: 'create', label: 'Create', href: '/create', icon: Wand2 },
  { id: 'workspace', label: 'Workspace', href: '/workspace', icon: FolderTree },
  { id: 'agents', label: 'Agents', href: '/agents', icon: Sparkles },
  { id: 'settings', label: 'Settings', href: '/settings', icon: Settings },
];

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

export function resolveWorkbenchLayout(
  value?: Partial<WorkbenchLayoutState> | null
): WorkbenchLayoutState {
  return {
    primarySidebarOpen:
      typeof value?.primarySidebarOpen === 'boolean'
        ? value.primarySidebarOpen
        : DEFAULT_LAYOUT.primarySidebarOpen,
    inspectorOpen:
      typeof value?.inspectorOpen === 'boolean'
        ? value.inspectorOpen
        : DEFAULT_LAYOUT.inspectorOpen,
    bottomPanelOpen:
      typeof value?.bottomPanelOpen === 'boolean'
        ? value.bottomPanelOpen
        : DEFAULT_LAYOUT.bottomPanelOpen,
    primarySidebarWidth: clamp(
      value?.primarySidebarWidth,
      180,
      420,
      DEFAULT_LAYOUT.primarySidebarWidth
    ),
    inspectorWidth: clamp(value?.inspectorWidth, 240, 520, DEFAULT_LAYOUT.inspectorWidth),
    bottomPanelHeight: clamp(value?.bottomPanelHeight, 96, 420, DEFAULT_LAYOUT.bottomPanelHeight),
  };
}

function storageKey(perspectiveId: string): string {
  return `studio.workbench.layout.${perspectiveId}`;
}

function ShellButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={title}
      title={title}
      onClick={onClick}
      className={`grid h-9 w-9 place-items-center rounded-md transition ${
        active
          ? 'bg-emerald-500/15 text-emerald-300'
          : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function ActivityBar({ items }: { items: WorkbenchActivityItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Workbench activity"
      className="flex h-full w-14 shrink-0 flex-col items-center border-r border-slate-800 bg-slate-950 py-2"
    >
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-500/15 text-xs font-semibold text-emerald-300">
        HS
      </div>
      <div className="mt-4 flex flex-1 flex-col items-center gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-label={item.label}
              title={item.label}
              aria-current={active ? 'page' : undefined}
              className={`grid h-10 w-10 place-items-center rounded-md transition ${
                active
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Icon className="h-5 w-5" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function PanelFrame({
  title,
  children,
  className = '',
  style,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={`flex min-h-0 flex-col bg-slate-950 ${className}`} style={style}>
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-slate-800 px-3">
        <h2 className="truncate text-xs font-semibold uppercase tracking-wide text-slate-300">
          {title}
        </h2>
        <ChevronDown className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

function DefaultPrimarySidebar({ title }: { title: string }) {
  const items: Array<[string, LucideIcon]> = [
    ['Files', FolderTree],
    ['Search', Search],
    ['Scene', Boxes],
    ['Commands', Command],
  ];

  return (
    <div className="space-y-1 p-2">
      {items.map(([label, PanelIcon]) => {
        return (
          <button
            key={label}
            type="button"
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-slate-300 hover:bg-slate-900"
          >
            <PanelIcon className="h-4 w-4 text-slate-500" />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
      <div className="px-2 pt-3 text-xs uppercase tracking-wide text-slate-500">{title}</div>
    </div>
  );
}

function DefaultInspector() {
  return (
    <div className="space-y-2 p-3 text-sm text-slate-300">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-slate-500" />
        <span>Selection</span>
      </div>
      <div className="h-px bg-slate-800" />
      <div className="text-xs text-slate-500">No node selected</div>
    </div>
  );
}

function DefaultBottomPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-slate-800 px-3 text-xs text-slate-400">
        <span className="text-slate-200">Output</span>
        <span>Problems</span>
        <span>Terminal</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs text-slate-500">Ready</div>
    </div>
  );
}

export function WorkbenchShell({
  perspectiveId,
  title,
  subtitle,
  activityItems = DEFAULT_ACTIVITY_ITEMS,
  primarySidebar,
  primarySidebarTitle = 'Explorer',
  inspector,
  inspectorTitle = 'Inspector',
  bottomPanel,
  bottomPanelTitle = 'Panel',
  statusItems,
  commandPalette,
  children,
}: WorkbenchShellProps) {
  const [layout, setLayout] = useState<WorkbenchLayoutState>(DEFAULT_LAYOUT);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey(perspectiveId));
      if (stored) setLayout(resolveWorkbenchLayout(JSON.parse(stored)));
    } catch {
      setLayout(DEFAULT_LAYOUT);
    }
  }, [perspectiveId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(perspectiveId), JSON.stringify(layout));
    } catch {
      // Persistence is best-effort; the shell should still render in restricted browsers.
    }
  }, [layout, perspectiveId]);

  const resolvedActivity = useMemo(() => activityItems, [activityItems]);
  const updateLayout = (patch: Partial<WorkbenchLayoutState>) =>
    setLayout((current) => resolveWorkbenchLayout({ ...current, ...patch }));

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 text-slate-100">
      <ActivityBar items={resolvedActivity} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-3">
          <div className="flex min-w-0 items-center gap-2">
            <ShellButton
              title="Toggle primary sidebar"
              active={layout.primarySidebarOpen}
              onClick={() => updateLayout({ primarySidebarOpen: !layout.primarySidebarOpen })}
            >
              <PanelLeft className="h-4 w-4" />
            </ShellButton>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-slate-100">{title}</h1>
              {subtitle ? <div className="truncate text-xs text-slate-500">{subtitle}</div> : null}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ShellButton
              title="Toggle bottom panel"
              active={layout.bottomPanelOpen}
              onClick={() => updateLayout({ bottomPanelOpen: !layout.bottomPanelOpen })}
            >
              <PanelBottom className="h-4 w-4" />
            </ShellButton>
            <ShellButton
              title="Toggle inspector"
              active={layout.inspectorOpen}
              onClick={() => updateLayout({ inspectorOpen: !layout.inspectorOpen })}
            >
              <PanelRight className="h-4 w-4" />
            </ShellButton>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {layout.primarySidebarOpen ? (
            <PanelFrame
              title={primarySidebarTitle}
              className="border-r border-slate-800"
              style={{ width: layout.primarySidebarWidth }}
            >
              {primarySidebar ?? <DefaultPrimarySidebar title={title} />}
            </PanelFrame>
          ) : null}

          <main className="flex min-w-0 flex-1 flex-col bg-studio-bg">
            <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            {layout.bottomPanelOpen ? (
              <PanelFrame
                title={bottomPanelTitle}
                className="shrink-0 border-t border-slate-800"
                style={{ height: layout.bottomPanelHeight }}
              >
                {bottomPanel ?? <DefaultBottomPanel />}
              </PanelFrame>
            ) : null}
          </main>

          {layout.inspectorOpen ? (
            <PanelFrame
              title={inspectorTitle}
              className="border-l border-slate-800"
              style={{ width: layout.inspectorWidth }}
            >
              {inspector ?? <DefaultInspector />}
            </PanelFrame>
          ) : null}
        </div>

        <footer className="flex h-6 shrink-0 items-center justify-between border-t border-slate-800 bg-emerald-950/40 px-3 text-[11px] text-emerald-100">
          <span className="truncate">{perspectiveId}</span>
          <div className="flex items-center gap-3">{statusItems ?? <span>Ready</span>}</div>
        </footer>
      </div>
      {commandPalette ?? <CommandPalette />}
    </div>
  );
}
