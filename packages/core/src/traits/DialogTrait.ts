/**
 * @holoscript/core Dialog Trait
 *
 * Enables conversational NPCs with dialog trees, branching choices,
 * conditions, and dynamic text.
 *
 * @example
 * ```hsplus
 * object "Shopkeeper" {
 *   @dialog {
 *     startNode: "greeting",
 *     nodes: {
 *       greeting: {
 *         text: "Welcome to my shop! What can I help you with?",
 *         choices: [
 *           { text: "Show me your wares", next: "shop" },
 *           { text: "Any rumors?", next: "rumors", condition: "playerLevel >= 5" },
 *           { text: "Goodbye", next: null }
 *         ]
 *       }
 *     }
 *   }
 * }
 * ```
 */

/**
 * Dialog node types
 */
export type DialogNodeType = 'text' | 'choice' | 'branch' | 'action' | 'random';

/**
 * Condition for dialog choices/branches
 */
export interface DialogCondition {
  /** Variable to check */
  variable: string;

  /** Comparison operator */
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'not_contains';

  /** Value to compare against */
  value: unknown;

  /** Logical operator for chaining */
  chain?: 'and' | 'or';
}

/**
 * Action to execute during dialog
 */
export interface DialogAction {
  /** Action type */
  type:
    | 'set_variable'
    | 'add_item'
    | 'remove_item'
    | 'play_animation'
    | 'play_sound'
    | 'emit_event'
    | 'custom';

  /** Target variable/item/animation */
  target?: string;

  /** Value to set/add */
  value?: unknown;

  /** Custom action handler */
  handler?: string;

  /** Delay before executing (ms) */
  delay?: number;
}

/**
 * Choice option in dialog
 */
export interface DialogChoice {
  /** Display text for choice */
  text: string;

  /** Next node ID (null to end dialog) */
  next: string | null;

  /** Condition to show this choice */
  condition?: DialogCondition | DialogCondition[];

  /** Actions to execute when chosen */
  actions?: DialogAction[];

  /** Is this choice disabled (shown but not selectable) */
  disabled?: boolean;

  /** Tooltip for disabled state */
  disabledReason?: string;

  /** Custom data for the choice */
  data?: Record<string, unknown>;
}

/**
 * Dialog node definition
 */
export interface DialogNode {
  /** Node ID */
  id: string;

  /** Node type */
  type: DialogNodeType;

  /** Speaker name (for text nodes) */
  speaker?: string;

  /** Dialog text (supports ${variable} interpolation) */
  text?: string;

  /** Rich text with markup */
  richText?: string;

  /** Choices for this node */
  choices?: DialogChoice[];

  /** Next node (for linear progression) */
  next?: string | null;

  /** Actions to execute when entering this node */
  onEnter?: DialogAction[];

  /** Actions to execute when leaving this node */
  onExit?: DialogAction[];

  /** Branches based on conditions */
  branches?: Array<{
    condition: DialogCondition | DialogCondition[];
    next: string;
  }>;

  /** Random next nodes with weights */
  randomNext?: Array<{
    next: string;
    weight: number;
  }>;

  /** Voice line asset ID */
  voiceLine?: string;

  /** Portrait/emotion for speaker */
  portrait?: string;

  /** Typing effect speed (chars per second) */
  typingSpeed?: number;

  /** Auto-advance delay (ms) */
  autoAdvance?: number;

  /** Custom data */
  data?: Record<string, unknown>;
}

/**
 * Dialog tree definition
 */
export interface DialogTree {
  /** Tree ID */
  id: string;

  /** Display name */
  name?: string;

  /** Starting node ID */
  startNode: string;

  /** All nodes in tree */
  nodes: Map<string, DialogNode> | Record<string, DialogNode>;

  /** Default speaker */
  defaultSpeaker?: string;

  /** Default typing speed */
  defaultTypingSpeed?: number;

  /** Variables local to this dialog */
  localVariables?: Record<string, unknown>;
}

/**
 * Dialog history entry
 */
export interface DialogHistoryEntry {
  /** Node ID */
  nodeId: string;

  /** Choice made (if any) */
  choiceIndex?: number;

  /** Timestamp */
  timestamp: number;
}

/**
 * Dialog state
 */
export type DialogState = 'inactive' | 'active' | 'waiting_choice' | 'paused' | 'ended';

/**
 * Dialog event types
 */
export type DialogEventType =
  | 'start'
  | 'end'
  | 'node-enter'
  | 'node-exit'
  | 'choice-made'
  | 'text-complete'
  | 'action-executed';

/**
 * Dialog event
 */
export interface DialogEvent {
  /** Event type */
  type: DialogEventType;

  /** Current tree ID */
  treeId?: string;

  /** Current node */
  node?: DialogNode;

  /** Choice selected */
  choice?: DialogChoice;

  /** Choice index */
  choiceIndex?: number;

  /** Action executed */
  action?: DialogAction;

  /** Timestamp */
  timestamp: number;
}

/**
 * Dialog configuration
 */
export interface DialogConfig {
  /** Dialog trees */
  trees?: DialogTree[];

  /** Global variables */
  variables?: Record<string, unknown>;

  /** Default typing speed (chars/sec) */
  typingSpeed?: number;

  /** Allow skipping text animation */
  allowSkip?: boolean;

  /** Show choice numbers */
  showChoiceNumbers?: boolean;

  /** Input mode */
  inputMode?: 'click' | 'keyboard' | 'voice' | 'any';

  /** Max history entries */
  maxHistory?: number;

  /** Auto-save variables */
  autoSaveVariables?: boolean;
}

/**
 * Dialog event callback
 */
type DialogEventCallback = (event: DialogEvent) => void;

/**
 * Dialog Trait - Conversational NPCs
 */
export class DialogTrait {
  private config: DialogConfig;
  private state: DialogState = 'inactive';
  private trees: Map<string, DialogTree> = new Map();
  private currentTree: DialogTree | null = null;
  private currentNode: DialogNode | null = null;
  private variables: Map<string, unknown> = new Map();
  private history: DialogHistoryEntry[] = [];
  private eventListeners: Map<DialogEventType, Set<DialogEventCallback>> = new Map();
  private textProgress: number = 0;
  private textTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: DialogConfig = {}) {
    this.config = {
      typingSpeed: 50,
      allowSkip: true,
      showChoiceNumbers: true,
      inputMode: 'any',
      maxHistory: 100,
      autoSaveVariables: true,
      ...config,
    };

    // Initialize variables
    if (config.variables) {
      for (const [key, value] of Object.entries(config.variables)) {
        this.variables.set(key, value);
      }
    }

    // Load trees
    if (config.trees) {
      for (const tree of config.trees) {
        this.addTree(tree);
      }
    }
  }

  // ============================================================================
  // Core API
  // ============================================================================

  /**
   * Get configuration
   */
  public getConfig(): DialogConfig {
    return { ...this.config };
  }

  /**
   * Get current state
   */
  public getState(): DialogState {
    return this.state;
  }

  /**
   * Check if dialog is active
   */
  public isActive(): boolean {
    return this.state !== 'inactive' && this.state !== 'ended';
  }

  // ============================================================================
  // Tree Management
  // ============================================================================

  /**
   * Add a dialog tree
   */
  public addTree(tree: DialogTree): void {
    // Convert nodes object to Map if needed
    const nodes = tree.nodes instanceof Map ? tree.nodes : new Map(Object.entries(tree.nodes));

    this.trees.set(tree.id, {
      ...tree,
      nodes,
    });
  }

  /**
   * Remove a dialog tree
   */
  public removeTree(treeId: string): void {
    this.trees.delete(treeId);
  }

  /**
   * Get a dialog tree
   */
  public getTree(treeId: string): DialogTree | undefined {
    return this.trees.get(treeId);
  }

  /**
   * Get all tree IDs
   */
  public getTreeIds(): string[] {
    return Array.from(this.trees.keys());
  }

  // ============================================================================
  // Dialog Flow
  // ============================================================================

  /**
   * Start a dialog
   */
  public start(treeId: string, nodeId?: string): boolean {
    const tree = this.trees.get(treeId);
    if (!tree) {
      console.warn(`Dialog tree not found: ${treeId}`);
      return false;
    }

    this.currentTree = tree;
    const startId = nodeId ?? tree.startNode;

    // Initialize local variables
    if (tree.localVariables) {
      for (const [key, value] of Object.entries(tree.localVariables)) {
        this.variables.set(`${treeId}.${key}`, value);
      }
    }

    this.state = 'active';
    this.emit({
      type: 'start',
      treeId,
      timestamp: Date.now(),
    });

    return this.goToNode(startId);
  }

  /**
   * Go to a specific node
   */
  public goToNode(nodeId: string): boolean {
    if (!this.currentTree) return false;

    const nodes =
      this.currentTree.nodes instanceof Map
        ? this.currentTree.nodes
        : new Map(Object.entries(this.currentTree.nodes));

    const node = nodes.get(nodeId);
    if (!node) {
      console.warn(`Dialog node not found: ${nodeId}`);
      return false;
    }

    // Exit current node
    if (this.currentNode) {
      this.executeActions(this.currentNode.onExit);
      this.emit({
        type: 'node-exit',
        treeId: this.currentTree.id,
        node: this.currentNode,
        timestamp: Date.now(),
      });
    }

    this.currentNode = { ...node, id: nodeId };

    // Record history
    this.history.push({
      nodeId,
      timestamp: Date.now(),
    });

    // Trim history if needed
    if (this.history.length > (this.config.maxHistory ?? 100)) {
      this.history.shift();
    }

    // Execute entry actions
    this.executeActions(node.onEnter);

    this.emit({
      type: 'node-enter',
      treeId: this.currentTree.id,
      node: this.currentNode,
      timestamp: Date.now(),
    });

    // Handle node type
    this.processNode(node);

    return true;
  }

  /**
   * Process node based on type
   */
  private processNode(node: DialogNode): void {
    switch (node.type) {
      case 'text':
        this.startTextAnimation(node);
        break;

      case 'choice':
        this.state = 'waiting_choice';
        break;

      case 'branch':
        this.processBranch(node);
        break;

      case 'random':
        this.processRandom(node);
        break;

      case 'action':
        this.executeActions(node.onEnter);
        if (node.next) {
          this.goToNode(node.next);
        }
        break;
    }
  }

  /**
   * Start text animation
   */
  private startTextAnimation(node: DialogNode): void {
    if (!node.text) return;

    this.textProgress = 0;
    const speed =
      node.typingSpeed ?? this.currentTree?.defaultTypingSpeed ?? this.config.typingSpeed ?? 50;
    const interval = 1000 / speed;

    const text = this.interpolateText(node.text);
    const length = text.length;

    const animate = () => {
      this.textProgress++;
      if (this.textProgress >= length) {
        this.textComplete();
      } else {
        this.textTimer = setTimeout(animate, interval);
      }
    };

    this.textTimer = setTimeout(animate, interval);
  }

  /**
   * Text animation complete
   */
  private textComplete(): void {
    if (this.textTimer) {
      clearTimeout(this.textTimer);
      this.textTimer = null;
    }

    this.emit({
      type: 'text-complete',
      treeId: this.currentTree?.id,
      node: this.currentNode ?? undefined,
      timestamp: Date.now(),
    });

    if (this.currentNode?.choices && this.currentNode.choices.length > 0) {
      this.state = 'waiting_choice';
    } else if (this.currentNode?.autoAdvance) {
      setTimeout(() => {
        if (this.currentNode?.next) {
          this.goToNode(this.currentNode.next);
        } else {
          this.end();
        }
      }, this.currentNode.autoAdvance);
    }
  }

  /**
   * Skip text animation
   */
  public skipText(): void {
    if (!this.config.allowSkip) return;
    if (this.textTimer) {
      clearTimeout(this.textTimer);
      this.textTimer = null;
    }
    this.textProgress = this.currentNode?.text?.length ?? 0;
    this.textComplete();
  }

  /**
   * Process branch node
   */
  private processBranch(node: DialogNode): void {
    if (!node.branches) return;

    for (const branch of node.branches) {
      if (
        this.evaluateConditions(
          Array.isArray(branch.condition) ? branch.condition : [branch.condition]
        )
      ) {
        this.goToNode(branch.next);
        return;
      }
    }

    // Fall through to next if no branch matches
    if (node.next) {
      this.goToNode(node.next);
    }
  }

  /**
   * Process random node
   */
  private processRandom(node: DialogNode): void {
    if (!node.randomNext || node.randomNext.length === 0) return;

    const totalWeight = node.randomNext.reduce((sum, r) => sum + r.weight, 0);
    let random = Math.random() * totalWeight;

    for (const option of node.randomNext) {
      random -= option.weight;
      if (random <= 0) {
        this.goToNode(option.next);
        return;
      }
    }

    // Fallback to first
    this.goToNode(node.randomNext[0].next);
  }

  /**
   * Select a choice
   */
  public selectChoice(index: number): boolean {
    if (this.state !== 'waiting_choice') return false;
    if (!this.currentNode?.choices) return false;

    const availableChoices = this.getAvailableChoices();
    if (index < 0 || index >= availableChoices.length) return false;

    const choice = availableChoices[index];
    if (choice.disabled) return false;

    // Record in history
    if (this.history.length > 0) {
      this.history[this.history.length - 1].choiceIndex = index;
    }

    // Execute choice actions
    this.executeActions(choice.actions);

    this.emit({
      type: 'choice-made',
      treeId: this.currentTree?.id,
      node: this.currentNode,
      choice,
      choiceIndex: index,
      timestamp: Date.now(),
    });

    // Navigate to next node
    if (choice.next) {
      return this.goToNode(choice.next);
    } else {
      return this.end();
    }
  }

  /**
   * Get available choices (filtered by conditions)
   */
  public getAvailableChoices(): DialogChoice[] {
    if (!this.currentNode?.choices) return [];

    return this.currentNode.choices.filter((choice) => {
      if (!choice.condition) return true;
      const conditions = Array.isArray(choice.condition) ? choice.condition : [choice.condition];
      return this.evaluateConditions(conditions);
    });
  }

  /**
   * Continue to next node (for linear nodes)
   */
  public continue(): boolean {
    if (!this.currentNode) return false;
    if (this.state === 'waiting_choice') return false;

    if (this.currentNode.next) {
      return this.goToNode(this.currentNode.next);
    } else {
      return this.end();
    }
  }

  /**
   * End the dialog
   */
  public end(): boolean {
    this.state = 'ended';

    if (this.textTimer) {
      clearTimeout(this.textTimer);
      this.textTimer = null;
    }

    this.emit({
      type: 'end',
      treeId: this.currentTree?.id,
      timestamp: Date.now(),
    });

    this.currentTree = null;
    this.currentNode = null;
    this.state = 'inactive';

    return true;
  }

  /**
   * Pause the dialog
   */
  public pause(): void {
    if (this.state === 'active' || this.state === 'waiting_choice') {
      this.state = 'paused';
      if (this.textTimer) {
        clearTimeout(this.textTimer);
        this.textTimer = null;
      }
    }
  }

  /**
   * Resume the dialog
   */
  public resume(): void {
    if (this.state === 'paused') {
      if (this.currentNode?.choices) {
        this.state = 'waiting_choice';
      } else {
        this.state = 'active';
      }
    }
  }

  // ============================================================================
  // Variables
  // ============================================================================

  /**
   * Set a variable
   */
  public setVariable(name: string, value: unknown): void {
    this.variables.set(name, value);
  }

  /**
   * Get a variable
   */
  public getVariable(name: string): unknown {
    return this.variables.get(name);
  }

  /**
   * Get all variables
   */
  public getVariables(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.variables) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Clear all variables
   */
  public clearVariables(): void {
    this.variables.clear();
  }

  // ============================================================================
  // Text & Display
  // ============================================================================

  /**
   * Get current text (with interpolation)
   */
  public getCurrentText(): string {
    if (!this.currentNode?.text) return '';
    return this.interpolateText(this.currentNode.text);
  }

  /**
   * Get current text progress (for typing effect)
   */
  public getTextProgress(): number {
    return this.textProgress;
  }

  /**
   * Get visible text (up to current progress)
   */
  public getVisibleText(): string {
    const fullText = this.getCurrentText();
    return fullText.substring(0, this.textProgress);
  }

  /**
   * Get current speaker
   */
  public getCurrentSpeaker(): string | undefined {
    return this.currentNode?.speaker ?? this.currentTree?.defaultSpeaker;
  }

  /**
   * Get current portrait
   */
  public getCurrentPortrait(): string | undefined {
    return this.currentNode?.portrait;
  }

  /**
   * Get current node
   */
  public getCurrentNode(): DialogNode | null {
    return this.currentNode;
  }

  /**
   * Interpolate variables in text
   */
  private interpolateText(text: string): string {
    return text.replace(/\$\{(\w+)\}/g, (_, varName) => {
      const value = this.variables.get(varName);
      return value !== undefined ? String(value) : `\${${varName}}`;
    });
  }

  // ============================================================================
  // Conditions
  // ============================================================================

  /**
   * Evaluate conditions
   */
  private evaluateConditions(conditions: DialogCondition[]): boolean {
    if (conditions.length === 0) return true;

    let result = this.evaluateCondition(conditions[0]);

    for (let i = 1; i < conditions.length; i++) {
      const prev = conditions[i - 1];
      const curr = conditions[i];
      const evalResult = this.evaluateCondition(curr);

      if (prev.chain === 'or') {
        result = result || evalResult;
      } else {
        result = result && evalResult;
      }
    }

    return result;
  }

  /**
   * Evaluate single condition
   */
  private evaluateCondition(condition: DialogCondition): boolean {
    const value = this.variables.get(condition.variable);

    switch (condition.operator) {
      case '==':
        return value === condition.value;
      case '!=':
        return value !== condition.value;
      case '>':
        return Number(value) > Number(condition.value);
      case '<':
        return Number(value) < Number(condition.value);
      case '>=':
        return Number(value) >= Number(condition.value);
      case '<=':
        return Number(value) <= Number(condition.value);
      case 'contains':
        if (Array.isArray(value)) {
          return value.includes(condition.value);
        }
        return String(value).includes(String(condition.value));
      case 'not_contains':
        if (Array.isArray(value)) {
          return !value.includes(condition.value);
        }
        return !String(value).includes(String(condition.value));
      default:
        return false;
    }
  }

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * Execute actions
   */
  private executeActions(actions?: DialogAction[]): void {
    if (!actions) return;

    for (const action of actions) {
      if (action.delay) {
        setTimeout(() => this.executeAction(action), action.delay);
      } else {
        this.executeAction(action);
      }
    }
  }

  /**
   * Execute single action
   */
  private executeAction(action: DialogAction): void {
    switch (action.type) {
      case 'set_variable':
        if (action.target) {
          this.variables.set(action.target, action.value);
        }
        break;

      case 'add_item':
      case 'remove_item':
      case 'play_animation':
      case 'play_sound':
      case 'emit_event':
        // These would integrate with game systems
        break;

      case 'custom':
        // Custom handler would be called
        break;
    }

    this.emit({
      type: 'action-executed',
      treeId: this.currentTree?.id,
      action,
      timestamp: Date.now(),
    });
  }

  // ============================================================================
  // History
  // ============================================================================

  /**
   * Get dialog history
   */
  public getHistory(): DialogHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Clear history
   */
  public clearHistory(): void {
    this.history = [];
  }

  /**
   * Go back in history
   */
  public goBack(steps: number = 1): boolean {
    if (this.history.length <= steps) return false;

    // Remove recent entries
    for (let i = 0; i < steps; i++) {
      this.history.pop();
    }

    // Go to last entry
    const lastEntry = this.history[this.history.length - 1];
    if (lastEntry) {
      // Remove this entry too since goToNode will re-add it
      this.history.pop();
      return this.goToNode(lastEntry.nodeId);
    }

    return false;
  }

  // ============================================================================
  // Events
  // ============================================================================

  /**
   * Register event listener
   */
  public on(event: DialogEventType, callback: DialogEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unregister event listener
   */
  public off(event: DialogEventType, callback: DialogEventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Emit event
   */
  private emit(event: DialogEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(event);
        } catch (e) {
          console.error('Dialog event listener error:', e);
        }
      }
    }
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Export state for saving
   */
  public exportState(): {
    variables: Record<string, unknown>;
    history: DialogHistoryEntry[];
    currentTreeId?: string;
    currentNodeId?: string;
  } {
    return {
      variables: this.getVariables(),
      history: this.getHistory(),
      currentTreeId: this.currentTree?.id,
      currentNodeId: this.currentNode?.id,
    };
  }

  /**
   * Import saved state
   */
  public importState(data: {
    variables?: Record<string, unknown>;
    history?: DialogHistoryEntry[];
  }): void {
    if (data.variables) {
      this.variables.clear();
      for (const [key, value] of Object.entries(data.variables)) {
        this.variables.set(key, value);
      }
    }

    if (data.history) {
      this.history = [...data.history];
    }
  }
}

/**
 * Create a dialog trait
 */
export function createDialogTrait(config?: DialogConfig): DialogTrait {
  return new DialogTrait(config);
}

// ── Handler (delegates to DialogTrait) ──
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, TraitInstanceDelegate } from './TraitTypes';

export const dialogHandler = {
  name: 'dialog',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: any, ctx: TraitContext): void {
    const instance = new DialogTrait(config);
    node.__dialog_instance = instance;
    ctx.emit('dialog_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: any, ctx: TraitContext): void {
    const instance = node.__dialog_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('dialog_detached', { node });
    delete node.__dialog_instance;
  },
  onEvent(node: HSPlusNode, _config: any, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__dialog_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'dialog_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('dialog_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: any, ctx: TraitContext, dt: number): void {
    const instance = node.__dialog_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
