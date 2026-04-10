/**
 * ToolManager — Editor tool switching, shortcuts, and extensibility
 *
 * Manages active tools, keyboard shortcuts, and custom tool plugins
 * for the scene editor.
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export interface EditorTool {
  id: string;
  name: string;
  icon?: string;
  category: 'transform' | 'create' | 'sculpt' | 'select' | 'custom';
  shortcut?: string;
  isActive?: boolean;
  onActivate?: () => void;
  onDeactivate?: () => void;
  onPointerDown?: (event: PointerEvent3D) => void;
  onPointerMove?: (event: PointerEvent3D) => void;
  onPointerUp?: (event: PointerEvent3D) => void;
}

export interface PointerEvent3D {
  x: number;
  y: number;
  z: number;
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
}

export interface ShortcutBinding {
  key: string;
  modifiers: ('ctrl' | 'shift' | 'alt')[];
  toolId?: string;
  action?: string;
  handler?: () => void;
}

// =============================================================================
// TOOL MANAGER
// =============================================================================

export class ToolManager {
  private tools: Map<string, EditorTool> = new Map();
  private activeToolId: string | null = null;
  private previousToolId: string | null = null;
  private shortcuts: ShortcutBinding[] = [];
  private toolHistory: string[] = [];
  private maxHistory: number = 20;

  /**
   * Register a tool
   */
  registerTool(tool: EditorTool): void {
    this.tools.set(tool.id, { ...tool, isActive: false });

    if (tool.shortcut) {
      this.registerShortcut({
        key: tool.shortcut,
        modifiers: [],
        toolId: tool.id,
      });
    }
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolId: string): boolean {
    if (this.activeToolId === toolId) {
      this.deactivateCurrentTool();
    }
    this.shortcuts = this.shortcuts.filter((s) => s.toolId !== toolId);
    return this.tools.delete(toolId);
  }

  /**
   * Activate a tool by ID
   */
  activateTool(toolId: string): boolean {
    const tool = this.tools.get(toolId);
    if (!tool) return false;

    this.deactivateCurrentTool();

    tool.isActive = true;
    this.previousToolId = this.activeToolId;
    this.activeToolId = toolId;

    this.toolHistory.push(toolId);
    if (this.toolHistory.length > this.maxHistory) {
      this.toolHistory.shift();
    }

    if (tool.onActivate) {
      tool.onActivate();
    }

    return true;
  }

  /**
   * Deactivate the current tool
   */
  deactivateCurrentTool(): void {
    if (this.activeToolId) {
      const current = this.tools.get(this.activeToolId);
      if (current) {
        current.isActive = false;
        if (current.onDeactivate) {
          current.onDeactivate();
        }
      }
    }
  }

  /**
   * Switch back to the previous tool
   */
  revertToPreviousTool(): boolean {
    if (this.previousToolId) {
      return this.activateTool(this.previousToolId);
    }
    return false;
  }

  /**
   * Get the currently active tool
   */
  getActiveTool(): EditorTool | null {
    return this.activeToolId ? this.tools.get(this.activeToolId) || null : null;
  }

  /**
   * Get active tool ID
   */
  getActiveToolId(): string | null {
    return this.activeToolId;
  }

  /**
   * Get all registered tools
   */
  getTools(): EditorTool[] {
    return [...this.tools.values()];
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(category: EditorTool['category']): EditorTool[] {
    return [...this.tools.values()].filter((t) => t.category === category);
  }

  /**
   * Register a keyboard shortcut
   */
  registerShortcut(binding: ShortcutBinding): void {
    this.shortcuts.push(binding);
  }

  /**
   * Handle a key event and activate matching tool/action
   */
  handleKeyEvent(key: string, modifiers: ('ctrl' | 'shift' | 'alt')[] = []): boolean {
    const binding = this.shortcuts.find(
      (s) =>
        s.key.toLowerCase() === key.toLowerCase() &&
        s.modifiers.length === modifiers.length &&
        s.modifiers.every((m) => modifiers.includes(m))
    );

    if (!binding) return false;

    if (binding.toolId) {
      return this.activateTool(binding.toolId);
    }

    if (binding.handler) {
      binding.handler();
      return true;
    }

    return false;
  }

  /**
   * Forward pointer events to active tool
   */
  handlePointerDown(event: PointerEvent3D): void {
    const tool = this.getActiveTool();
    if (tool?.onPointerDown) tool.onPointerDown(event);
  }

  handlePointerMove(event: PointerEvent3D): void {
    const tool = this.getActiveTool();
    if (tool?.onPointerMove) tool.onPointerMove(event);
  }

  handlePointerUp(event: PointerEvent3D): void {
    const tool = this.getActiveTool();
    if (tool?.onPointerUp) tool.onPointerUp(event);
  }

  /**
   * Get tool history
   */
  getToolHistory(): string[] {
    return [...this.toolHistory];
  }

  /**
   * Get all shortcut bindings
   */
  getShortcuts(): ShortcutBinding[] {
    return [...this.shortcuts];
  }

  /**
   * Get tool count
   */
  getToolCount(): number {
    return this.tools.size;
  }
}
