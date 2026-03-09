/**
 * SubtitleRenderer.ts
 *
 * Subtitle display: speech-to-text, speaker labels,
 * positioning, styling, and queuing.
 *
 * @module accessibility
 */

// =============================================================================
// TYPES
// =============================================================================

export type SubtitlePosition = 'bottom' | 'top' | 'left' | 'right' | 'center';

export interface SubtitleStyle {
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  outlineWidth: number;
  outlineColor: string;
  position: SubtitlePosition;
  maxWidth: number; // % of screen width
  padding: number;
}

export interface SubtitleEntry {
  id: string;
  text: string;
  speaker?: string;
  speakerColor?: string;
  startTime: number;
  duration: number;
  position?: SubtitlePosition;
  priority: number;
}

// =============================================================================
// SUBTITLE RENDERER
// =============================================================================

let _subId = 0;

export class SubtitleRenderer {
  private style: SubtitleStyle = {
    fontSize: 24,
    fontColor: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 0.7,
    outlineWidth: 2,
    outlineColor: '#000000',
    position: 'bottom',
    maxWidth: 80,
    padding: 10,
  };

  private queue: SubtitleEntry[] = [];
  private active: SubtitleEntry[] = [];
  private elapsed = 0;
  private maxVisible = 3;
  private history: SubtitleEntry[] = [];
  private maxHistory = 100;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setStyle(style: Partial<SubtitleStyle>): void {
    Object.assign(this.style, style);
  }
  getStyle(): SubtitleStyle {
    return { ...this.style };
  }
  setMaxVisible(max: number): void {
    this.maxVisible = max;
  }

  // ---------------------------------------------------------------------------
  // Subtitle Management
  // ---------------------------------------------------------------------------

  add(
    text: string,
    duration: number,
    speaker?: string,
    speakerColor?: string,
    priority = 0
  ): SubtitleEntry {
    const entry: SubtitleEntry = {
      id: `sub_${_subId++}`,
      text,
      speaker,
      speakerColor,
      startTime: this.elapsed,
      duration,
      priority,
    };
    this.queue.push(entry);
    this.queue.sort((a, b) => b.priority - a.priority);
    return entry;
  }

  addTimed(text: string, startTime: number, duration: number, speaker?: string): SubtitleEntry {
    const entry: SubtitleEntry = {
      id: `sub_${_subId++}`,
      text,
      speaker,
      startTime,
      duration,
      priority: 0,
    };
    this.queue.push(entry);
    this.queue.sort((a, b) => a.startTime - b.startTime);
    return entry;
  }

  clear(): void {
    this.queue = [];
    this.active = [];
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): SubtitleEntry[] {
    this.elapsed += dt;

    // Activate queued entries
    const ready: SubtitleEntry[] = [];
    this.queue = this.queue.filter((entry) => {
      if (entry.startTime <= this.elapsed) {
        ready.push(entry);
        return false;
      }
      return true;
    });

    for (const entry of ready) {
      if (this.active.length < this.maxVisible) {
        this.active.push(entry);
      }
    }

    // Remove expired
    const expired: SubtitleEntry[] = [];
    this.active = this.active.filter((entry) => {
      if (this.elapsed - entry.startTime >= entry.duration) {
        expired.push(entry);
        return false;
      }
      return true;
    });

    // History
    for (const e of expired) {
      this.history.push(e);
      if (this.history.length > this.maxHistory) this.history.shift();
    }

    return [...this.active];
  }

  // ---------------------------------------------------------------------------
  // Rendering Info
  // ---------------------------------------------------------------------------

  getFormattedText(entry: SubtitleEntry): string {
    if (entry.speaker) return `[${entry.speaker}] ${entry.text}`;
    return entry.text;
  }

  getActiveSubtitles(): SubtitleEntry[] {
    return [...this.active];
  }
  getHistory(): SubtitleEntry[] {
    return [...this.history];
  }
  getQueueLength(): number {
    return this.queue.length;
  }
}
