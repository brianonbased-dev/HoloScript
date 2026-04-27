/**
 * TimezoneTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { timezoneHandler } from '../TimezoneTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __tzState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { default_tz: 'UTC' };

describe('TimezoneTrait', () => {
  it('has name "timezone"', () => {
    expect(timezoneHandler.name).toBe('timezone');
  });

  it('tz:set emits tz:changed', () => {
    const node = makeNode();
    timezoneHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    timezoneHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'tz:set', timezone: 'America/New_York',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('tz:changed', { timezone: 'America/New_York' });
  });
});
