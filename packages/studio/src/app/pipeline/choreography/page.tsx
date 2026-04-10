'use client';

import React from 'react';

// Wire to real connector-core types for read-only visualization.
// Uses TeamTask derived structures from board-types.ts.
interface TaskAction {
  type: 'commit' | 'push' | 'deploy' | 'notify' | 'chain' | 'review';
  target?: string;
  label?: string;
}

interface TeamTask {
  id: string;
  title: string;
  status: 'open' | 'claimed' | 'done' | 'blocked';
  claimedByName?: string;
  dependsOn?: string[];
  unblocks?: string[];
  onComplete?: TaskAction[];
  priority: number;
}

// Mocked DAG data mimicking a multi-agent choreography from connector-core board.
const MOCK_PIPELINE: TeamTask[] = [
  {
    id: 'task_1',
    title: 'Generate Semantic Parser Traits',
    status: 'done',
    claimedByName: 'Brittney (Architect)',
    priority: 1,
    unblocks: ['task_2', 'task_3'],
  },
  {
    id: 'task_2',
    title: 'Implement Abstract Syntax Tree Handlers',
    status: 'claimed',
    claimedByName: 'Daemon (Coder)',
    priority: 2,
    dependsOn: ['task_1'],
    unblocks: ['task_4'],
  },
  {
    id: 'task_3',
    title: 'Audit Security Boundaries for Traits',
    status: 'open',
    priority: 2,
    dependsOn: ['task_1'],
    unblocks: ['task_4'],
  },
  {
    id: 'task_4',
    title: 'Compile Integration Layer & Deploy',
    status: 'blocked',
    priority: 3,
    dependsOn: ['task_2', 'task_3'],
    onComplete: [{ type: 'deploy', target: 'production-env', label: 'Deploy to Prod' }],
  },
];

export default function ChoreographyPage() {
  const getStatusColor = (status: TeamTask['status']) => {
    switch (status) {
      case 'done':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'claimed':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'open':
        return 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30';
      case 'blocked':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8 text-zinc-100 min-h-screen bg-zinc-950">
      <div className="mb-8 border-b border-zinc-800 pb-6">
        <h1 className="text-3xl font-bold mb-2">Choreography Pipeline</h1>
        <p className="text-zinc-400 max-w-3xl">
          Read-only visualization of task chaining and multi-agent dependency graphs derived
          directly from the canonical{' '}
          <code className="text-zinc-300 bg-zinc-800 px-1 rounded">connector-core</code> TeamBoard
          schemas.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Pipeline Execution Legend */}
        <div className="md:col-span-1 space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
            <div className="py-4 px-6 border-b border-zinc-800">
              <h3 className="text-sm text-zinc-400 uppercase tracking-wider font-semibold">
                Topology Metrics
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-2xl font-bold text-zinc-100">{MOCK_PIPELINE.length}</p>
                <p className="text-xs text-zinc-500">Nodes in DAG</p>
              </div>
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500/50"></div>
                  <span className="text-sm">Done</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500/50"></div>
                  <span className="text-sm">In Progress</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500/50"></div>
                  <span className="text-sm">Blocked via dep</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* DAG Visualization */}
        <div className="md:col-span-3 space-y-6">
          {MOCK_PIPELINE.map((task) => (
            <div key={task.id} className="relative flex gap-4">
              {/* Timeline dot / lineage */}
              <div className="flex flex-col items-center mt-2 relative z-10 w-8">
                <div
                  className={`w-4 h-4 rounded-full border-2 bg-zinc-950 ${
                    task.status === 'done'
                      ? 'border-emerald-500'
                      : task.status === 'claimed'
                        ? 'border-blue-500'
                        : task.status === 'blocked'
                          ? 'border-orange-500'
                          : 'border-zinc-500'
                  }`}
                ></div>
                <div className="flex-1 w-px bg-zinc-800 my-1 min-h-[40px]"></div>
              </div>

              <div
                className={`flex-1 bg-zinc-900 border ${getStatusColor(task.status).split(' ')[2]} shadow-sm rounded-lg`}
              >
                <div className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-zinc-100">{task.title}</h3>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${getStatusColor(task.status)} font-medium`}
                      >
                        {task.status.toUpperCase()}
                      </span>
                    </div>
                    {task.claimedByName && (
                      <p className="text-sm text-zinc-400">
                        Assigned: <span className="text-zinc-300">{task.claimedByName}</span>
                      </p>
                    )}

                    {/* Dependencies and Actions visualization */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {task.dependsOn &&
                        task.dependsOn.map((dep) => (
                          <span
                            key={dep}
                            className="text-xs px-2 py-1 bg-zinc-800 text-zinc-400 rounded-md border border-zinc-700"
                          >
                            ← Waits on {dep}
                          </span>
                        ))}
                      {task.unblocks &&
                        task.unblocks.map((ub) => (
                          <span
                            key={ub}
                            className="text-xs px-2 py-1 bg-zinc-800 text-zinc-400 rounded-md border border-zinc-700"
                          >
                            Unblocks {ub} →
                          </span>
                        ))}
                      {task.onComplete &&
                        task.onComplete.map((act, i) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-1 bg-indigo-900/30 text-indigo-300 rounded-md border border-indigo-500/30"
                          >
                            ⚡ Action: {act.type.toUpperCase()}
                          </span>
                        ))}
                    </div>
                  </div>

                  <div className="text-right text-xs text-zinc-500">
                    <p className="font-mono">ID: {task.id}</p>
                    <p>Priority {task.priority}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div className="text-center text-sm text-zinc-500 pt-4 pb-12 italic border-t border-zinc-800/50">
            End of choreography chain
          </div>
        </div>
      </div>
    </div>
  );
}
