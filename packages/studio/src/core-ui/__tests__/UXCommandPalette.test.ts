import { describe, expect, it, vi } from 'vitest';
import {
  createStudioPublishingCommands,
  type StudioPublishToolName,
} from '../UXCommandPalette';

describe('createStudioPublishingCommands', () => {
  it('publishes the current editor AST to the marketplace tool', async () => {
    const runTool = vi.fn<
      (tool: StudioPublishToolName, input: Record<string, unknown>) => Promise<unknown>
    >().mockResolvedValue({ success: true });
    const notify = vi.fn();

    const [publishCommand] = createStudioPublishingCommands({
      getCurrentEditorAst: () => ({ scene: { name: 'FactoryBot' }, nodes: [{ id: 'arm' }] }),
      getSceneName: () => 'FactoryBot',
      getTemplateCategory: () => 'robotics',
      runTool,
      notify,
    });

    await publishCommand.action();

    expect(runTool).toHaveBeenCalledWith(
      'holomesh_publish_agent_template',
      expect.objectContaining({
        name: 'FactoryBot Studio Template',
        category: 'robotics',
      })
    );
    expect(runTool.mock.calls[0]?.[1]?.program).toContain('FactoryBot');
    expect(notify).toHaveBeenCalledWith('Publishing FactoryBot to the agent marketplace…', 'info');
    expect(notify).toHaveBeenCalledWith('Published FactoryBot to HoloMesh marketplace', 'success');
  });

  it('crossposts the current editor AST through the Moltbook tool', async () => {
    const runTool = vi.fn<
      (tool: StudioPublishToolName, input: Record<string, unknown>) => Promise<unknown>
    >().mockResolvedValue({ success: true });

    const commands = createStudioPublishingCommands({
      getCurrentEditorAst: () => ({ scene: { name: 'Orbital Dock' }, nodes: [{ id: 'dock-1' }] }),
      getSceneName: () => 'Orbital Dock',
      runTool,
    });

    await commands[1]?.action();

    expect(runTool).toHaveBeenCalledWith(
      'holomesh_moltbook_crosspost',
      expect.objectContaining({
        title: 'Orbital Dock — Studio AST Crosspost',
      })
    );
    expect(runTool.mock.calls[0]?.[1]?.description).toContain('Orbital Dock');
    expect(runTool.mock.calls[0]?.[1]?.description).toContain('dock-1');
  });
});