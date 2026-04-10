'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HolodaemonPage() {
  const router = useRouter();
  const [isRunning, setIsRunning] = useState(true);
  const [metrics, setMetrics] = useState({
    memoryUsage: 45,
    activeJobs: 12,
    completedJobs: 1340,
    uptime: '14h 22m',
    lastSync: '2m ago',
  });

  return (
    <div className="max-w-6xl mx-auto p-8 text-zinc-100">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Holodaemon Intelligence Cluster</h1>
          <p className="text-zinc-400">
            Manage the background pipeline for autonomous codebase improvement.
          </p>
        </div>
        <div className="flex gap-4">
          <span
            className={`px-3 py-1 text-sm rounded ${isRunning ? 'bg-zinc-100 text-zinc-900' : 'bg-red-500/20 text-red-500'}`}
          >
            {isRunning ? 'Daemon Active' : 'Daemon Halted'}
          </span>
          <button
            className={`px-4 py-2 text-sm rounded font-medium ${isRunning ? 'bg-red-500 text-zinc-100' : 'bg-emerald-600 text-zinc-100'}`}
            onClick={() => setIsRunning(!isRunning)}
          >
            {isRunning ? 'Halt Daemon' : 'Initialize Absorb Worker'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-zinc-800 border bg-card text-card-foreground shadow border-zinc-700 text-zinc-100 rounded-lg">
          <div className="flex flex-col space-y-1.5 p-6 pb-2">
            <h3 className="font-semibold leading-none tracking-tight text-lg">Active Jobs</h3>
            <p className="text-sm text-muted-foreground text-zinc-400">Executing pipelines</p>
          </div>
          <div className="p-6 pt-0">
            <p className="text-4xl font-bold text-emerald-400">{metrics.activeJobs}</p>
          </div>
        </div>

        <div className="bg-zinc-800 border bg-card text-card-foreground shadow border-zinc-700 text-zinc-100 rounded-lg">
          <div className="flex flex-col space-y-1.5 p-6 pb-2">
            <h3 className="font-semibold leading-none tracking-tight text-lg">Completed (24h)</h3>
            <p className="text-sm text-muted-foreground text-zinc-400">
              Jobs successfully terminated
            </p>
          </div>
          <div className="p-6 pt-0">
            <p className="text-4xl font-bold text-blue-400">{metrics.completedJobs}</p>
          </div>
        </div>

        <div className="bg-zinc-800 border bg-card text-card-foreground shadow border-zinc-700 text-zinc-100 rounded-lg">
          <div className="flex flex-col space-y-1.5 p-6 pb-2">
            <h3 className="font-semibold leading-none tracking-tight text-lg">System Health</h3>
            <p className="text-sm text-muted-foreground text-zinc-400">Memory & Uptime</p>
          </div>
          <div className="p-6 pt-0">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Uptime</span>
                <span className="font-mono">{metrics.uptime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Memory</span>
                <span className="font-mono text-yellow-400">{metrics.memoryUsage}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-zinc-800 border bg-card text-card-foreground shadow border-zinc-700 text-zinc-100 rounded-lg">
        <div className="flex flex-col space-y-1.5 p-6">
          <h3 className="font-semibold leading-none tracking-tight">Recent Activity Stream</h3>
        </div>
        <div className="p-6 pt-0">
          <div className="space-y-4">
            <div className="flex items-center gap-4 p-3 bg-zinc-900 rounded border border-zinc-800">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">Extracting WPG entries from core/compiler</p>
                <p className="text-xs text-zinc-500">Absorb agent processing files...</p>
              </div>
              <span className="text-xs text-zinc-500">Just now</span>
            </div>

            <div className="flex items-center gap-4 p-3 bg-zinc-900 rounded border border-zinc-800">
              <div className="w-2 h-2 bg-zinc-500 rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm font-medium text-zinc-300">Synchronized team knowledge</p>
                <p className="text-xs text-zinc-500">Pushed 12 patterns to orchestrator.</p>
              </div>
              <span className="text-xs text-zinc-500">2m ago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
