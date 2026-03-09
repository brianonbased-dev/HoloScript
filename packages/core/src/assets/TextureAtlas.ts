/**
 * TextureAtlas.ts
 *
 * Sprite sheet / texture atlas packing and lookup.
 * Packs multiple textures into atlases with efficient UV mapping.
 *
 * @module assets
 */

// =============================================================================
// TYPES
// =============================================================================

export interface TextureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AtlasEntry {
  id: string;
  sourceWidth: number;
  sourceHeight: number;
  rect: TextureRect; // Position in atlas
  uv: { u0: number; v0: number; u1: number; v1: number };
  rotated: boolean;
  trimmed: boolean;
  padding: number;
}

export interface AtlasConfig {
  id: string;
  maxWidth: number;
  maxHeight: number;
  padding: number;
  allowRotation: boolean;
  powerOfTwo: boolean; // Force dimensions to power of 2
}

export interface Atlas {
  id: string;
  width: number;
  height: number;
  entries: Map<string, AtlasEntry>;
  occupancy: number; // 0-1, how much space is used
}

// =============================================================================
// PACKING ALGORITHM (Shelf / Skyline)
// =============================================================================

interface ShelfRow {
  y: number;
  height: number;
  usedWidth: number;
}

// =============================================================================
// TEXTURE ATLAS
// =============================================================================

export class TextureAtlas {
  private config: AtlasConfig;
  private entries: Map<string, AtlasEntry> = new Map();
  private shelves: ShelfRow[] = [];
  private currentWidth = 0;
  private currentHeight = 0;
  private totalArea = 0;

  constructor(config: AtlasConfig) {
    this.config = { ...config };
  }

  // ---------------------------------------------------------------------------
  // Packing
  // ---------------------------------------------------------------------------

  /**
   * Add a texture to the atlas.
   * Returns the entry with UV coordinates, or null if it doesn't fit.
   */
  pack(id: string, width: number, height: number): AtlasEntry | null {
    const pad = this.config.padding;
    const pw = width + pad * 2;
    const ph = height + pad * 2;

    // Try rotation if allowed and it helps
    let rotated = false;
    let finalW = pw;
    let finalH = ph;

    if (this.config.allowRotation && ph < pw) {
      // Try rotated if it's more efficient
      const rotFit = this.findShelf(ph, pw);
      const normFit = this.findShelf(pw, ph);

      if (rotFit !== null && (normFit === null || rotFit.wasted < normFit.wasted)) {
        rotated = true;
        finalW = ph;
        finalH = pw;
      }
    }

    // Find or create shelf
    const placement = this.placeOnShelf(finalW, finalH);
    if (!placement) return null;

    const entry: AtlasEntry = {
      id,
      sourceWidth: width,
      sourceHeight: height,
      rect: {
        x: placement.x + pad,
        y: placement.y + pad,
        width: rotated ? height : width,
        height: rotated ? width : height,
      },
      uv: {
        u0: (placement.x + pad) / this.getAtlasWidth(),
        v0: (placement.y + pad) / this.getAtlasHeight(),
        u1: (placement.x + pad + (rotated ? height : width)) / this.getAtlasWidth(),
        v1: (placement.y + pad + (rotated ? width : height)) / this.getAtlasHeight(),
      },
      rotated,
      trimmed: false,
      padding: pad,
    };

    this.entries.set(id, entry);
    this.totalArea += width * height;
    return entry;
  }

  private findShelf(w: number, h: number): { shelfIndex: number; wasted: number } | null {
    let bestIndex = -1;
    let bestWaste = Infinity;

    for (let i = 0; i < this.shelves.length; i++) {
      const shelf = this.shelves[i];
      if (shelf.usedWidth + w <= this.config.maxWidth && shelf.height >= h) {
        const waste = shelf.height - h;
        if (waste < bestWaste) {
          bestWaste = waste;
          bestIndex = i;
        }
      }
    }

    return bestIndex >= 0 ? { shelfIndex: bestIndex, wasted: bestWaste } : null;
  }

  private placeOnShelf(w: number, h: number): { x: number; y: number } | null {
    // Try existing shelves
    const fit = this.findShelf(w, h);
    if (fit) {
      const shelf = this.shelves[fit.shelfIndex];
      const x = shelf.usedWidth;
      const y = shelf.y;
      shelf.usedWidth += w;
      this.currentWidth = Math.max(this.currentWidth, shelf.usedWidth);
      return { x, y };
    }

    // Create new shelf
    const newY =
      this.shelves.length === 0
        ? 0
        : this.shelves[this.shelves.length - 1].y + this.shelves[this.shelves.length - 1].height;

    if (newY + h > this.config.maxHeight || w > this.config.maxWidth) {
      return null; // Doesn't fit
    }

    this.shelves.push({ y: newY, height: h, usedWidth: w });
    this.currentWidth = Math.max(this.currentWidth, w);
    this.currentHeight = newY + h;
    return { x: 0, y: newY };
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getEntry(id: string): AtlasEntry | undefined {
    return this.entries.get(id);
  }

  getEntryCount(): number {
    return this.entries.size;
  }

  getAtlasWidth(): number {
    if (this.config.powerOfTwo) return this.nextPowerOfTwo(this.currentWidth);
    return Math.max(1, this.currentWidth);
  }

  getAtlasHeight(): number {
    if (this.config.powerOfTwo) return this.nextPowerOfTwo(this.currentHeight);
    return Math.max(1, this.currentHeight);
  }

  getOccupancy(): number {
    const atlasArea = this.getAtlasWidth() * this.getAtlasHeight();
    return atlasArea > 0 ? this.totalArea / atlasArea : 0;
  }

  getAtlas(): Atlas {
    return {
      id: this.config.id,
      width: this.getAtlasWidth(),
      height: this.getAtlasHeight(),
      entries: new Map(this.entries),
      occupancy: this.getOccupancy(),
    };
  }

  /**
   * Get all entries as an array.
   */
  getAllEntries(): AtlasEntry[] {
    return [...this.entries.values()];
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private nextPowerOfTwo(n: number): number {
    if (n <= 0) return 1;
    let v = n - 1;
    v |= v >> 1;
    v |= v >> 2;
    v |= v >> 4;
    v |= v >> 8;
    v |= v >> 16;
    return v + 1;
  }

  /**
   * Clear all entries and reset.
   */
  clear(): void {
    this.entries.clear();
    this.shelves = [];
    this.currentWidth = 0;
    this.currentHeight = 0;
    this.totalArea = 0;
  }
}
