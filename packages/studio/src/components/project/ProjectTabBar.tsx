'use client';

/**
 * ProjectTabBar — multi-scene tab bar for the top of the editor.
 *
 * Shows a tab for each scene in projectStore.
 * Click to switch, middle-click or × to close, + to add new scene.
 * Dirty indicator (⚫) shown on modified tabs.
 */

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useProjectStore } from '@/lib/projectStore';

interface ProjectTabBarProps {
  /** Called when the user switches scenes — caller should sync code to/from useSceneStore */
  onSwitch?: (sceneId: string) => void;
}

export function ProjectTabBar({ onSwitch }: ProjectTabBarProps) {
  const scenes = useProjectStore((s) => s.scenes);
  const activeSceneId = useProjectStore((s) => s.activeSceneId);
  const addScene = useProjectStore((s) => s.addScene);
  const removeScene = useProjectStore((s) => s.removeScene);
  const switchScene = useProjectStore((s) => s.switchScene);
  const renameScene = useProjectStore((s) => s.renameScene);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleSwitch = (id: string) => {
    switchScene(id);
    onSwitch?.(id);
  };

  const handleAdd = () => {
    const scene = addScene();
    onSwitch?.(scene.id);
  };

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (scenes.length === 1) return; // keep at least one tab
    removeScene(id);
  };

  const handleDoubleClick = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const commitRename = (id: string) => {
    if (editName.trim()) renameScene(id, editName.trim());
    setEditingId(null);
  };

  return (
    <div className="flex h-9 shrink-0 items-end overflow-x-auto border-b border-studio-border bg-studio-panel pr-2">
      {scenes.map((scene) => {
        const isActive = scene.id === activeSceneId;
        return (
          <div
            key={scene.id}
            onClick={() => handleSwitch(scene.id)}
            onDoubleClick={() => handleDoubleClick(scene.id, scene.name)}
            title={`${scene.name}${scene.isDirty ? ' (unsaved)' : ''}`}
            className={`group relative flex h-8 max-w-[160px] cursor-pointer items-center gap-1.5 border-r border-studio-border px-3 text-[11px] transition select-none ${
              isActive
                ? 'bg-studio-surface text-studio-text border-t-2 border-t-studio-accent'
                : 'text-studio-muted hover:bg-studio-surface/50 hover:text-studio-text'
            }`}
          >
            {/* Dirty dot */}
            {scene.isDirty && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-studio-accent" />
            )}

            {/* Name or inline rename input */}
            {editingId === scene.id ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => commitRename(scene.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(scene.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-20 bg-studio-surface text-[11px] text-studio-text outline-none"
              />
            ) : (
              <span className="truncate">{scene.name}</span>
            )}

            {/* Close button */}
            {scenes.length > 1 && (
              <button
                onClick={(e) => handleClose(e, scene.id)}
                className="ml-0.5 rounded p-0.5 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}

      {/* New tab */}
      <button
        onClick={handleAdd}
        title="New scene"
        className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-studio-muted hover:bg-studio-surface hover:text-studio-text transition"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
