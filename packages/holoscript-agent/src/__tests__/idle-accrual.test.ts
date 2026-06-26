import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeIdleAccrual, type EvolutionModule } from '../idle-accrual.js';

// In-memory fs seam — proves the read→dedup→append orchestration without touching disk.
function memFs() {
  const store: Record<string, string> = {};
  return {
    store,
    read: (p: string) => {
      if (p in store) return store[p];
      throw new Error('ENOENT');
    },
    append: (p: string, c: string) => {
      store[p] = (store[p] ?? '') + c;
    },
    mkdirp: () => {
      /* no-op in memory */
    },
  };
}

// Fake @holoscript/core/evolution — mimics the real contract (accrueOneStep emits graded
// rows; dedupRows is keyed on row.target). Lets us unit-test idle-accrual's orchestration
// without installing core or hitting an Ollama endpoint.
function fakeModule(rows: Array<{ target: string; [k: string]: unknown }>): EvolutionModule {
  return {
    makeOllamaProposer: () => 'PROPOSER_FN',
    accrueOneStep: async ({ agentId, tick }) => ({
      target: 'companion-trait',
      rows: rows.map((r) => ({ ...r, agentId, tick })),
    }),
    dedupRows: (existing, rs) => {
      const seen = new Set(
        existing
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l).target as string),
      );
      const fresh = rs.filter((r) => !seen.has(r.target));
      return { fresh, deduped: rs.length - fresh.length };
    },
  };
}

const ENV_KEYS = [
  'HOLOSCRIPT_AGENT_EVOLVE_ACCRUAL',
  'HOLOSCRIPT_AGENT_EVOLVE_CORPUS',
  'HOLOSCRIPT_AGENT_EVOLVE_OLLAMA_URL',
  'HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL',
  'HOLOSCRIPT_AGENT_EVOLVE_MODEL',
  'HOLOSCRIPT_AGENT_LOCAL_LLM_MODEL',
];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const CORPUS = '/virtual/evolve-corpus/agent-accrual.jsonl';

describe('makeIdleAccrual — default-OFF gating', () => {
  it('returns undefined when the accrual flag is unset (zero regression default)', async () => {
    const accrual = await makeIdleAccrual({ handle: 'a', _module: fakeModule([]), _fs: memFs() });
    expect(accrual).toBeUndefined();
  });

  it('returns undefined when the corpus path is unset (second default-off latch)', async () => {
    process.env.HOLOSCRIPT_AGENT_EVOLVE_ACCRUAL = '1';
    const accrual = await makeIdleAccrual({ handle: 'a', _module: fakeModule([]), _fs: memFs() });
    expect(accrual).toBeUndefined();
  });

  it('returns undefined when no sovereign-local endpoint resolves (no localhost default)', async () => {
    process.env.HOLOSCRIPT_AGENT_EVOLVE_ACCRUAL = '1';
    process.env.HOLOSCRIPT_AGENT_EVOLVE_CORPUS = CORPUS;
    const accrual = await makeIdleAccrual({ handle: 'a', _module: fakeModule([]), _fs: memFs() });
    expect(accrual).toBeUndefined();
  });
});

describe('makeIdleAccrual — enabled orchestration', () => {
  beforeEach(() => {
    process.env.HOLOSCRIPT_AGENT_EVOLVE_ACCRUAL = '1';
    process.env.HOLOSCRIPT_AGENT_EVOLVE_CORPUS = CORPUS;
    process.env.HOLOSCRIPT_AGENT_EVOLVE_OLLAMA_URL = 'http://holojetson.local:11434';
  });

  it('accrues a fresh gated row into an empty corpus and appends it', async () => {
    const fs = memFs();
    const accrual = await makeIdleAccrual({
      handle: 'jetson-orin-super',
      _module: fakeModule([{ target: 'CANDIDATE_A', grader: { passed: true } }]),
      _fs: fs,
    });
    expect(accrual).toBeDefined();
    const r = await accrual!({ tick: 1, agentId: 'jetson-orin-super' });
    expect(r).toEqual({ target: 'companion-trait', written: 1, deduped: 0, outcome: 'accrued' });
    const lines = fs.store[CORPUS].trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).target).toBe('CANDIDATE_A');
  });

  it('cross-run dedups against the existing corpus (re-run accrues nothing)', async () => {
    const fs = memFs();
    fs.store[CORPUS] = JSON.stringify({ target: 'CANDIDATE_A', grader: { passed: true } }) + '\n';
    const accrual = await makeIdleAccrual({
      handle: 'a',
      _module: fakeModule([{ target: 'CANDIDATE_A', grader: { passed: true } }]),
      _fs: fs,
    });
    const r = await accrual!({ tick: 2, agentId: 'a' });
    expect(r).toEqual({ target: 'companion-trait', written: 0, deduped: 1, outcome: 'all-dup' });
    // No new line appended — corpus unchanged.
    expect(fs.store[CORPUS].trim().split('\n')).toHaveLength(1);
  });

  it('reports no-candidate when the proposer yields no gated rows', async () => {
    const fs = memFs();
    const accrual = await makeIdleAccrual({ handle: 'a', _module: fakeModule([]), _fs: fs });
    const r = await accrual!({ tick: 3, agentId: 'a' });
    expect(r).toEqual({ target: 'companion-trait', written: 0, deduped: 0, outcome: 'no-candidate' });
    expect(fs.store[CORPUS]).toBeUndefined();
  });
});
