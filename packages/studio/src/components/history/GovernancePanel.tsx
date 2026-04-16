import React, { useState, useEffect } from 'react';
import { useEditorStore } from '../../lib/stores/editorStore';
import { FoundationDAOSection } from '../governance/FoundationDAOSection';

interface GitCommitRecord {
  oid: string;
  message: string;
  author: {
    name: string;
    email: string;
    timestamp: number;
  };
}

type GovernanceTab = 'dao' | 'history';

export const GovernancePanel: React.FC = () => {
  const currentFilePath = 'example.holo';
  const { diffModeHash, setDiffModeHash } = useEditorStore();
  const [commits, setCommits] = useState<GitCommitRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<GovernanceTab>('dao');

  useEffect(() => {
    if (!currentFilePath) return;

    const loadHistory = async () => {
      setLoading(true);
      try {
        const { GitService } = await import('../../services/GitService');
        const service = new GitService(process.cwd());
        const history = await service.getCommitHistory(currentFilePath);
        setCommits(history);
      } catch {
        setCommits([]);
      }
      setLoading(false);
    };

    loadHistory();
  }, [currentFilePath]);

  const handleToggleDiff = (hash: string) => {
    if (diffModeHash === hash) {
      setDiffModeHash(null);
    } else {
      setDiffModeHash(hash);
    }
  };

  return (
    <div className="flex h-full flex-col border-studio-border bg-studio-bg text-studio-text">
      <div className="flex border-b border-studio-border bg-studio-surface px-2 py-2">
        <button
          type="button"
          onClick={() => setTab('dao')}
          className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
            tab === 'dao'
              ? 'bg-studio-accent/20 text-studio-accent'
              : 'text-studio-muted hover:text-studio-text'
          }`}
        >
          Foundation DAO
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
            tab === 'history'
              ? 'bg-studio-accent/20 text-studio-accent'
              : 'text-studio-muted hover:text-studio-text'
          }`}
        >
          Spatial history
        </button>
      </div>

      {tab === 'dao' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <FoundationDAOSection />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-studio-border bg-studio-surface px-3 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-studio-text">
              Spatial blame
            </h3>
            {commits.length > 0 && (
              <span className="rounded bg-studio-accent/15 px-2 py-0.5 text-[10px] text-studio-accent">
                {commits.length} commits
              </span>
            )}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {!currentFilePath ? (
              <div className="py-8 text-center text-sm text-studio-muted">
                No local file loaded.
                <br />
                Open a .holo file to view its spatial history.
              </div>
            ) : loading ? (
              <div className="flex justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-studio-accent" />
              </div>
            ) : commits.length === 0 ? (
              <div className="py-8 text-center text-sm text-studio-muted">
                No Git history found for this file.
              </div>
            ) : (
              commits.map((commit, i) => (
                <div
                  key={commit.oid}
                  className={`rounded-lg border p-3 transition-colors ${
                    diffModeHash === commit.oid
                      ? 'border-studio-accent/50 bg-studio-accent/10'
                      : 'border-studio-border bg-studio-surface hover:border-studio-muted'
                  }`}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <span className="rounded bg-emerald-500/15 px-1 font-mono text-[10px] text-emerald-400">
                      {commit.oid.substring(0, 7)}
                    </span>
                    <span className="text-[10px] text-studio-muted">
                      {new Date(commit.author.timestamp * 1000).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="mb-1 text-sm leading-snug text-studio-text">{commit.message}</div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-[10px] text-studio-muted">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-studio-border text-[8px] text-studio-text">
                        {commit.author.name.charAt(0).toUpperCase()}
                      </span>
                      {commit.author.name}
                    </div>

                    {i > 0 && (
                      <button
                        type="button"
                        onClick={() => handleToggleDiff(commit.oid)}
                        className={`rounded px-2 py-1 text-[10px] transition-colors ${
                          diffModeHash === commit.oid
                            ? 'bg-studio-accent text-white hover:bg-studio-accent/90'
                            : 'bg-studio-surface text-studio-text hover:bg-studio-border'
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
        </>
      )}
    </div>
  );
};
