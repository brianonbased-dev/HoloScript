import React, { useState, useEffect } from 'react';
import { GitService, GitCommitRecord } from '../../services/GitService';
import { useEditorStore } from '../../lib/stores/editorStore';

export const GovernancePanel: React.FC = () => {
  // We assume currentFilePath is managed somewhere or we pass it in. For now, hardcode mock or grab from a dedicated store.
  const currentFilePath = "example.holo"; 
  const { diffModeHash, setDiffModeHash } = useEditorStore();
  const [commits, setCommits] = useState<GitCommitRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentFilePath) return;

    const loadHistory = async () => {
      setLoading(true);
      // Initialize GitService targeting the current HoloScript workspace root
      // Note: In a real Electron setup, this path comes from the backend/IPC.
      const service = new GitService(process.cwd()); 
      const history = await service.getCommitHistory(currentFilePath);
      setCommits(history);
      setLoading(false);
    };

    loadHistory();
  }, [currentFilePath]);

  const handleToggleDiff = (hash: string) => {
    if (diffModeHash === hash) {
      setDiffModeHash(null);
      // Disable diff mode in global store
    } else {
      setDiffModeHash(hash);
      // Enable diff overlay in global store targeting this hash
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700 text-slate-300">
      <div className="p-3 border-b border-slate-700 bg-slate-800 flex justify-between items-center">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-100">
          Spatial Governance
        </h3>
        {commits.length > 0 && (
          <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-1 rounded">
            {commits.length} Commits
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!currentFilePath ? (
          <div className="text-sm text-slate-500 text-center py-8">
            No local file loaded.<br />Open a .holo file to view its spatial history.
          </div>
        ) : loading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500"></div>
          </div>
        ) : commits.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-8">
            No Git history found for this file.
          </div>
        ) : (
          commits.map((commit, i) => (
            <div 
              key={commit.oid}
              className={`p-3 rounded-lg border transition-colors ${
                diffModeHash === commit.oid 
                  ? 'bg-indigo-900/40 border-indigo-500/50' 
                  : 'bg-slate-800 border-slate-700 hover:border-slate-500'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-1 rounded">
                  {commit.oid.substring(0, 7)}
                </span>
                <span className="text-xs text-slate-500">
                  {new Date(commit.author.timestamp * 1000).toLocaleDateString()}
                </span>
              </div>
              
              <div className="text-sm text-slate-200 mb-1 leading-snug">
                {commit.message}
              </div>
              
              <div className="flex justify-between items-center mt-3">
                <div className="text-xs text-slate-400 flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-slate-600 flex items-center justify-center text-[8px] text-white">
                    {commit.author.name.charAt(0).toUpperCase()}
                  </span>
                  {commit.author.name}
                </div>
                
                {i > 0 && ( // Don't show diff button for HEAD
                  <button 
                    onClick={() => handleToggleDiff(commit.oid)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      diffModeHash === commit.oid 
                        ? 'bg-indigo-500 hover:bg-indigo-400 text-white' 
                        : 'bg-slate-700 hover:bg-slate-600'
                    }`}
                  >
                    {diffModeHash === commit.oid ? 'Exit Diff' : 'Visual Diff'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
