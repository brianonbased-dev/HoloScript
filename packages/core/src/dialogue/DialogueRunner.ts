/**
 * DialogueRunner.ts
 *
 * Dialogue execution: node traversal, variable substitution,
 * conditional branching, and event hooks.
 *
 * @module dialogue
 */

// =============================================================================
// TYPES
// =============================================================================

export type DialogueNodeType = 'text' | 'choice' | 'branch' | 'event';

export interface DialogueNode {
  id: string;
  type: DialogueNodeType;
  speaker?: string;
  text?: string; // Supports {variable} substitution
  choices?: Array<{ label: string; nextId: string; condition?: string }>;
  condition?: string; // Variable name to check truthiness
  trueNextId?: string;
  falseNextId?: string;
  nextId?: string;
  event?: string;
}

export type EventCallback = (event: string, nodeId: string) => void;

// =============================================================================
// DIALOGUE RUNNER
// =============================================================================

export class DialogueRunner {
  private nodes: Map<string, DialogueNode> = new Map();
  private variables: Map<string, unknown> = new Map();
  private currentNodeId: string | null = null;
  private history: string[] = [];
  private eventCallback: EventCallback | null = null;
  private finished = false;

  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------

  loadNodes(nodes: DialogueNode[]): void {
    for (const n of nodes) this.nodes.set(n.id, n);
  }

  setVariable(key: string, value: unknown): void {
    this.variables.set(key, value);
  }
  getVariable(key: string): unknown {
    return this.variables.get(key);
  }
  onEvent(cb: EventCallback): void {
    this.eventCallback = cb;
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  start(nodeId: string): DialogueNode | null {
    this.currentNodeId = nodeId;
    this.finished = false;
    this.history = [];
    return this.processNode();
  }

  advance(choiceIndex?: number): DialogueNode | null {
    if (this.finished || !this.currentNodeId) return null;

    const node = this.nodes.get(this.currentNodeId);
    if (!node) return null;

    if (node.type === 'choice' && choiceIndex !== undefined && node.choices) {
      const availableChoices = this.getAvailableChoices(node);
      const choice = availableChoices[choiceIndex];
      if (choice) {
        this.currentNodeId = choice.nextId;
      } else {
        this.finished = true;
        return null;
      }
    } else if (node.nextId) {
      this.currentNodeId = node.nextId;
    } else {
      this.finished = true;
      return null;
    }

    return this.processNode();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private processNode(): DialogueNode | null {
    const node = this.nodes.get(this.currentNodeId!);
    if (!node) {
      this.finished = true;
      return null;
    }

    this.history.push(node.id);

    // Handle branch nodes
    if (node.type === 'branch' && node.condition) {
      const val = this.variables.get(node.condition);
      this.currentNodeId = val ? (node.trueNextId ?? null) : (node.falseNextId ?? null);
      if (!this.currentNodeId) {
        this.finished = true;
        return null;
      }
      return this.processNode();
    }

    // Fire events
    if (node.type === 'event' && node.event) {
      if (this.eventCallback) this.eventCallback(node.event, node.id);
      if (node.nextId) {
        this.currentNodeId = node.nextId;
        return this.processNode();
      }
      this.finished = true;
      return null;
    }

    return node;
  }

  // ---------------------------------------------------------------------------
  // Text Substitution
  // ---------------------------------------------------------------------------

  resolveText(text: string): string {
    return text.replace(/\{(\w+)\}/g, (_, key) => String(this.variables.get(key) ?? `{${key}}`));
  }

  getAvailableChoices(node: DialogueNode): Array<{ label: string; nextId: string }> {
    if (!node.choices) return [];
    return node.choices.filter((c) => !c.condition || this.variables.get(c.condition));
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getCurrentNode(): DialogueNode | null {
    return this.currentNodeId ? (this.nodes.get(this.currentNodeId) ?? null) : null;
  }
  isFinished(): boolean {
    return this.finished;
  }
  getHistory(): string[] {
    return [...this.history];
  }
}
