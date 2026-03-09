/**
 * SaveManager.ts
 *
 * Save/load system: named save slots, autosave triggers,
 * JSON serialization, corruption detection via checksums.
 *
 * @module persistence
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SaveSlot {
  id: string;
  name: string;
  timestamp: number;
  data: Record<string, unknown>;
  checksum: string;
  version: number;
  playtime: number; // seconds
  metadata: Record<string, string>;
}

export interface SaveConfig {
  maxSlots: number;
  autosaveInterval: number; // seconds, 0 = disabled
  autosaveSlotId: string;
  version: number;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_SAVE_CONFIG: SaveConfig = {
  maxSlots: 10,
  autosaveInterval: 300,
  autosaveSlotId: 'autosave',
  version: 1,
};

// =============================================================================
// SAVE MANAGER
// =============================================================================

export class SaveManager {
  private config: SaveConfig;
  private slots: Map<string, SaveSlot> = new Map();
  private autosaveTimer = 0;
  private playtime = 0;
  private saveListeners: Array<(slot: SaveSlot) => void> = [];
  private loadListeners: Array<(slot: SaveSlot) => void> = [];
  private currentData: Record<string, unknown> = {};

  constructor(config?: Partial<SaveConfig>) {
    this.config = { ...DEFAULT_SAVE_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Save & Load
  // ---------------------------------------------------------------------------

  save(
    slotId: string,
    name: string,
    data: Record<string, unknown>,
    metadata: Record<string, string> = {}
  ): SaveSlot {
    if (this.slots.size >= this.config.maxSlots && !this.slots.has(slotId)) {
      // Remove oldest
      let oldest: SaveSlot | null = null;
      for (const slot of this.slots.values()) {
        if (!oldest || slot.timestamp < oldest.timestamp) oldest = slot;
      }
      if (oldest) this.slots.delete(oldest.id);
    }

    const serialized = JSON.stringify(data);
    const slot: SaveSlot = {
      id: slotId,
      name,
      timestamp: Date.now(),
      data: JSON.parse(serialized), // Deep copy
      checksum: this.computeChecksum(serialized),
      version: this.config.version,
      playtime: this.playtime,
      metadata,
    };

    this.slots.set(slotId, slot);
    this.currentData = data;
    for (const listener of this.saveListeners) listener(slot);
    return slot;
  }

  load(slotId: string): Record<string, unknown> | null {
    const slot = this.slots.get(slotId);
    if (!slot) return null;

    // Verify integrity
    const serialized = JSON.stringify(slot.data);
    if (this.computeChecksum(serialized) !== slot.checksum) {
      return null; // Corrupt
    }

    this.currentData = JSON.parse(serialized);
    for (const listener of this.loadListeners) listener(slot);
    return this.currentData;
  }

  // ---------------------------------------------------------------------------
  // Autosave
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    this.playtime += dt;

    if (this.config.autosaveInterval > 0) {
      this.autosaveTimer += dt;
      if (this.autosaveTimer >= this.config.autosaveInterval) {
        this.autosaveTimer = 0;
        this.autosave();
      }
    }
  }

  autosave(): SaveSlot | null {
    if (Object.keys(this.currentData).length === 0) return null;
    return this.save(this.config.autosaveSlotId, 'Autosave', this.currentData, {
      type: 'autosave',
    });
  }

  setCurrentData(data: Record<string, unknown>): void {
    this.currentData = data;
  }

  // ---------------------------------------------------------------------------
  // Slot Management
  // ---------------------------------------------------------------------------

  getSlot(slotId: string): SaveSlot | undefined {
    return this.slots.get(slotId);
  }
  getAllSlots(): SaveSlot[] {
    return [...this.slots.values()].sort((a, b) => b.timestamp - a.timestamp);
  }
  getSlotCount(): number {
    return this.slots.size;
  }

  deleteSlot(slotId: string): boolean {
    return this.slots.delete(slotId);
  }

  isCorrupted(slotId: string): boolean {
    const slot = this.slots.get(slotId);
    if (!slot) return true;
    return this.computeChecksum(JSON.stringify(slot.data)) !== slot.checksum;
  }

  // ---------------------------------------------------------------------------
  // Export / Import (for cloud saves)
  // ---------------------------------------------------------------------------

  exportAll(): string {
    return JSON.stringify([...this.slots.values()]);
  }

  importAll(json: string): number {
    try {
      const slots: SaveSlot[] = JSON.parse(json);
      for (const slot of slots) this.slots.set(slot.id, slot);
      return slots.length;
    } catch {
      return 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Listeners
  // ---------------------------------------------------------------------------

  onSave(listener: (slot: SaveSlot) => void): void {
    this.saveListeners.push(listener);
  }
  onLoad(listener: (slot: SaveSlot) => void): void {
    this.loadListeners.push(listener);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private computeChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(16);
  }

  getPlaytime(): number {
    return this.playtime;
  }
}
