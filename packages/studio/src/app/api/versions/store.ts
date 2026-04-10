export interface SceneVersion {
  versionId: string;
  sceneId: string;
  label: string;
  code: string;
  savedAt: string;
  lineCount: number;
}

declare global {
  var __studioSceneVersionsStore__: Map<string, SceneVersion[]> | undefined;
}

export function getVersionsStore(): Map<string, SceneVersion[]> {
  return (
    globalThis.__studioSceneVersionsStore__ ??
    (globalThis.__studioSceneVersionsStore__ = new Map<string, SceneVersion[]>())
  );
}

export function clearVersionsStore(): void {
  getVersionsStore().clear();
}

export function makeVersionId(): string {
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function toSceneVersion(row: {
  id: string;
  projectId: string;
  code: string;
  createdAt: Date;
  metadata: unknown;
}): SceneVersion {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    versionId: row.id,
    sceneId: row.projectId,
    label: typeof metadata.label === 'string' ? metadata.label : '',
    code: row.code,
    savedAt: row.createdAt.toISOString(),
    lineCount:
      typeof metadata.lineCount === 'number' ? metadata.lineCount : row.code.split('\n').length,
  };
}