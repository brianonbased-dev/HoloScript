/**
 * TileRenderer.ts
 *
 * Tile rendering: frustum-culled tile drawing, atlas UV mapping,
 * animated tiles, and per-layer visibility control.
 *
 * @module tilemap
 */

import { TileMap, type TileLayer } from './TileMap';

// =============================================================================
// TYPES
// =============================================================================

export interface TileAtlas {
  tileWidth: number;
  tileHeight: number;
  columns: number;
  rows: number;
}

export interface AnimatedTile {
  tileId: number;
  frames: number[]; // Frame tile IDs
  frameDuration: number; // ms per frame
  currentFrame: number;
  elapsed: number;
}

export interface RenderTile {
  tileX: number;
  tileY: number;
  worldX: number;
  worldY: number;
  uvX: number;
  uvY: number;
  uvW: number;
  uvH: number;
  layerName: string;
}

// =============================================================================
// TILE RENDERER
// =============================================================================

export class TileRenderer {
  private map: TileMap;
  private atlas: TileAtlas;
  private animatedTiles: Map<number, AnimatedTile> = new Map();

  constructor(map: TileMap, atlas: TileAtlas) {
    this.map = map;
    this.atlas = atlas;
  }

  // ---------------------------------------------------------------------------
  // Animated Tiles
  // ---------------------------------------------------------------------------

  addAnimatedTile(tileId: number, frames: number[], frameDuration: number): void {
    this.animatedTiles.set(tileId, { tileId, frames, frameDuration, currentFrame: 0, elapsed: 0 });
  }

  updateAnimations(dt: number): void {
    for (const anim of this.animatedTiles.values()) {
      anim.elapsed += dt;
      if (anim.elapsed >= anim.frameDuration) {
        anim.elapsed -= anim.frameDuration;
        anim.currentFrame = (anim.currentFrame + 1) % anim.frames.length;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // UV Mapping
  // ---------------------------------------------------------------------------

  getTileUV(tileId: number): { uvX: number; uvY: number; uvW: number; uvH: number } {
    // Check for animated tile
    const anim = this.animatedTiles.get(tileId);
    const resolvedId = anim ? anim.frames[anim.currentFrame] : tileId;

    const col = resolvedId % this.atlas.columns;
    const row = Math.floor(resolvedId / this.atlas.columns);

    return {
      uvX: col / this.atlas.columns,
      uvY: row / this.atlas.rows,
      uvW: 1 / this.atlas.columns,
      uvH: 1 / this.atlas.rows,
    };
  }

  // ---------------------------------------------------------------------------
  // Culled Rendering
  // ---------------------------------------------------------------------------

  getVisibleTiles(viewX: number, viewY: number, viewW: number, viewH: number): RenderTile[] {
    const tiles: RenderTile[] = [];
    const ts = this.map.getTileSize();

    const minTX = Math.max(0, Math.floor(viewX / ts));
    const maxTX = Math.min(this.map.getWidth() - 1, Math.floor((viewX + viewW) / ts));
    const minTY = Math.max(0, Math.floor(viewY / ts));
    const maxTY = Math.min(this.map.getHeight() - 1, Math.floor((viewY + viewH) / ts));

    // Sort layers by z-order
    const sortedLayers = this.getSortedLayers();

    for (const layer of sortedLayers) {
      if (!layer.visible) continue;

      for (let tx = minTX; tx <= maxTX; tx++) {
        for (let ty = minTY; ty <= maxTY; ty++) {
          const tile = this.map.getTile(layer.name, tx, ty);
          if (!tile) continue;

          const uv = this.getTileUV(tile.id);
          tiles.push({
            tileX: tx,
            tileY: ty,
            worldX: tx * ts,
            worldY: ty * ts,
            ...uv,
            layerName: layer.name,
          });
        }
      }
    }

    return tiles;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private getSortedLayers(): TileLayer[] {
    const layers: TileLayer[] = [];
    // Manually collect layers from the tile map
    for (const name of this.getLayerNames()) {
      const layer = this.map.getLayer(name);
      if (layer) layers.push(layer);
    }
    return layers.sort((a, b) => a.zOrder - b.zOrder);
  }

  private getLayerNames(): string[] {
    // We iterate tile map layers by checking known names
    // In a real implementation this would use map's layer iterator
    const names: string[] = [];
    for (const name of ['background', 'ground', 'collision', 'main', 'foreground', 'overlay']) {
      if (this.map.getLayer(name)) names.push(name);
    }
    return names;
  }

  getAnimatedTileCount(): number {
    return this.animatedTiles.size;
  }
}
