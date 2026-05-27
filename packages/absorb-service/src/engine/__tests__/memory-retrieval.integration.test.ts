import { describe, it, expect } from 'vitest';
import { HoloAdapter } from '../adapters/HoloAdapter';
import { EmbeddingIndex } from '../EmbeddingIndex';
import { HoloEmbedProvider } from '../providers/HoloEmbedProvider';

/**
 * End-to-end proof of the HoloEmbed memory-retrieval fix (local, no MCP/deploy).
 *
 * Chain under test:
 *   HoloAdapter.extractSymbols (now folds @label/@note prose into docComment)
 *     → EmbeddingIndex.symbolToText (folds docComment into embedded text)
 *       → HoloEmbedProvider (trigram embedding of that text)
 *         → search() ranking
 *
 * BEFORE the fix, the original 3-query spike against the deployed MCP ranked an
 * irrelevant memory #1 on all queries (body text never reached the embedder).
 * This asserts each query now ranks its OWN memory #1.
 */

function fakeTree(ast: unknown) {
  return {
    rootNode: {} as never,
    __holoSource: '',
    __holoAST: ast,
    __holoErrors: [],
    __holoPartial: false,
  } as never;
}

// One MemoryStore composition holding three memories, each carrying its prose
// in @label/@note trait args — exactly how a .holo memory file is shaped.
const memoryAst = {
  type: 'Composition',
  name: 'MemoryStore',
  templates: [],
  spatialGroups: [],
  lights: [],
  imports: [],
  objects: [
    {
      type: 'Object',
      name: 'developers-won-by-value',
      children: [],
      traits: [
        { type: 'ObjectTrait', name: 'label', config: { text: 'human developers are won by verifiable value not anti-dev voice; their skepticism is temporary' } },
        { type: 'ObjectTrait', name: 'note', config: { body: 'never write documentation that dismisses or talks down to programmers' } },
      ],
    },
    {
      type: 'Object',
      name: 'key-handling',
      children: [],
      traits: [
        { type: 'ObjectTrait', name: 'label', config: { text: 'never hardcode API keys or credentials or secrets in source code' } },
        { type: 'ObjectTrait', name: 'note', config: { body: 'keys leaked twice; use a dotenv file and a pre-commit guard to prevent leaking secrets' } },
      ],
    },
    {
      type: 'Object',
      name: 'locked-out-creator',
      children: [],
      traits: [
        { type: 'ObjectTrait', name: 'label', config: { text: 'the focused target user cannot code cannot fund a team and will not accept platforms taking the upside' } },
        { type: 'ObjectTrait', name: 'note', config: { body: 'the creator describes what they want, the system builds it, the creator owns it' } },
      ],
    },
  ],
};

describe('HoloEmbed memory retrieval (end-to-end, post-fix)', () => {
  async function buildIndex() {
    const adapter = new HoloAdapter();
    const symbols = adapter.extractSymbols(fakeTree(memoryAst), 'memories/store.holo');
    const index = new EmbeddingIndex({ provider: new HoloEmbedProvider(), useWorkers: false });
    await index.addSymbols(symbols);
    return index;
  }

  it('captured the memory prose into docComment (the fix)', () => {
    const adapter = new HoloAdapter();
    const symbols = adapter.extractSymbols(fakeTree(memoryAst), 'memories/store.holo');
    const keyMem = symbols.find((s) => s.name === 'key-handling');
    expect(keyMem?.docComment).toContain('API keys');
    expect(keyMem?.docComment).toContain('pre-commit guard');
  });

  it('ranks the dev-voice memory #1 for a dev-voice query', async () => {
    const index = await buildIndex();
    const results = await index.search('should I write developer docs that dismiss or talk down to programmers', 5);
    expect(results[0]?.symbol.name).toBe('developers-won-by-value');
  });

  // Was a known gap: the structural base (dims 0-383) swamped the content
  // signal so this query mis-ranked. Fixed by STRUCTURAL_WEIGHT downweighting
  // in HoloEmbedProvider (measured to hold Paper 26 Table 2 recall).
  it('ranks the key-handling memory #1 for a credentials query', async () => {
    const index = await buildIndex();
    const results = await index.search('how do I store API keys and secret credentials safely without leaking them', 5);
    expect(results[0]?.symbol.name).toBe('key-handling');
  });

  it('ranks the locked-out-creator memory #1 for a target-user query', async () => {
    const index = await buildIndex();
    const results = await index.search('who is our focused target user that cannot code', 5);
    expect(results[0]?.symbol.name).toBe('locked-out-creator');
  });
});
