'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageCircle,
  Sparkles,
  ImagePlus,
  Wand2,
  FolderGit2,
  Globe,
  Users,
  Bot,
  Zap,
  BookOpen,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  exact: boolean;
}

const coreItems: NavItem[] = [
  { label: 'Start', href: '/start', icon: MessageCircle, exact: true },
  { label: 'Vibe', href: '/vibe', icon: Sparkles, exact: true },
  { label: 'Playground', href: '/playground', icon: ImagePlus, exact: true },
  { label: 'Create', href: '/create', icon: Wand2, exact: false },
  { label: 'Projects', href: '/projects', icon: FolderGit2, exact: false },
];

const ecosystemItems: NavItem[] = [
  { label: 'HoloMesh', href: '/holomesh', icon: Globe, exact: false },
  { label: 'Teams', href: '/teams', icon: Users, exact: false },
  { label: 'Agents', href: '/agents', icon: Bot, exact: false },
];

const resourceItems: NavItem[] = [
  { label: 'Absorb', href: '/absorb', icon: Zap, exact: false },
  { label: 'Learn', href: '/learn', icon: BookOpen, exact: false },
];

function NavSection({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <>
      {items.map((item) => {
        const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;

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

  return (
    <nav aria-label="Main navigation" className="w-16 lg:w-64 h-screen shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300">
      {/* App Branding */}
      <div className="h-14 border-b border-slate-800 flex items-center justify-center lg:justify-start lg:px-6">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold font-mono">
          HS
        </div>
        <span className="ml-3 font-semibold text-slate-100 hidden lg:block tracking-wide">
          Studio <span className="text-emerald-400 text-xs align-top">V6</span>
        </span>
      </div>

      {/* Nav Links */}
      <div className="flex-1 py-6 px-3 space-y-2 overflow-y-auto">
        {/* Core flow */}
        <NavSection items={coreItems} pathname={pathname} />

        <SectionDivider />

        {/* Ecosystem */}
        <NavSection items={ecosystemItems} pathname={pathname} />

        <SectionDivider />

        {/* Resources */}
        <NavSection items={resourceItems} pathname={pathname} />
      </div>

      {/* Settings / Footer */}
      <div className="p-3 border-t border-slate-800">
        <Link
          href="/settings"
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
