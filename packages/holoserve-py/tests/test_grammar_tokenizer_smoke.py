"""Torch-free structure/smoke tests for holoserve.

These exercise the pure-Python surfaces (grammar + tokenizer) that must import and
run WITHOUT the [model] extra. No torch, no checkpoint, no real tokenizer.json — a
synthetic all-single-byte vocab is enough to walk the byte-level grammars, because
every S0 IR grammar accepts only ASCII bytes.

The server/sampler/model/train modules require torch and are not imported here.
"""
import json
import random

import holoserve
import holoserve.grammar as gram
import holoserve.tokenizer as tok


def test_package_imports_without_torch():
    # `import holoserve` must never hard-fail: HoloModel is None when torch is absent.
    assert holoserve.__version__ == "0.1.0"
    assert hasattr(holoserve, "HoloModel")  # present as a name (may be None sans torch)


def test_tokenizer_constants():
    assert tok.SPECIAL_COUNT == 6
    assert tok.BYTE_BASE == 6
    assert tok.MERGE_BASE == 262
    # Re-exported through grammar for back-compat (holoserve.server reads them via gram).
    assert gram.SPECIAL_COUNT == tok.SPECIAL_COUNT
    assert gram.MERGE_BASE == tok.MERGE_BASE
    assert gram.build_token_bytes is tok.build_token_bytes


def test_grammars_registry():
    assert set(gram.GRAMMARS) == {
        "containment",
        "deontic",
        "composition",
        "containment-gap",
        "deontic-gap",
        "composition-gap",
    }


def test_tokenizer_ascii_roundtrip():
    # Empty merge table: every byte encodes to BYTE_BASE + byte, decode inverts it.
    tokenizer = {"merges": []}
    text = 'composition "'
    ids = tok.encode_text(text, [], {})
    assert ids == [tok.BYTE_BASE + b for b in text.encode("utf-8")]
    assert tok.decode_ids(ids, tokenizer) == text


def test_build_token_bytes_all_single_bytes():
    table = tok.build_token_bytes({"merges": []}, tok.MERGE_BASE)
    assert len(table) == tok.MERGE_BASE
    assert all(table[i] is None for i in range(tok.SPECIAL_COUNT))  # specials never sampleable
    assert table[tok.BYTE_BASE] == b"\x00"
    assert table[tok.MERGE_BASE - 1] == bytes([255])


def test_all_grammars_rollout_to_consumable_ir():
    # All 256 single-byte tokens suffice to walk any byte-level grammar; a random
    # rollout of every vertical must terminate in a valid, JSON-parseable IR.
    token_bytes = tok.build_token_bytes({"merges": []}, tok.MERGE_BASE)
    rng = random.Random(7)
    for vertical in gram.GRAMMARS:
        decoder = gram.ConstrainedIRDecoder(vertical, token_bytes)
        steps = 0
        while not decoder.done:
            allowed = decoder.allowed_tokens()
            assert allowed, f"{vertical}: dead end at step {steps}"
            decoder.push(allowed[rng.randrange(len(allowed))])
            steps += 1
            assert steps < 4000, f"{vertical}: runaway rollout"
        ir = json.loads(decoder.text())  # valid, consumable JSON by construction
        assert isinstance(ir, dict) and ir.get("schema")
        if vertical.endswith("-gap"):
            assert ir["schema"] == "uaal.gap-ir.v0"
            assert ir["status"] in ("resolved", "unresolvable")


def test_nfa_literal_and_enum():
    # Direct NFA smoke: a literal match walks to its end; an off-alphabet byte dead-ends.
    builder = gram.NfaBuilder()
    start, end = builder.lit("hi")
    nfa = gram.Nfa(builder, start, end)
    assert nfa.end in nfa.walk(nfa.start_frontier, b"hi")
    assert not nfa.walk(nfa.start_frontier, b"ho")
