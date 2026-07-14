"""holoserve.tokenizer — native byte-BPE codec for HoloRunner S0 (HOLO) models.

Single source of truth for the byte-BPE tokenizer primitives that were previously
duplicated across the loose HoloServe scripts:

  - the constants (SPECIAL_COUNT / BYTE_BASE / MERGE_BASE) appeared byte-for-byte
    identical in both sample_holorunner_s0.py and holorunner_s0_ir_grammar.py, and
  - the merge-symbol -> raw-bytes logic was duplicated (`symbol_to_bytes` in the
    sampler, inlined again inside `build_token_bytes` in the grammar engine).

Factoring them here lets holoserve.sampler and holoserve.grammar share one codec so
the offline sampler and the constrained decoder can never drift.

Pure Python — NO torch, NO numpy. Importing this module (and holoserve.grammar,
which re-exports build_token_bytes from here) never requires the optional [model]
extra, so grammar/tokenizer work in a torch-free install.

Token-id layout (the S0 vocab): 6 specials + 256 raw bytes + N merges.
  SPECIAL_COUNT = 6     ids 0..5      special tokens (never decoded / never sampleable)
  BYTE_BASE     = 6     ids 6..261    raw byte value == id - BYTE_BASE
  MERGE_BASE    = 262   ids 262..     merge index == id - MERGE_BASE
"""

SPECIAL_COUNT = 6
BYTE_BASE = SPECIAL_COUNT
MERGE_BASE = BYTE_BASE + 256


def symbol_to_bytes(symbol):
    """Expand a merge symbol (e.g. "104+105" / "104,105") into its raw byte values."""
    out = []
    for part in str(symbol).split("+"):
        for piece in part.split(","):
            if piece != "":
                out.append(int(piece))
    return out


def split_words(text):
    # Mirrors JS split(/(\s+)/u): keep whitespace spans as tokenizable words.
    words = []
    current = ""
    current_is_space = None
    for char in text:
        is_space = char.isspace()
        if current and is_space != current_is_space:
            words.append(current)
            current = ""
        current += char
        current_is_space = is_space
    if current:
        words.append(current)
    return words


def apply_merges(word, merges):
    symbols = [str(b) for b in word.encode("utf-8")]
    for a, b, merged in merges:
        next_symbols = []
        index = 0
        while index < len(symbols):
            if index < len(symbols) - 1 and symbols[index] == a and symbols[index + 1] == b:
                next_symbols.append(merged)
                index += 2
            else:
                next_symbols.append(symbols[index])
                index += 1
        symbols = next_symbols
    return symbols


def encode_text(text, merges, merge_id):
    ids = []
    for word in split_words(text):
        for symbol in apply_merges(word, merges):
            if symbol in merge_id:
                ids.append(MERGE_BASE + merge_id[symbol])
            else:
                ids.append(BYTE_BASE + (int(symbol) & 0xFF))
    return ids


def decode_ids(ids, tokenizer):
    merges = tokenizer["merges"]
    raw = []
    for token_id in ids:
        token_id = int(token_id)
        if token_id in (0, 1, 2, 3, 4, 5):
            continue
        if BYTE_BASE <= token_id < MERGE_BASE:
            raw.append(token_id - BYTE_BASE)
        elif token_id >= MERGE_BASE:
            merge_index = token_id - MERGE_BASE
            if 0 <= merge_index < len(merges):
                raw.extend(symbol_to_bytes(merges[merge_index][2]))
    return bytes(raw).decode("utf-8", errors="replace")


def build_token_bytes(tokenizer, vocab_size):
    """token id -> byte string it decodes to (specials -> None: never sampleable under constraint)."""
    merges = tokenizer["merges"]
    table = [None] * vocab_size
    for token_id in range(BYTE_BASE, min(MERGE_BASE, vocab_size)):
        table[token_id] = bytes([token_id - BYTE_BASE])
    for index, merge in enumerate(merges):
        token_id = MERGE_BASE + index
        if token_id >= vocab_size:
            break
        table[token_id] = bytes(symbol_to_bytes(merge[2]))
    return table
