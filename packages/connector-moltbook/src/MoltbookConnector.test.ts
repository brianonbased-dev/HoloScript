import { describe, expect, it } from 'vitest';
import { MoltbookConnector } from './MoltbookConnector.js';

describe('MoltbookConnector', () => {
  it('stays offline without MOLTBOOK_API_KEY and rejects tool execution', async () => {
    const previous = process.env.MOLTBOOK_API_KEY;
    delete process.env.MOLTBOOK_API_KEY;

    const connector = new MoltbookConnector();
    await connector.connect();

    await expect(connector.health()).resolves.toBe(false);
    await expect(connector.executeTool('moltbook_home', {})).rejects.toThrow(
      'MoltbookConnector is not connected.'
    );

    await connector.disconnect();

    if (previous) process.env.MOLTBOOK_API_KEY = previous;
  });
});
