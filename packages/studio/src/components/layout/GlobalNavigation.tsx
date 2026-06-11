'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bot,
  BookOpen,
  Code2,
  Coins,
  FolderGit2,
  Globe,
  Home,
  ImagePlus,
  MessageCircle,
  Settings,
  Sparkles,
  Users,
  Wand2,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSession } from 'next-auth/react';
import {
  STUDIO_PRIMARY_NAVIGATION_ITEMS,
  STUDIO_SETTINGS_NAVIGATION_ITEM,
  type StudioNavigationId,
  type StudioNavigationItemDefinition,
} from '@/lib/studio/surfaceClassification';
import { isFounderWorkspaceIdentity } from '@/lib/workspace/workspaceIdentity';

const ICON_BY_NAV_ID: Record<StudioNavigationId, LucideIcon> = {
  // A4 primary nav (7 destinations)
  home: Home,
  create: Wand2,
  projects: FolderGit2,
  network: Globe,
  earn: Coins,
  operations: Activity,
  settings: Settings,
  // Parked / lab items — kept so the Record is exhaustive against the union
  start: MessageCircle,
  workspace: Code2,
  vibe: Sparkles,
  integrations: Zap,
  agents: Bot,
  teams: Users,
  holomesh: Globe,
  absorb: BookOpen,
  playground: ImagePlus,
};

function NavSection({
  items,
  pathname,
}: {
  items: StudioNavigationItemDefinition[];
  pathname: string;
}) {
  return (
    <>
      {items.map((item) => {
        const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        // Fallback guard: a nav id without an icon entry must never render as
        // `undefined` (that throws "Element type is invalid" and crashes every
        // page rendering this nav). This hardens against the two-icon-map drift
        // between AppShell and GlobalNavigation.
        const Icon = ICON_BY_NAV_ID[item.id] ?? Activity;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center justify-center lg:justify-start gap-3 px-3 py-2.5 rounded-xl transition group ${
              isActive
                ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Icon
              size={20}
              className={
                isActive
                  ? 'text-emerald-400'
                  : 'text-slate-500 group-hover:text-slate-400 transition-colors'
              }
            />
            <span className="hidden lg:block text-sm">{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

function SectionDivider() {
  return <div className="my-3 mx-2 border-t border-slate-800" />;
}

export function GlobalNavigation() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isFounder = isFounderWorkspaceIdentity(session?.user);
  // Operations (/operations) is founder-gated; action endpoints enforce
  // requireFounder server-side — nav hides the item for non-founders.
  const primaryItems = isFounder
    ? STUDIO_PRIMARY_NAVIGATION_ITEMS
    : STUDIO_PRIMARY_NAVIGATION_ITEMS.filter((i) => i.id !== 'operations');

  return (
    <nav
      aria-label="Main navigation"
      className="w-16 lg:w-64 h-screen shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300"
    >
      {/* App Branding */}
      <div className="h-14 border-b border-slate-800 flex items-center justify-center lg:justify-start lg:px-6">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold font-mono">
          HS
        </div>
        <span className="ml-3 font-semibold text-slate-100 hidden lg:block tracking-wide">
          Studio <span className="text-emerald-400 text-xs align-top">V7</span>
        </span>
      </div>

      {/* Nav Links — A4 IA: Home / Create / Projects / Network / Earn / Operations */}
      <div className="flex-1 py-6 px-3 space-y-2 overflow-y-auto">
        <NavSection items={primaryItems} pathname={pathname} />
      </div>

      {/* Settings — pinned footer item */}
      <div className="p-3 border-t border-slate-800">
        <Link
          href={STUDIO_SETTINGS_NAVIGATION_ITEM.href}
          className={`flex items-center justify-center lg:justify-start gap-3 px-3 py-2.5 rounded-xl transition group ${
            pathname.startsWith('/settings')
              ? 'bg-slate-800 text-slate-200'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Settings
            size={20}
            className="text-slate-500 group-hover:text-slate-400 transition-colors"
          />
          <span className="hidden lg:block text-sm">Settings</span>
        </Link>
      </div>
    </nav>
  );
}
