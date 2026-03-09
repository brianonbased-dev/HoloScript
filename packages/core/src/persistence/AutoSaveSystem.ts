/**
 * AutoSaveSystem.ts
 *
 * Automatic save system: interval/event triggers,
 * slot management, quota enforcement, and rollback.
 *
 * @module persistence
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SaveSlot {
  id: string;
  label: string;
  timestamp: number;
  data: Record<string, unknown> | null;
  sizeBytes: number;
  isAutoSave: boolean;
}

export type SaveCallback = (slot: SaveSlot) => void;

// =============================================================================
// AUTO SAVE SYSTEM
// =============================================================================

export class AutoSaveSystem {
  private slots: Map<string, SaveSlot> = new Map();
  private maxSlots: number;
  private autoInterval: number; // ms
  private lastAutoSave = -Infinity;
  private enabled = true;
  private saveCallback: SaveCallback | null = null;
  private totalQuota: number; // Bytes
  private usedBytes = 0;

  constructor(maxSlots = 5, autoInterval = 60000, totalQuota = 10_000_000) {
    this.maxSlots = maxSlots;
    this.autoInterval = autoInterval;
    this.totalQuota = totalQuota;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  setInterval(ms: number): void {
    this.autoInterval = ms;
  }
  onSave(callback: SaveCallback): void {
    this.saveCallback = callback;
  }

  // ---------------------------------------------------------------------------
  // Save Management
  // ---------------------------------------------------------------------------

  save(slotId: string, label: string, data: Record<string, unknown>, isAutoSave = false): boolean {
    const json = JSON.stringify(data);
    const size = json.length * 2; // Rough byte estimate

    // Check quota
    const existingSlot = this.slots.get(slotId);
    const existingSize = existingSlot?.sizeBytes ?? 0;
    if (this.usedBytes - existingSize + size > this.totalQuota) return false;

    // Enforce max slots
    if (!existingSlot && this.slots.size >= this.maxSlots) {
      this.evictOldestAutoSave();
    }
    if (!existingSlot && this.slots.size >= this.maxSlots) return false;

    // Update used bytes
    this.usedBytes -= existingSize;
    this.usedBytes += size;

    const slot: SaveSlot = {
      id: slotId,
      label,
      timestamp: Date.now(),
      data,
      sizeBytes: size,
      isAutoSave,
    };
    this.slots.set(slotId, slot);

    if (this.saveCallback) this.saveCallback(slot);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Auto-Save Check
  // ---------------------------------------------------------------------------

  checkAutoSave(currentTime: number, getData: () => Record<string, unknown>): boolean {
    if (!this.enabled) return false;
    if (currentTime - this.lastAutoSave < this.autoInterval) return false;

    this.lastAutoSave = currentTime;
    const data = getData();
    return this.save(`autosave_${currentTime}`, 'Auto Save', data, true);
  }

  // ---------------------------------------------------------------------------
  // Slot Management
  // ---------------------------------------------------------------------------

  load(slotId: string): Record<string, unknown> | null {
    return this.slots.get(slotId)?.data ?? null;
  }

  deleteSlot(slotId: string): boolean {
    const slot = this.slots.get(slotId);
    if (!slot) return false;
    this.usedBytes -= slot.sizeBytes;
    this.slots.delete(slotId);
    return true;
  }

  private evictOldestAutoSave(): void {
    let oldest: SaveSlot | null = null;
    for (const slot of this.slots.values()) {
      if (!slot.isAutoSave) continue;
      if (!oldest || slot.timestamp < oldest.timestamp) oldest = slot;
    }
    if (oldest) this.deleteSlot(oldest.id);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getSlots(): SaveSlot[] {
    return [...this.slots.values()].sort((a, b) => b.timestamp - a.timestamp);
  }
  getSlotCount(): number {
    return this.slots.size;
  }
  getUsedBytes(): number {
    return this.usedBytes;
  }
  getQuota(): number {
    return this.totalQuota;
  }
}
