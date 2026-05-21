'use client';

import React from 'react';

/**
 * BoardPanel — Team task board sidebar panel for HoloScript Studio.
 *
 * Pure frontend implementation for task_1779315248520_vd70.
 * HoloMesh provides the data layer (/api/holomesh/team/:id/board + claim/done).
 * Studio provides the working surface (grouped list, claim/unclaim/done/blocked/add/filter).
 *
 * This is the initial registration slice: panel appears in the HoloMesh category
 * of the right sidebar. Full fetch + grouped rendering + action wiring in follow-up slices.
 *
 * Verification: Studio build / typecheck passes with the panel registered.
 */
export function BoardPanel() {
  return (
    <div className="board-panel p-4 text-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">📋</span>
        <h3 className="font-semibold text-base">Team Board</h3>
      </div>

      <p className="text-xs opacity-70 mb-4">
        HoloMesh room tasks for the active team. Grouped by status (claimed → open → blocked → done).
        Actions: claim, unclaim, mark done, mark blocked, add task, filter.
      </p>

      <div className="rounded border border-white/10 p-3 text-xs bg-black/20">
        <div className="font-mono text-[10px] opacity-60 mb-1">API surface ready</div>
        <div>GET /api/holomesh/team/:id/board</div>
        <div>POST .../board/:id/claim</div>
        <div>POST .../board/:id/done</div>
      </div>

      <div className="mt-4 text-[10px] opacity-50">
        Full grouped list + live updates + action handlers in the next slice.
        See task_1779315248520_vd70 for acceptance.
      </div>
    </div>
  );
}

export default BoardPanel;
