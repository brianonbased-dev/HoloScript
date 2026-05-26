import { describe, expect, it } from 'vitest';
import { holomeshAgentSharedAgendaTrait } from '../brain.js';
import { hololandNpcSharedAgendaTrait } from '../../../hololand-platform/src/npc/jepa-npc-controller.js';
import { uaalSharedAgendaTrait } from '../../../uaal/src/index.js';

describe('shared trait library population entry points', () => {
  it('resolves the representative D.040 trait to one shared module instance', () => {
    expect(holomeshAgentSharedAgendaTrait).toBe(hololandNpcSharedAgendaTrait);
    expect(holomeshAgentSharedAgendaTrait).toBe(uaalSharedAgendaTrait);
  });
});
