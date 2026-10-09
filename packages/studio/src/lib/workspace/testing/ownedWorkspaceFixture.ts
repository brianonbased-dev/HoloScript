/**
 * Test-only helper: register workspace rows in `<root>/.absorb-projects.json`,
 * the registry the workspace OWNER check reads (lib/workspace/workspaceOwner.ts).
 * Writes the file directly so tests can also create legacy rows (no ownerId).
 */
import * as fs from 'fs';
import * as path from 'path';

export interface FixtureWorkspaceRow {
  /** Workspace directory name directly under the root (the registry row id). */
  id: string;
  localPath: string | null;
  ownerId?: string | null;
}

export function registerWorkspaceRows(workspacesRoot: string, rows: FixtureWorkspaceRow[]): void {
  const statePath = path.join(workspacesRoot, '.absorb-projects.json');
  let existing: { projects?: unknown[] } = {};
  try {
    existing = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as { projects?: unknown[] };
  } catch {
    existing = {};
  }
  const now = new Date().toISOString();
  const projects = [
    ...((existing.projects as unknown[]) ?? []),
    ...rows.map((row) => ({
      id: row.id,
      name: row.id,
      sourceType: 'github',
      sourceUrl: null,
      localPath: row.localPath,
      status: 'ready',
      metadata: {},
      absorbJobs: [],
      createdAt: now,
      updatedAt: now,
      ownerId: row.ownerId ?? null,
    })),
  ];
  fs.mkdirSync(workspacesRoot, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({ version: 1, updatedAt: now, projects }, null, 2));
}

/** `{ user: { id } }`, the shape every guard reads the caller from. */
export function sessionFor(userId: string, extra: Record<string, unknown> = {}) {
  return { user: { id: userId, name: `User ${userId}`, email: null, ...extra } };
}
