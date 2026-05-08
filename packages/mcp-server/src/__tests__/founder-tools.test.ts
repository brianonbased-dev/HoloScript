import { describe, expect, it } from 'vitest';
import { tools } from '../tools';
import { handleFounderTool } from '../founder-handler';

describe('holo_founder', () => {
  it('registers the tool definition in the public tool list', () => {
    const tool = tools.find((t) => t.name === 'holo_founder');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema?.properties?.question).toBeDefined();
    expect(tool?.inputSchema?.properties?.context).toBeDefined();
    expect(tool?.inputSchema?.properties?.mode).toBeDefined();
    expect(tool?.inputSchema?.properties?.explain).toBeDefined();
  });

  it('returns a founder-default ruling for "which repo"', async () => {
    const result = await handleFounderTool({
      question: 'Which repo does this go in?',
    });

    expect(result.rulings).toHaveLength(1);
    expect(result.rulings[0].layer).toBe('founder-default');
    expect(result.rulings[0].ruling).toContain('HoloScript');
    expect(result.meta.questions).toEqual(['Which repo does this go in?']);
    expect(result.meta.mode).toBe('single');
  });

  it('returns a bandaid refusal ruling', async () => {
    const result = await handleFounderTool({
      question: 'Can I use a quick fix for now?',
    });

    expect(result.rulings).toHaveLength(1);
    expect(result.rulings[0].layer).toBe('founder-default');
    expect(result.rulings[0].ruling).toContain('Refuse the bandaid');
  });

  it('returns a vision pillar ruling for simulation-first', async () => {
    const result = await handleFounderTool({
      question: 'Does this feature need simulation-first validation?',
    });

    expect(result.rulings).toHaveLength(1);
    expect(result.rulings[0].layer).toBe('GOLD');
    expect(result.rulings[0].ruling).toContain('simulation-first');
  });

  it('supports batch mode', async () => {
    const result = await handleFounderTool({
      question: 'Which repo? // Should I commit now?',
      mode: 'batch',
    });

    expect(result.rulings).toHaveLength(2);
    expect(result.meta.mode).toBe('batch');
    expect(result.meta.questions).toHaveLength(2);
  });

  it('explain mode includes dynamic notes', async () => {
    const result = await handleFounderTool({
      question: 'git add -A or explicit paths?',
      explain: true,
    });

    expect(result.rulings[0].dynamic).toBeDefined();
    expect(result.rulings[0].dynamic).toContain('gold=');
  });

  it('throws on empty question', async () => {
    await expect(handleFounderTool({ question: '' })).rejects.toThrow(
      'holo_founder: question is required'
    );
  });

  it('returns judgment fallback for novel questions', async () => {
    const result = await handleFounderTool({
      question: 'Should we acquire a satellite constellation?',
    });

    expect(result.rulings).toHaveLength(1);
    expect(result.rulings[0].layer).toBe('judgment');
    expect(result.rulings[0].action).toContain('document');
  });
});
