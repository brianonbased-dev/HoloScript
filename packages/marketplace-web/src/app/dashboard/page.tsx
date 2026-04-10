'use client';

import { useAccount, useBalance } from 'wagmi';
import { formatEther } from 'viem';
import { Package, DollarSign, Activity, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({ address });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <Wallet className="h-16 w-16 text-zinc-300 dark:text-zinc-700 mb-4" />
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">
          Connect Your Wallet
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 text-center max-w-md">
          Please connect your Web3 wallet using the button in the header to access your Creator
          Dashboard and view analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2">Creator Dashboard</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Welcome back,{' '}
          <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {/* Stat Cards */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-holoscript-50 dark:bg-holoscript-500/10 text-holoscript-500 rounded-lg">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Wallet Balance</p>
              <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">
                {balance ? Number(formatEther(balance.value)).toFixed(4) : '0.000'}{' '}
                {balance?.symbol || 'ETH'}
              </h3>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-500/10 text-blue-500 rounded-lg">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Minted Traits</p>
              <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">0</h3>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-500 rounded-lg">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Total Royalties Earned
              </p>
              <h3 className="text-2xl font-bold text-zinc-900 dark:text-white">0.00 ETH</h3>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-6">Recent Activity</h2>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-12 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">
            No recent activity found. Publish your first trait to get started!
          </p>
        </div>
      </div>
    </div>
  );
}
