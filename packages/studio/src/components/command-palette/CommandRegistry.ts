/**
 * CommandRegistry.ts -- Central registry for all discoverable commands
 *
 * Provides a unified command system for the Cmd+K palette, keyboard shortcuts,
 * and programmatic invocation. Each command declares its metadata, category,
 * shortcut binding, and execute handler.
 */

// ─── Types ──────────────────────────────────────────────────────

export type CommandCategory =
  | 'navigation'
  | 'panel'
  | 'scene'
  | 'editor'
  | 'shader'
  | 'export'
  | 'ai'
  | 'collaboration'
  | 'debug'
  | 'scenario'
  | 'settings'
  | 'help';

export interface CommandEntry {
  /** Unique command identifier (e.g. 'panel.open.chat'). */
  id: string;
  /** Human-readable label shown in the palette. */
  label: string;
  /** Category for grouping in the palette UI. */
  category: CommandCategory;
  /** Optional keyboard shortcut display string (e.g. 'Ctrl+Shift+C'). */
  shortcut?: string;
  /** Optional description shown below the label. */
  description?: string;
  /** Optional icon identifier or emoji. */
  icon?: string;
  /** Tags for fuzzy search matching. */
  keywords?: string[];
  /** Execute the command. Returns void or a Promise<void>. */
  execute: () => void | Promise<void>;
  /** Optional predicate -- if false, command is hidden from palette. */
  when?: () => boolean;
}

// ─── Category Metadata ──────────────────────────────────────────

export const CATEGORY_META: Record<CommandCategory, { label: string; order: number }> = {
  navigation: { label: 'Navigation', order: 0 },
  panel: { label: 'Panels', order: 1 },
  scene: { label: 'Scene', order: 2 },
  editor: { label: 'Editor', order: 3 },
  shader: { label: 'Shaders', order: 4 },
  export: { label: 'Export', order: 5 },
  ai: { label: 'AI', order: 6 },
  collaboration: { label: 'Collaboration', order: 7 },
  debug: { label: 'Debug', order: 8 },
  scenario: { label: 'Scenarios', order: 9 },
  settings: { label: 'Settings', order: 10 },
  help: { label: 'Help', order: 11 },
};

// ─── Registry ───────────────────────────────────────────────────

class CommandRegistryImpl {
  private commands = new Map<string, CommandEntry>();
  private listeners = new Set<() => void>();

  /** Register a single command. Overwrites if id already exists. */
  register(command: CommandEntry): void {
    this.commands.set(command.id, command);
    this.notify();
  }

  /** Register multiple commands at once. */
  registerAll(commands: CommandEntry[]): void {
    for (const cmd of commands) {
      this.commands.set(cmd.id, cmd);
    }
    this.notify();
  }

  /** Unregister a command by id. */
  unregister(id: string): boolean {
    const removed = this.commands.delete(id);
    if (removed) this.notify();
    return removed;
  }

  /** Get a command by id. */
  get(id: string): CommandEntry | undefined {
    return this.commands.get(id);
  }

  /** Execute a command by id. Returns false if not found. */
  async execute(id: string): Promise<boolean> {
    const cmd = this.commands.get(id);
    if (!cmd) return false;
    await cmd.execute();
    return true;
  }

  /** Get all registered commands (respecting `when` predicates). */
  getAll(): CommandEntry[] {
    return Array.from(this.commands.values()).filter((cmd) => !cmd.when || cmd.when());
  }

  /** Get all commands grouped by category, sorted by category order. */
  getGrouped(): Map<CommandCategory, CommandEntry[]> {
    const grouped = new Map<CommandCategory, CommandEntry[]>();
    for (const cmd of this.getAll()) {
      const list = grouped.get(cmd.category) || [];
      list.push(cmd);
      grouped.set(cmd.category, list);
    }
    // Sort groups by category order
    const sorted = new Map<CommandCategory, CommandEntry[]>();
    const entries = Array.from(grouped.entries());
    entries.sort((a, b) => CATEGORY_META[a[0]].order - CATEGORY_META[b[0]].order);
    for (const [cat, cmds] of entries) {
      sorted.set(cat, cmds);
    }
    return sorted;
  }

  /**
   * Fuzzy search commands by query string.
   * Matches against label, description, keywords, and category.
   */
  search(query: string): CommandEntry[] {
    if (!query.trim()) return this.getAll();
    const q = query.toLowerCase().trim();
    const results: Array<{ cmd: CommandEntry; score: number }> = [];

    for (const cmd of this.getAll()) {
      let score = 0;
      const label = cmd.label.toLowerCase();
      const desc = (cmd.description || '').toLowerCase();
      const keywords = (cmd.keywords || []).map((k) => k.toLowerCase());

      // Exact label match
      if (label === q) score += 100;
      // Label starts with query
      else if (label.startsWith(q)) score += 80;
      // Label contains query
      else if (label.includes(q)) score += 60;
      // Description contains query
      if (desc.includes(q)) score += 30;
      // Keywords contain query
      for (const kw of keywords) {
        if (kw.includes(q)) score += 40;
      }
      // Category matches
      if (cmd.category.includes(q)) score += 20;
      // Command id contains query
      if (cmd.id.toLowerCase().includes(q)) score += 15;

      if (score > 0) {
        results.push({ cmd, score });
      }
    }

    return results.sort((a, b) => b.score - a.score).map((r) => r.cmd);
  }

  /** Subscribe to registry changes. Returns unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Get total command count. */
  get size(): number {
    return this.commands.size;
  }

  /** Clear all commands (useful for testing). */
  clear(): void {
    this.commands.clear();
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

// Singleton instance
export const commandRegistry = new CommandRegistryImpl();
export type { CommandRegistryImpl };
