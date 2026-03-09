/**
 * NodeLibrary — Built-in visual scripting nodes
 *
 * @version 1.0.0
 */

import type { GraphNode, PortType } from './NodeGraph';

export interface NodeDefinition {
  type: string;
  label: string;
  category: string;
  description: string;
  ports: {
    id: string;
    name: string;
    type: PortType;
    direction: 'input' | 'output';
    defaultValue?: unknown;
  }[];
  evaluate?: (inputs: Record<string, unknown>) => Record<string, unknown>;
}

export class NodeLibrary {
  private definitions: Map<string, NodeDefinition> = new Map();

  constructor() {
    this.registerBuiltins();
  }

  private registerBuiltins(): void {
    // Math
    this.register({
      type: 'math.add',
      label: 'Add',
      category: 'math',
      description: 'Add two numbers',
      ports: [
        { id: 'a', name: 'A', type: 'number', direction: 'input', defaultValue: 0 },
        { id: 'b', name: 'B', type: 'number', direction: 'input', defaultValue: 0 },
        { id: 'result', name: 'Result', type: 'number', direction: 'output' },
      ],
      evaluate: (inputs) => ({ result: (inputs.a as number) + (inputs.b as number) }),
    });

    this.register({
      type: 'math.multiply',
      label: 'Multiply',
      category: 'math',
      description: 'Multiply two numbers',
      ports: [
        { id: 'a', name: 'A', type: 'number', direction: 'input', defaultValue: 0 },
        { id: 'b', name: 'B', type: 'number', direction: 'input', defaultValue: 1 },
        { id: 'result', name: 'Result', type: 'number', direction: 'output' },
      ],
      evaluate: (inputs) => ({ result: (inputs.a as number) * (inputs.b as number) }),
    });

    this.register({
      type: 'math.clamp',
      label: 'Clamp',
      category: 'math',
      description: 'Clamp value between min and max',
      ports: [
        { id: 'value', name: 'Value', type: 'number', direction: 'input', defaultValue: 0 },
        { id: 'min', name: 'Min', type: 'number', direction: 'input', defaultValue: 0 },
        { id: 'max', name: 'Max', type: 'number', direction: 'input', defaultValue: 1 },
        { id: 'result', name: 'Result', type: 'number', direction: 'output' },
      ],
      evaluate: (inputs) => ({
        result: Math.max(
          inputs.min as number,
          Math.min(inputs.max as number, inputs.value as number)
        ),
      }),
    });

    // Logic
    this.register({
      type: 'logic.and',
      label: 'AND',
      category: 'logic',
      description: 'Logical AND',
      ports: [
        { id: 'a', name: 'A', type: 'boolean', direction: 'input', defaultValue: false },
        { id: 'b', name: 'B', type: 'boolean', direction: 'input', defaultValue: false },
        { id: 'result', name: 'Result', type: 'boolean', direction: 'output' },
      ],
      evaluate: (inputs) => ({ result: Boolean(inputs.a) && Boolean(inputs.b) }),
    });

    this.register({
      type: 'logic.not',
      label: 'NOT',
      category: 'logic',
      description: 'Logical NOT',
      ports: [
        { id: 'input', name: 'Input', type: 'boolean', direction: 'input', defaultValue: false },
        { id: 'result', name: 'Result', type: 'boolean', direction: 'output' },
      ],
      evaluate: (inputs) => ({ result: !Boolean(inputs.input) }),
    });

    this.register({
      type: 'logic.compare',
      label: 'Compare',
      category: 'logic',
      description: 'Compare two numbers',
      ports: [
        { id: 'a', name: 'A', type: 'number', direction: 'input', defaultValue: 0 },
        { id: 'b', name: 'B', type: 'number', direction: 'input', defaultValue: 0 },
        { id: 'equal', name: 'Equal', type: 'boolean', direction: 'output' },
        { id: 'greater', name: 'Greater', type: 'boolean', direction: 'output' },
        { id: 'less', name: 'Less', type: 'boolean', direction: 'output' },
      ],
      evaluate: (inputs) => ({
        equal: inputs.a === inputs.b,
        greater: (inputs.a as number) > (inputs.b as number),
        less: (inputs.a as number) < (inputs.b as number),
      }),
    });

    // Flow
    this.register({
      type: 'flow.branch',
      label: 'Branch',
      category: 'flow',
      description: 'Conditional branch',
      ports: [
        { id: 'exec_in', name: 'Exec', type: 'exec', direction: 'input' },
        {
          id: 'condition',
          name: 'Condition',
          type: 'boolean',
          direction: 'input',
          defaultValue: false,
        },
        { id: 'true', name: 'True', type: 'exec', direction: 'output' },
        { id: 'false', name: 'False', type: 'exec', direction: 'output' },
      ],
    });

    // Events
    this.register({
      type: 'event.onStart',
      label: 'On Start',
      category: 'events',
      description: 'Fires once on start',
      ports: [{ id: 'exec', name: 'Exec', type: 'exec', direction: 'output' }],
    });

    this.register({
      type: 'event.onTick',
      label: 'On Tick',
      category: 'events',
      description: 'Fires every frame',
      ports: [
        { id: 'exec', name: 'Exec', type: 'exec', direction: 'output' },
        { id: 'deltaTime', name: 'Delta Time', type: 'number', direction: 'output' },
      ],
    });
  }

  register(def: NodeDefinition): void {
    this.definitions.set(def.type, def);
  }

  get(type: string): NodeDefinition | undefined {
    return this.definitions.get(type);
  }

  getByCategory(category: string): NodeDefinition[] {
    return [...this.definitions.values()].filter((d) => d.category === category);
  }

  getCategories(): string[] {
    return [...new Set([...this.definitions.values()].map((d) => d.category))];
  }

  search(query: string): NodeDefinition[] {
    const q = query.toLowerCase();
    return [...this.definitions.values()].filter(
      (d) => d.label.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)
    );
  }

  createNode(
    type: string,
    id: string,
    position: { x: number; y: number } = { x: 0, y: 0 }
  ): GraphNode | null {
    const def = this.definitions.get(type);
    if (!def) return null;
    return { id, type: def.type, label: def.label, ports: [...def.ports], position, data: {} };
  }

  getCount(): number {
    return this.definitions.size;
  }
  getAllTypes(): string[] {
    return [...this.definitions.keys()];
  }
}
