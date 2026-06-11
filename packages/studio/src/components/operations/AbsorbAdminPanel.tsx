'use client';

import React, { useEffect } from 'react';
import { useAbsorbServiceStore } from '@/lib/stores/absorbServiceStore';

/**
 * AbsorbAdminPanel — content extracted from /absorb/admin/page.tsx.
 * Mounted inside the Operations console under the "Absorb" tab.
 * Carries its own store-backed fetch logic; founder gate is enforced
 * by the /operations page wrapper.
 */
export function AbsorbAdminPanel() {
  const {
    healthMatrix,
    fetchEcosystemHealth,
    moltbookAgents,
    stopMoltbookAgent,
    fetchMoltbookAgents,
  } = useAbsorbServiceStore();

  useEffect(() => {
    fetchEcosystemHealth();
    fetchMoltbookAgents();
    const interval = setInterval(() => {
      fetchEcosystemHealth();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchEcosystemHealth, fetchMoltbookAgents]);

  const ecosystemHealthy = healthMatrix ? !healthMatrix.some((n) => n.status === 'OFFLINE') : true;

  return (
    <div className="h-full overflow-y-auto p-6 text-white">
      <h2 className="text-xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">
        Absorb — Ecosystem Admin
      </h2>
      {!ecosystemHealthy && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          One or more ecosystem services are OFFLINE.
        </div>
      )}

      {/* Health Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {healthMatrix?.map((node, i) => {
          const isOnline = node.status === 'ONLINE';
          return (
            <div
              key={i}
              className={`p-5 bg-white/5 border ${isOnline ? 'border-white/10' : 'border-red-500/50'} rounded-xl hover:bg-white/10 transition-all`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm truncate" title={node.service}>
                  {node.service}
                </h3>
                <div
                  className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-mono ${isOnline ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-500 animate-pulse'}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}
                  />
                  {node.status}
                </div>
              </div>
              <div className="text-white/60 font-mono text-xs space-y-1">
                <div>Latency: {node.latencyMs >= 0 ? `${node.latencyMs}ms` : 'N/A'}</div>
                {node.statusCode && <div>Status Code: {node.statusCode}</div>}
                {node.error && (
                  <div className="text-red-400 truncate text-[10px]" title={node.error}>
                    {node.error}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {!healthMatrix && (
          <div className="col-span-full text-center p-12 text-white/50 italic animate-pulse text-sm">
            Probing ecosystem telemetry...
          </div>
        )}
      </div>

      {/* Moltbook Agent Kill Switch */}
      <div className="max-w-3xl">
        <h3 className="text-lg font-bold mb-3 border-b border-white/10 pb-2 text-purple-300">
          Active Moltbook Agents
        </h3>
        <div className="space-y-3">
          {moltbookAgents
            ?.filter((a) => a.heartbeatEnabled)
            .map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-purple-500/20 hover:border-purple-500/50 transition-colors"
              >
                <div className="text-sm font-mono flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse shadow-[0_0_10px_#a855f7]" />
                  <span className="font-bold text-white">{agent.agentName}</span>
                  <span className="text-white/40">(ID: {agent.id.slice(0, 8)})</span>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Force stop agent ${agent.agentName}?`))
                      stopMoltbookAgent(agent.id);
                  }}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500 text-white border border-red-500/50 rounded-md text-xs font-bold transition-all"
                >
                  FORCE STOP
                </button>
              </div>
            ))}
          {(moltbookAgents?.filter((a) => a.heartbeatEnabled).length === 0 || !moltbookAgents) && (
            <div className="p-4 bg-white/5 rounded-lg border border-white/5 text-white/40 italic text-sm text-center">
              No active swarm agents found in the registry.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
