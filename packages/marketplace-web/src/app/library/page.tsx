'use client';

import { useAccount } from 'wagmi';
import { Package, Lock, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function LibraryPage() {
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <Lock className="h-16 w-16 text-zinc-300 dark:text-zinc-700 mb-4" />
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
          Authentication Required
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 text-center max-w-md">
          Please connect your Web3 wallet to access your purchased traits and VRR environments.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">My Library</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Access your permanently owned HoloScript traits and digital twins.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 relative group overflow-hidden">
          <div className="absolute top-0 right-0 p-4">
            <Link
              href="#"
              className="flex items-center gap-1 text-xs font-semibold text-holoscript-500 hover:text-holoscript-600 transition-colors"
            >
              Open in Studio <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-holoscript-50 dark:bg-holoscript-500/10 text-holoscript-500 rounded-lg">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-white">
                Sample Procedural World
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Purchased 2 days ago</p>
            </div>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
            Fully riggable 3D topology with embedded narrative agent routines.
          </p>
        </div>
      </div>
    </div>
  );
}
