'use client';

import Link from 'next/link';
import { Package, Menu, X, LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import { LoginButton } from './auth/LoginButton';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Package className="h-8 w-8 text-holoscript-500" />
            <span className="text-xl font-bold text-zinc-900 dark:text-white">
              HoloScript
              <span className="text-holoscript-500 ml-1">Marketplace</span>
            </span>
          </Link>

          {/* Desktop Navigation — only routes that exist. Categories live on the
              Explore (home) page; Publishers/Search/Publish pages are not built yet. */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/"
              className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              Explore
            </Link>
            <Link
              href="https://www.holoscript.net"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              Docs
            </Link>
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-4">
            {/* Build your own & earn → HoloScript Studio (the live Earn surface). */}
            <Link
              href="https://holoscript.studio"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-holoscript-500 hover:bg-holoscript-600 text-white rounded-lg font-medium transition-colors"
            >
              Build &amp; Earn
            </Link>
            <Link
              href="/dashboard"
              className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
              aria-label="Dashboard"
            >
              <LayoutDashboard className="h-5 w-5" />
            </Link>
            <div className="ml-2">
              <LoginButton />
            </div>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden p-2 text-zinc-600 dark:text-zinc-400"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-zinc-200 dark:border-zinc-800 animate-fade-in">
            <nav className="flex flex-col gap-4">
              <Link
                href="/"
                className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                Explore
              </Link>
              <Link
                href="https://www.holoscript.net"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                Docs
              </Link>
              <hr className="border-zinc-200 dark:border-zinc-800" />
              <Link
                href="/dashboard"
                className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                <LayoutDashboard className="h-5 w-5" />
                Dashboard
              </Link>
              <Link
                href="https://holoscript.studio"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center px-4 py-2 bg-holoscript-500 text-white rounded-lg font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Build &amp; Earn
              </Link>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
