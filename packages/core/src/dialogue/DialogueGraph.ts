/**
 * DialogueGraph.ts
 *
 * Node-based dialogue system: dialogue nodes, branching,
 * conditional transitions, variable substitution, and speaker tracking.
 *
 * @module dialogue
 */

// =============================================================================
// TYPES
// =============================================================================

export type DialogueNodeType = 'text' | 'choice' | 'branch' | 'event' | 'end';

export interface DialogueNode {
  id: string;
  type: DialogueNodeType;
  speaker: string;
  text: string;
  choices: Array<{ text: string; nextId: string; condition?: string }>;
  nextId: string | null;
  condition: string | null;
  trueNextId: string | null;
  falseNextId: string | null;
  event: string | null;
  eventData: Record<string, unknown>;
  visited: boolean;
}

export interface DialogueState {
  variables: Map<string, unknown>;
  visitedNodes: Set<string>;
  currentNodeId: string | null;
  history: string[];
}

// =============================================================================
// DIALOGUE GRAPH
// =============================================================================

export class DialogueGraph {
  private nodes: Map<string, DialogueNode> = new Map();
  private state: DialogueState = {
    variables: new Map(),
    visitedNodes: new Set(),
    currentNodeId: null,
    history: [],
  };
  private startNodeId: string | null = null;
  private eventListeners: Array<(event: string, data: Record<string, unknown>) => void> = [];

  // ---------------------------------------------------------------------------
  // Node Management
  // ---------------------------------------------------------------------------

  addTextNode(id: string, speaker: string, text: string, nextId: string | null): DialogueNode {
    return this.addNode({
      id,
      type: 'text',
      speaker,
      text,
      choices: [],
      nextId,
      condition: null,
      trueNextId: null,
      falseNextId: null,
      event: null,
      eventData: {},
      visited: false,
    });
  }

  addChoiceNode(
    id: string,
    speaker: string,
    text: string,
    choices: Array<{ text: string; nextId: string; condition?: string }>
  ): DialogueNode {
    return this.addNode({
      id,
      type: 'choice',
      speaker,
      text,
      choices,
      nextId: null,
      condition: null,
      trueNextId: null,
      falseNextId: null,
      event: null,
      eventData: {},
      visited: false,
    });
  }

  addBranchNode(
    id: string,
    condition: string,
    trueNextId: string,
    falseNextId: string
  ): DialogueNode {
    return this.addNode({
      id,
      type: 'branch',
      speaker: '',
      text: '',
      choices: [],
      nextId: null,
      condition,
      trueNextId,
      falseNextId,
      event: null,
      eventData: {},
      visited: false,
    });
  }

  addEventNode(
    id: string,
    event: string,
    data: Record<string, unknown>,
    nextId: string | null
  ): DialogueNode {
    return this.addNode({
      id,
      type: 'event',
      speaker: '',
      text: '',
      choices: [],
      nextId,
      condition: null,
      trueNextId: null,
      falseNextId: null,
      event,
      eventData: data,
      visited: false,
    });
  }

  addEndNode(id: string): DialogueNode {
    return this.addNode({
      id,
      type: 'end',
      speaker: '',
      text: '',
      choices: [],
      nextId: null,
      condition: null,
      trueNextId: null,
      falseNextId: null,
      event: null,
      eventData: {},
      visited: false,
    });
  }

  private addNode(node: DialogueNode): DialogueNode {
    this.nodes.set(node.id, node);
    return node;
  }

  // ---------------------------------------------------------------------------
  // Flow Control
  // ---------------------------------------------------------------------------

  setStart(nodeId: string): void {
    this.startNodeId = nodeId;
  }

  start(): DialogueNode | null {
    if (!this.startNodeId) return null;
    this.state.currentNodeId = this.startNodeId;
    this.state.history = [];
    this.state.visitedNodes.clear();
    return this.processCurrentNode();
  }

  advance(choiceIndex?: number): DialogueNode | null {
    const current = this.getCurrentNode();
    if (!current) return null;

    let nextId: string | null = null;

    switch (current.type) {
      case 'text':
        nextId = current.nextId;
        break;
      case 'choice':
        if (choiceIndex !== undefined && choiceIndex < current.choices.length) {
          const choice = current.choices[choiceIndex];
          nextId = choice.nextId;
        }
        break;
      case 'branch':
        nextId = this.evaluateCondition(current.condition!)
          ? current.trueNextId
          : current.falseNextId;
        break;
      case 'event':
        if (current.event) {
          for (const listener of this.eventListeners) listener(current.event, current.eventData);
        }
        nextId = current.nextId;
        break;
      case 'end':
        this.state.currentNodeId = null;
        return null;
    }

    if (nextId) {
      this.state.currentNodeId = nextId;
      return this.processCurrentNode();
    }

    this.state.currentNodeId = null;
    return null;
  }

  private processCurrentNode(): DialogueNode | null {
    const node = this.getCurrentNode();
    if (!node) return null;

    node.visited = true;
    this.state.visitedNodes.add(node.id);
    this.state.history.push(node.id);

    // Auto-advance branch and event nodes
    if (node.type === 'branch' || node.type === 'event') {
      return this.advance();
    }

    return node;
  }

  getCurrentNode(): DialogueNode | null {
    return this.state.currentNodeId ? (this.nodes.get(this.state.currentNodeId) ?? null) : null;
  }

  // ---------------------------------------------------------------------------
  // Variables & Conditions
  // ---------------------------------------------------------------------------

  setVariable(key: string, value: unknown): void {
    this.state.variables.set(key, value);
  }

  getVariable<T = unknown>(key: string): T | undefined {
    return this.state.variables.get(key) as T | undefined;
  }

  private evaluateCondition(condition: string): boolean {
    return !!this.state.variables.get(condition);
  }

  // ---------------------------------------------------------------------------
  // Text interpolation
  // ---------------------------------------------------------------------------

  interpolateText(text: string): string {
    return text.replace(/\{(\w+)\}/g, (_match, key) => {
      const val = this.state.variables.get(key);
      return val !== undefined ? String(val) : `{${key}}`;
    });
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  onEvent(listener: (event: string, data: Record<string, unknown>) => void): void {
    this.eventListeners.push(listener);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getNodeCount(): number {
    return this.nodes.size;
  }

  getVisitedCount(): number {
    return this.state.visitedNodes.size;
  }

  getHistory(): string[] {
    return [...this.state.history];
  }

  isComplete(): boolean {
    return this.state.currentNodeId === null && this.state.history.length > 0;
  }

  getAvailableChoices(): Array<{ text: string; nextId: string }> {
    const node = this.getCurrentNode();
    if (!node || node.type !== 'choice') return [];
    return node.choices.filter((c) => !c.condition || this.evaluateCondition(c.condition));
  }
}
