'use client';
/**
 * useProcGen — Hook for procedural generation with TileMap
 */
import { useState, useCallback, useRef } from 'react';
import { TileMap, TileFlags } from '@holoscript/core';

interface TileData {
  id: number;
  flags: number;
}

export interface UseProcGenReturn {
  tilemap: InstanceType<typeof TileMap>;
  grid: (TileData | null)[][];
  width: number;
  height: number;
  tileSize: number;
  layerCount: number;
  setTile: (x: number, y: number, id: number, flags?: number) => void;
  eraseTile: (x: number, y: number) => void;
  fill: (id: number, flags?: number) => void;
  generateRandom: (density?: number) => void;
  generateMaze: () => void;
  clear: () => void;
  resize: (w: number, h: number) => void;
}

function readGrid(tm: InstanceType<typeof TileMap>, w: number, h: number): (TileData | null)[][] {
  const g: (TileData | null)[][] = [];
  for (let y = 0; y < h; y++) {
    const row: (TileData | null)[] = [];
    for (let x = 0; x < w; x++) {
      row.push(tm.getTile('ground', x, y) ?? null);
    }
    g.push(row);
  }
  return g;
}

export function useProcGen(initWidth = 16, initHeight = 16, initTileSize = 32): UseProcGenReturn {
  const tmRef = useRef(
    (() => {
      const m = new TileMap(initWidth, initHeight, initTileSize);
      m.addLayer('ground');
      return m;
    })()
  );
  const [grid, setGrid] = useState<(TileData | null)[][]>(
    readGrid(tmRef.current, initWidth, initHeight)
  );
  const [dims, setDims] = useState({ w: initWidth, h: initHeight });

  const sync = useCallback(() => {
    setGrid(readGrid(tmRef.current, dims.w, dims.h));
  }, [dims]);

  const setTile = useCallback(
    (x: number, y: number, id: number, flags: number = TileFlags.NONE) => {
      tmRef.current.setTile('ground', x, y, { id, flags });
      sync();
    },
    [sync]
  );

  const eraseTile = useCallback(
    (x: number, y: number) => {
      tmRef.current.removeTile('ground', x, y);
      sync();
    },
    [sync]
  );

  const fill = useCallback(
    (id: number, flags: number = TileFlags.NONE) => {
      for (let y = 0; y < dims.h; y++)
        for (let x = 0; x < dims.w; x++) tmRef.current.setTile('ground', x, y, { id, flags });
      sync();
    },
    [dims, sync]
  );

  const generateRandom = useCallback(
    (density = 0.4) => {
      for (let y = 0; y < dims.h; y++) {
        for (let x = 0; x < dims.w; x++) {
          if (Math.random() < density) {
            tmRef.current.setTile('ground', x, y, { id: 1, flags: TileFlags.SOLID });
          } else {
            tmRef.current.removeTile('ground', x, y);
          }
        }
      }
      sync();
    },
    [dims, sync]
  );

  const generateMaze = useCallback(() => {
    // Simple Binary Tree algorithm
    for (let y = 0; y < dims.h; y++) {
      for (let x = 0; x < dims.w; x++) {
        tmRef.current.setTile('ground', x, y, { id: 1, flags: TileFlags.SOLID });
      }
    }
    for (let y = 1; y < dims.h; y += 2) {
      for (let x = 1; x < dims.w; x += 2) {
        tmRef.current.setTile('ground', x, y, { id: 0, flags: TileFlags.NONE });
        const canGoRight = x + 2 < dims.w;
        const canGoDown = y + 2 < dims.h;
        if (canGoRight && (!canGoDown || Math.random() > 0.5)) {
          tmRef.current.setTile('ground', x + 1, y, { id: 0, flags: TileFlags.NONE });
        } else if (canGoDown) {
          tmRef.current.setTile('ground', x, y + 1, { id: 0, flags: TileFlags.NONE });
        }
      }
    }
    sync();
  }, [dims, sync]);

  const clear = useCallback(() => {
    for (let y = 0; y < dims.h; y++)
      for (let x = 0; x < dims.w; x++) tmRef.current.removeTile('ground', x, y);
    sync();
  }, [dims, sync]);

  const resize = useCallback((w: number, h: number) => {
    tmRef.current = new TileMap(w, h, tmRef.current.getTileSize());
    tmRef.current.addLayer('ground');
    setDims({ w, h });
    setGrid(readGrid(tmRef.current, w, h));
  }, []);

  return {
    tilemap: tmRef.current,
    grid,
    width: dims.w,
    height: dims.h,
    tileSize: tmRef.current.getTileSize(),
    layerCount: tmRef.current.getLayerCount(),
    setTile,
    eraseTile,
    fill,
    generateRandom,
    generateMaze,
    clear,
    resize,
  };
}
