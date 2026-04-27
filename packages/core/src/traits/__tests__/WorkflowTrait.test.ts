/**
 * WorkflowTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { workflowHandler } from '../WorkflowTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __wfState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_steps: 50 };

describe('WorkflowTrait', () => {
  it('has name "workflow"', () => {
    expect(workflowHandler.name).toBe('workflow');
  });

  it('workflow:create emits workflow:created', () => {
    const node = makeNode();
    workflowHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    workflowHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'workflow:create', workflowId: 'wf1', steps: ['a', 'b', 'c'],
    } as never);
    expect(node.emit).toHaveBeenCalledWith('workflow:created', { workflowId: 'wf1' });
  });
});
