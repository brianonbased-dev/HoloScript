import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './types';

export interface ArtifactEntry {
  id: string;
  name: string;
  type: string;
  depth: number;
  gridRef: string;
  condition: 'intact' | 'fragmented' | 'restored';
}

export interface ArtifactCatalogConfig {
  artifacts: ArtifactEntry[];
  totalCount: number;
  lastUpdated: number;
}

const handler: TraitHandler<ArtifactCatalogConfig> = {
  name: 'artifact_catalog',
  defaultConfig: {
    artifacts: [],
    totalCount: 0,
    lastUpdated: 0,
  },
  onEvent(_node: HSPlusNode, config: ArtifactCatalogConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'artifact_catalog:add') {
      const artifact = event.payload as unknown as ArtifactEntry;
      config.artifacts.push(artifact);
      config.totalCount = config.artifacts.length;
      config.lastUpdated = Date.now();
      ctx.emit?.('artifact_added', { id: artifact.id, name: artifact.name, total: config.totalCount });
    } else if (event.type === 'artifact_catalog:update_condition') {
      const { id, condition } = event.payload as { id: string; condition: ArtifactEntry['condition'] };
      const artifact = config.artifacts.find(a => a.id === id);
      if (artifact) {
        artifact.condition = condition;
        ctx.emit?.('artifact_condition_updated', { id, condition });
      }
    } else if (event.type === 'artifact_catalog:remove') {
      const { id } = event.payload as { id: string };
      config.artifacts = config.artifacts.filter(a => a.id !== id);
      config.totalCount = config.artifacts.length;
      ctx.emit?.('artifact_removed', { id, remaining: config.totalCount });
    }
  },
};

export const ArtifactCatalogTrait = handler;
