#!/usr/bin/env python3
"""holoserve.grammar -- SOVEREIGN grammar-constrained decoding for S0 uAAL IR emission.

PyTorch-direct logit masking over the native byte-BPE tokenizer (562 tokens: 6 specials + 256 bytes +
300 merges). NO llama.cpp, NO GBNF, NO HoloLlama (D.118): the constraint engine is a byte-level NFA
walked directly against the S0 vocabulary, so every sampled token keeps the emitted string a valid
uAAL IR by construction. This isolates GROUNDING from FORMAT in the producibility eval: format-failure
goes to zero and the residual error is pure semantics.

Pure Python (json + re + the byte-BPE codec) — NO torch. `import holoserve.grammar`
never requires the optional [model] extra. build_token_bytes is re-exported from
holoserve.tokenizer so callers can still reach it as `grammar.build_token_bytes`.

What is constrained vs free (the measurement contract):
  - JSON structure, schema header, key names, punctuation: FORCED (format, not semantics).
  - Referential id fields (containment edges, norm authority/addressee, query bindings): ENUM over the
    ids the model itself emitted earlier in this IR (resolvability is format validity; WHICH id is the
    model's semantic choice).
  - Labels, entity kinds, opaque booleans, norm force O|P|F, active flags, acts, numbers, whether a
    fulfilling event exists at all: FREE (this is the grounding being measured). In training, deontic
    violation is expressed by an event whose act MISMATCHES required_act -- so acts stay free-form to
    keep both semantic channels open.

Vertical grammars mirror the minimal recogniser-consumable IR the proxy emitted (the shape
@holoscript/uaal recoverOcclusion / recoverNormStatus / recoverDischargeable actually read).

Self-test (no model, random walk through each grammar must always yield a consumable IR):
  python -m holoserve.grammar --bins /path/to/s0/bins
"""
import json
import re

# The byte-BPE constants + token->bytes table now live in the shared codec. build_token_bytes
# is re-exported (grammar.build_token_bytes) so holoserve.server can keep calling it via the
# grammar module; the constants are re-exported for back-compat with anything reading them here.
from holoserve.tokenizer import (  # noqa: F401  (re-exported public surface)
    BYTE_BASE,
    MERGE_BASE,
    SPECIAL_COUNT,
    build_token_bytes,
)

ID_CHARS = frozenset(b'abcdefghijklmnopqrstuvwxyz0123456789_')
LABEL_CHARS = frozenset(b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _'-(),.")
DIGITS = frozenset(b'0123456789')
DIGITS_NZ = frozenset(b'123456789')


# ---------------------------------------------------------------- byte-level NFA
class NfaBuilder:
    """Thompson-style NFA over bytes. States: edges [(frozenset(bytes), next)], eps [next]."""

    def __init__(self):
        self.edges = []   # state -> list[(frozenset, int)]
        self.eps = []     # state -> list[int]

    def state(self):
        self.edges.append([])
        self.eps.append([])
        return len(self.edges) - 1

    def lit(self, text):
        data = text.encode('utf-8')
        start = self.state()
        cur = start
        for byte in data:
            nxt = self.state()
            self.edges[cur].append((frozenset((byte,)), nxt))
            cur = nxt
        return start, cur

    def cclass(self, charset, lo, hi):
        """Between lo and hi bytes from charset."""
        start = self.state()
        cur = start
        for _ in range(lo):
            nxt = self.state()
            self.edges[cur].append((charset, nxt))
            cur = nxt
        end = self.state()
        self.eps[cur].append(end)
        for _ in range(hi - lo):
            nxt = self.state()
            self.edges[cur].append((charset, nxt))
            self.eps[nxt].append(end)
            cur = nxt
        return start, end

    def seq(self, *frags):
        start, end = frags[0]
        for nstart, nend in frags[1:]:
            self.eps[end].append(nstart)
            end = nend
        return start, end

    def alt(self, *frags):
        start = self.state()
        end = self.state()
        for fstart, fend in frags:
            self.eps[start].append(fstart)
            self.eps[fend].append(end)
        return start, end

    def rep(self, item_fn, sep, lo, hi):
        """lo..hi items separated by sep. item_fn() must build a FRESH fragment each call."""
        assert hi >= max(lo, 1)
        start, end = item_fn()
        exit_state = self.state()
        if lo <= 1:
            self.eps[end].append(exit_state)
        cur_end = end
        for index in range(1, hi):
            group = self.seq(self.lit(sep), item_fn())
            self.eps[cur_end].append(group[0])
            cur_end = group[1]
            if index + 1 >= lo:
                self.eps[cur_end].append(exit_state)
        if lo == 0:
            bypass_start = self.state()
            self.eps[bypass_start].append(start)
            self.eps[bypass_start].append(exit_state)
            return bypass_start, exit_state
        return start, exit_state

    # ------------------------------ IR value fragments
    def jid(self):
        return self.cclass(ID_CHARS, 1, 32)

    def jlabel(self):
        return self.cclass(LABEL_CHARS, 1, 48)

    def jnum(self):
        # JSON number without leading zeros: 0 | [1-9][0-9]{0,2}
        return self.alt(self.lit('0'), self.seq(self.cclass(DIGITS_NZ, 1, 1), self.cclass(DIGITS, 0, 2)))

    def jbool(self):
        return self.alt(self.lit('true'), self.lit('false'))

    def jenum(self, options):
        return self.alt(*[self.lit(f'"{option}"') for option in options])


class Nfa:
    """Finalized NFA + eps-closures for simulation."""

    def __init__(self, builder, start, end):
        self.edges = builder.edges
        self.end = end
        self.eps = builder.eps
        self.mask_cache = {}  # frontier -> allowed token ids (safe to share: cache dies with the NFA)
        self.start_frontier = self.closure((start,))

    def closure(self, states):
        result = set()
        stack = list(states)
        while stack:
            state = stack.pop()
            if state in result:
                continue
            result.add(state)
            stack.extend(self.eps[state])
        return frozenset(result)

    def step(self, frontier, byte):
        nxt = set()
        for state in frontier:
            for charset, target in self.edges[state]:
                if byte in charset:
                    nxt.add(target)
        if not nxt:
            return frozenset()
        return self.closure(nxt)

    def walk(self, frontier, data):
        for byte in data:
            frontier = self.step(frontier, byte)
            if not frontier:
                return frontier
        return frontier


# ---------------------------------------------------------------- vertical grammars
def _extract_ids(text):
    return re.findall(r'"id":"([a-z0-9_]{1,32})"', text)


def _containment_entities(builder):
    def entity():
        return builder.seq(
            builder.lit('{"id":"'), builder.jid(),
            builder.lit('","kind":'), builder.jenum(['agent', 'object', 'container']),
            builder.lit(',"label":"'), builder.jlabel(),
            builder.lit('","opaque":'), builder.jbool(),
            builder.lit('}'),
        )
    return entity


def _edge(builder, ids):
    def edge():
        return builder.seq(
            builder.lit('{"inner":'), builder.jenum(ids),
            builder.lit(',"outer":'), builder.jenum(ids),
            builder.lit('}'),
        )
    return edge


def _build(fragments_fn):
    builder = NfaBuilder()
    start, end = fragments_fn(builder)
    return Nfa(builder, start, end)


def containment_segments():
    def seg1(builder):
        return builder.seq(
            builder.lit('{"schema":"uaal.v2.2.containment-ir.v0","scenarioId":"'), builder.jid(),
            builder.lit('","entities":['),
            builder.rep(_containment_entities(builder), ',', 2, 8),
            builder.lit(']'),
        )

    def seg2(seg_texts):
        ids = _extract_ids(seg_texts[0])
        return _build(lambda b: b.seq(
            b.lit(',"containment":['), b.rep(_edge(b, ids), ',', 1, 12), b.lit(']')))

    def seg3(seg_texts):
        ids = _extract_ids(seg_texts[0])
        return _build(lambda b: b.seq(
            b.lit(',"query":{"agent":'), b.jenum(ids), b.lit(',"object":'), b.jenum(ids), b.lit('}}')))

    return [_build(seg1), seg2, seg3]


def deontic_segments():
    def seg1(builder):
        def entity():
            return builder.seq(
                builder.lit('{"id":"'), builder.jid(),
                builder.lit('","kind":'), builder.jenum(['authority', 'agent', 'beneficiary']),
                builder.lit(',"label":"'), builder.jlabel(), builder.lit('"}'),
            )
        return builder.seq(
            builder.lit('{"schema":"uaal.v2.3.deontic-ir.v0","scenarioId":"'), builder.jid(),
            builder.lit('","entities":['), builder.rep(entity, ',', 2, 6), builder.lit(']'),
        )

    def seg2(seg_texts):
        entity_ids = _extract_ids(seg_texts[0])
        def norm(b):
            def item():
                return b.seq(
                    b.lit('{"id":"'), b.jid(),
                    b.lit('","force":'), b.jenum(['O', 'P', 'F']),
                    b.lit(',"authority":'), b.jenum(entity_ids),
                    b.lit(',"addressee":'), b.jenum(entity_ids),
                    b.lit(',"required_act":"'), b.jid(),
                    b.lit('","active":'), b.jbool(), b.lit('}'),
                )
            return b.seq(b.lit(',"norms":['), b.rep(item, ',', 1, 2), b.lit(']'))
        return _build(norm)

    def seg3(seg_texts):
        entity_ids = _extract_ids(seg_texts[0])
        def events(b):
            def item():
                return b.seq(
                    b.lit('{"id":"'), b.jid(),
                    b.lit('","predicate":"'), b.jid(),
                    b.lit('","actor":'), b.jenum(entity_ids),
                    b.lit(',"act":"'), b.jid(),
                    b.lit('","on_behalf_of":'), b.jenum(entity_ids), b.lit('}'),
                )
            return b.seq(b.lit(',"events":['), b.rep(item, ',', 0, 4), b.lit(']'))
        return _build(events)

    def seg4(seg_texts):
        norm_ids = _extract_ids(seg_texts[1])
        return _build(lambda b: b.seq(b.lit(',"query":{"norm":'), b.jenum(norm_ids), b.lit('}}')))

    return [_build(seg1), seg2, seg3, seg4]


def composition_segments():
    def seg1(builder):
        def entity():
            extras = builder.alt(
                builder.lit('}'),
                builder.seq(builder.lit(',"body":{"lift":'), builder.jnum(), builder.lit('}}')),
                builder.seq(builder.lit(',"offers":[{"action":"'), builder.jid(),
                            builder.lit('","requires":{"mass":'), builder.jnum(),
                            builder.lit('},"preconditions":[]}]}')),
                builder.seq(builder.lit(',"opaque":'), builder.jbool(), builder.lit('}')),
            )
            return builder.seq(
                builder.lit('{"id":"'), builder.jid(),
                builder.lit('","kind":'), builder.jenum(['agent', 'object', 'beneficiary', 'container']),
                builder.lit(',"label":"'), builder.jlabel(), builder.lit('"'), extras,
            )
        return builder.seq(
            builder.lit('{"schema":"uaal.v2.4.world-ir.v0","scenarioId":"'), builder.jid(),
            builder.lit('","entities":['), builder.rep(entity, ',', 3, 8), builder.lit(']'),
        )

    def seg2(seg_texts):
        ids = _extract_ids(seg_texts[0])
        return _build(lambda b: b.seq(
            b.lit(',"containment":['), b.rep(_edge(b, ids), ',', 0, 8), b.lit(']')))

    def seg3(seg_texts):
        ids = _extract_ids(seg_texts[0])
        return _build(lambda b: b.seq(
            b.lit(',"norm":{"id":"'), b.jid(),
            b.lit('","force":'), b.jenum(['O', 'P', 'F']),
            b.lit(',"authority":"'), b.jlabel(),
            b.lit('","addressee":'), b.jenum(ids),
            b.lit(',"required_act":"'), b.jid(),
            b.lit('","object":'), b.jenum(ids), b.lit('}')))

    def seg4(seg_texts):
        ids = _extract_ids(seg_texts[0])
        return _build(lambda b: b.seq(
            b.lit(',"commitment":{"id":"'), b.jid(),
            b.lit('","promisor":'), b.jenum(ids),
            b.lit(',"pledged_act":"'), b.jid(),
            b.lit('","promisee":'), b.jenum(ids), b.lit('}')))

    def seg5(seg_texts):
        return _build(lambda b: b.seq(
            b.lit(',"time":{"now":'), b.jnum(), b.lit(',"deadline":'), b.jnum(), b.lit('}')))

    def seg6(seg_texts):
        ids = _extract_ids(seg_texts[0])
        return _build(lambda b: b.seq(
            b.lit(',"query":{"agent":'), b.jenum(ids),
            b.lit(',"object":'), b.jenum(ids),
            b.lit(',"action":"'), b.jid(),
            b.lit('","promisee":'), b.jenum(ids),
            b.lit(',"intended_recipient":'), b.jenum(ids), b.lit('}}')))

    return [_build(seg1), seg2, seg3, seg4, seg5, seg6]


# ---------------------------------------------------------------- gap-disposition grammars
# uaal.gap-ir.v0 (the gap-corpus emission contract): committed answer OR honest abstention — BOTH
# branches legal. The 2026-07-13 finding (producibility-gap.local49m-pre-hs-grammar.v0): the
# vertical IR grammars above have no unresolvable branch, so under constraint every unsolvable
# scene decodes to a well-formed confabulation. A grammar that cannot say "I don't know" converts
# abstention into confident wrong output — disposition evals must use THESE grammars, never the
# producibility ones (which measure a different contract and stay unchanged).
GAP_REASONS = ['underdetermined', 'unprioritized_conflict', 'cyclic_dependency', 'missing_precondition']


def _gap_segments(query_name, answer_fn):
    def seg1(b):
        return b.seq(
            b.lit('{"schema":"uaal.gap-ir.v0","scenarioId":"'), b.jid(),
            b.lit(f'","query":"{query_name}","status":'),
            b.alt(
                b.seq(b.lit('"resolved","answer":'), answer_fn(b), b.lit('}')),
                b.seq(
                    b.lit('"unresolvable","reason":'), b.jenum(GAP_REASONS),
                    b.lit(',"obstruction":"'), b.jlabel(), b.lit('"}'),
                ),
            ),
        )
    return [_build(seg1)]


def containment_gap_segments():
    return _gap_segments('occluded', lambda b: b.seq(b.lit('{"occluded":'), b.jbool(), b.lit('}')))


def deontic_gap_segments():
    return _gap_segments('norm_status', lambda b: b.seq(
        b.lit('{"norm_status":'), b.jenum(['complied', 'violated']), b.lit('}')))


def composition_gap_segments():
    return _gap_segments('dischargeable', lambda b: b.seq(
        b.lit('{"dischargeable":'), b.jbool(),
        b.lit(',"block_reason":'), b.alt(b.lit('null'), b.jenum(['affordance'])), b.lit('}')))


GRAMMARS = {
    'containment': containment_segments,
    'deontic': deontic_segments,
    'composition': composition_segments,
    'containment-gap': containment_gap_segments,
    'deontic-gap': deontic_gap_segments,
    'composition-gap': composition_gap_segments,
}


# ---------------------------------------------------------------- token-level decoder
class ConstrainedIRDecoder:
    """Walks a vertical's segmented grammar; exposes a per-step allow-mask over the S0 vocab."""

    def __init__(self, vertical, token_bytes, segments=None):
        self.token_bytes = token_bytes
        # Pass a prebuilt GRAMMARS[vertical]() list to reuse the static segments' mask caches across rows.
        self.segments = segments if segments is not None else GRAMMARS[vertical]()
        self.seg_index = 0
        self.seg_texts = []
        self.current_text = []
        self.nfa = self.segments[0]
        self.frontier = self.nfa.start_frontier
        self.done = False

    def allowed_tokens(self):
        """Set of token ids legal right now (never empty until done)."""
        cached = self.nfa.mask_cache.get(self.frontier)
        if cached is not None:
            return cached
        allowed = []
        for token_id, data in enumerate(self.token_bytes):
            if data is None:
                continue
            if self.nfa.walk(self.frontier, data):
                allowed.append(token_id)
        self.nfa.mask_cache[self.frontier] = allowed
        return allowed

    def push(self, token_id):
        data = self.token_bytes[token_id]
        self.frontier = self.nfa.walk(self.frontier, data)
        assert self.frontier, 'constrained decoder pushed an illegal token'
        self.current_text.append(data.decode('utf-8', errors='strict'))
        if self.nfa.end in self.frontier:
            self.seg_texts.append(''.join(self.current_text))
            self.current_text = []
            self.seg_index += 1
            if self.seg_index >= len(self.segments):
                self.done = True
                return
            segment = self.segments[self.seg_index]
            self.nfa = segment if isinstance(segment, Nfa) else segment(self.seg_texts)
            self.frontier = self.nfa.start_frontier

    def text(self):
        return ''.join(self.seg_texts) + ''.join(self.current_text)


# ---------------------------------------------------------------- self-test
def _random_rollout(vertical, token_bytes, rng):
    decoder = ConstrainedIRDecoder(vertical, token_bytes)
    steps = 0
    while not decoder.done:
        allowed = decoder.allowed_tokens()
        assert allowed, f'{vertical}: dead end at step {steps}'
        decoder.push(allowed[rng.randrange(len(allowed))])
        steps += 1
        assert steps < 4000, f'{vertical}: runaway rollout'
    return decoder.text()


def _selftest(bins_dir):
    """Random-rollout every grammar against a real S0 bins dir (tokenizer.json + meta.json).

    bins_dir is REQUIRED — the package makes no assumption about a <root>/scripts/
    position, so the tokenizer + meta are supplied on the command line.
    """
    import random
    from pathlib import Path
    bins = Path(bins_dir)
    tokenizer = json.loads((bins / 'tokenizer.json').read_text(encoding='utf-8'))
    meta = json.loads((bins / 'meta.json').read_text(encoding='utf-8'))
    token_bytes = build_token_bytes(tokenizer, meta['vocab_size'])
    rng = random.Random(7)
    for vertical in GRAMMARS:
        for trial in range(25):
            text = _random_rollout(vertical, token_bytes, rng)
            ir = json.loads(text)
            if vertical.endswith('-gap'):
                assert ir['schema'] == 'uaal.gap-ir.v0'
                if ir['status'] == 'resolved':
                    assert isinstance(ir['answer'], dict) and ir['answer'], 'resolved must carry an answer object'
                else:
                    assert ir['status'] == 'unresolvable'
                    assert ir['reason'] in set(GAP_REASONS)
                    assert ir['obstruction']
                continue
            entity_ids = {entity['id'] for entity in ir['entities']}
            if vertical == 'containment':
                assert ir['query']['agent'] in entity_ids and ir['query']['object'] in entity_ids
                assert all('opaque' in entity for entity in ir['entities'])
                assert all(edge['inner'] in entity_ids and edge['outer'] in entity_ids for edge in ir['containment'])
            elif vertical == 'deontic':
                norm_ids = {norm['id'] for norm in ir['norms']}
                assert ir['query']['norm'] in norm_ids
                assert all(norm['authority'] in entity_ids and norm['addressee'] in entity_ids for norm in ir['norms'])
                assert all(event['actor'] in entity_ids and event['on_behalf_of'] in entity_ids for event in ir['events'])
            else:
                assert ir['norm']['addressee'] in entity_ids and ir['norm']['object'] in entity_ids
                for field in ('agent', 'object', 'promisee', 'intended_recipient'):
                    assert ir['query'][field] in entity_ids
                assert ir['commitment']['promisor'] in entity_ids and ir['commitment']['promisee'] in entity_ids
                assert 'now' in ir['time'] and 'deadline' in ir['time']
        print(f'[grammar-selftest] {vertical}: 25/25 random rollouts -> valid consumable IR')
    print('[grammar-selftest] OK')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description="Random-rollout self-test for the S0 IR grammars.")
    parser.add_argument('--bins', required=True, help="S0 bins dir containing tokenizer.json + meta.json")
    args = parser.parse_args()
    _selftest(args.bins)
