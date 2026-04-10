'use client';

import { get, set, del, keys } from 'idb-keyval';
import type { Project } from '@/types';

const PREFIX = 'holostudio:project:';

function projectKey(id: string) {
  return `${PREFIX}${id}`;
}

export async function saveProject(project: Project): Promise<void> {
  await set(projectKey(project.id), project);
}

export async function loadProject(id: string): Promise<Project | undefined> {
  return get<Project>(projectKey(id));
}

export async function deleteProject(id: string): Promise<void> {
  await del(projectKey(id));
}

export async function listProjects(): Promise<Project[]> {
  const allKeys = await keys();
  const projectKeys = allKeys.filter((k) => typeof k === 'string' && k.startsWith(PREFIX));

  const projects: Project[] = [];
  for (const k of projectKeys) {
    const p = await get<Project>(k as string);
    if (p) projects.push(p);
  }

  return projects.sort(
    (a, b) => new Date(b.metadata.updatedAt).getTime() - new Date(a.metadata.updatedAt).getTime()
  );
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
