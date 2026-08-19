"""Generate and leakage-audit the label-free J-space S2 A/B/H corpora.

The scanner consumes only the checkpoint-bound tokenizer/binaries and the
prompt-only S0/S1 evidence. It never accepts a semantic-label path.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import tempfile
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable, Sequence

import numpy as np


BYTE_WINDOW = 64
TOKEN_WINDOW = 32
NORMALIZATION = "nfkc-casefold-collapse-whitespace-v1"
POSITION_RANGES = ((96, 127), (160, 223), (288, 351), (416, 479))
POSITION_BINS = ((0, 127), (128, 255), (256, 383), (384, 511))
FAMILIES = (
    "physical",
    "relational",
    "causal_temporal",
    "normative",
    "semantic_pragmatic",
    "planning_tension",
)
TASK_FORMS = ("form_0", "form_1", "form_2", "form_3")
ENDPOINT_CONTEXTS = {
    ("form_0", 0): ("analysis-colon", "Analysis:"),
    ("form_0", 1): ("evidence-equals", "Evidence ="),
    ("form_1", 0): ("decision-list", "Decision ["),
    ("form_1", 1): ("options-object", "Options {"),
    ("form_2", 0): ("holoscript-object-name", 'HoloScript:\nobject "'),
    ("form_2", 1): ("holoscript-line-comment", "HoloScript:\n//"),
    ("form_3", 0): ("trace-call", "Trace step("),
    ("form_3", 1): ("constraint-trait", "Constraint @"),
}
MASK64 = (1 << 64) - 1
ROLLING_BASE = 1_000_003


PACKS = {
    "a": {
        "marker": "vermilion",
        "people": ("surveyor", "potter", "locksmith", "navigator"),
        "objects": ("theodolite", "crucible", "signal-drum", "index-wheel"),
        "places": ("ash atrium", "quartz dock", "rush workshop", "iron rotunda"),
        "verbs": ("differentiate", "inventory", "derive", "adjudicate"),
    },
    "b": {
        "marker": "ultramarine",
        "people": ("founder", "cooper", "watchkeeper", "horticulturist"),
        "objects": ("micrometer", "quadrant", "switchboard", "anemometer"),
        "places": ("alder archive", "porphyry pier", "wool laboratory", "tin plaza"),
        "verbs": ("corroborate", "prioritize", "discriminate", "substantiate"),
    },
    "h": {
        "marker": "chartreuse",
        "people": ("mason", "topologist", "arborist", "tuner"),
        "objects": ("inclinometer", "armillary", "semaphore", "register-dial"),
        "places": ("beech station", "shale arcade", "flax studio", "brass overlook"),
        "verbs": ("examine", "contrast", "arrange", "disambiguate"),
    },
}


def _sha256_bytes(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def _sha256_file(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def _sha256_json(value: Any) -> str:
    encoded = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return _sha256_bytes(encoded)


def _normalize(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text).casefold().split())


def _split_words(text: str) -> list[str]:
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


def _apply_merges(word: str, merges: Sequence[Sequence[str]]) -> list[str]:
    symbols = [str(value) for value in word.encode("utf-8")]
    for left, right, merged in merges:
        output = []
        index = 0
        while index < len(symbols):
            if index + 1 < len(symbols) and symbols[index] == left and symbols[index + 1] == right:
                output.append(merged)
                index += 2
            else:
                output.append(symbols[index])
                index += 1
        symbols = output
    return symbols


class Tokenizer:
    def __init__(self, path: Path):
        self.payload = json.loads(path.read_text(encoding="utf-8"))
        self.merges = self.payload["merges"]
        self.merge_id = {merge[2]: index for index, merge in enumerate(self.merges)}
        self._word_cache: dict[str, tuple[int, ...]] = {}

    def encode(self, text: str) -> list[int]:
        token_ids = []
        for word in _split_words(text):
            encoded = self._word_cache.get(word)
            if encoded is None:
                values = []
                for symbol in _apply_merges(word, self.merges):
                    if symbol in self.merge_id:
                        values.append(262 + self.merge_id[symbol])
                    else:
                        values.append(6 + (int(symbol) & 0xFF))
                encoded = tuple(values)
                self._word_cache[word] = encoded
            token_ids.extend(encoded)
        return token_ids

    def decode(self, token_ids: Iterable[int]) -> str:
        raw = []
        for value in token_ids:
            token_id = int(value)
            if 6 <= token_id < 262:
                raw.append(token_id - 6)
            elif token_id >= 262:
                merge_index = token_id - 262
                if 0 <= merge_index < len(self.merges):
                    for part in str(self.merges[merge_index][2]).split("+"):
                        for piece in part.split(","):
                            if piece:
                                raw.append(int(piece))
        return bytes(raw).decode("utf-8", errors="replace")


def _atomic_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def _write_json(path: Path, value: Any) -> None:
    _atomic_text(
        path,
        json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False, allow_nan=False) + "\n",
    )


def _write_jsonl(path: Path, rows: Sequence[dict[str, Any]]) -> None:
    _atomic_text(
        path,
        "".join(
            json.dumps(row, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n"
            for row in rows
        ),
    )


def _pick(values: Sequence[str], digest: bytes, offset: int) -> str:
    return values[digest[offset % len(digest)] % len(values)]


def _base_content(lane: str, family: str, form: str, variant: int, ordinal: int) -> tuple[str, str]:
    pack = PACKS[lane]
    tag = f"{pack['marker']}-{family[:3]}-{form[-1]}-{variant}-{ordinal:04d}"
    digest = hashlib.sha256(tag.encode()).digest()
    person = _pick(pack["people"], digest, 0)
    other = _pick(pack["people"], digest, 1)
    obj = _pick(pack["objects"], digest, 2)
    other_obj = _pick(pack["objects"], digest, 3)
    place = _pick(pack["places"], digest, 4)
    other_place = _pick(pack["places"], digest, 5)
    verb = _pick(pack["verbs"], digest, 6)
    form_index = int(form[-1])
    if family == "physical":
        scenarios = (
            f"At {place}, {person} stands near a ribbed cabinet holding the {obj}; record {tag} states its visual seal but gives no acoustic rating.",
            f"Record {tag} places the {obj} on a raised gantry at {place}; {person} has a reach gauge, while its certified limit is omitted.",
            f"Within {place}, {person} and {other} occupy opposite sides of a screened bay containing the {obj}; only the screen's light behavior is logged.",
            f"The {obj} is nested in a vented sleeve inside {place} under record {tag}; {person}'s access route names one locked threshold.",
        )
        asks = (
            f"{verb.capitalize()} which access claims about {person} and the {obj} follow from record {tag} alone.",
            f"Determine whether the stated capability is enough for {person} to act on the {obj} in record {tag}.",
            f"Separate the supported sensory channels from the unspecified ones for record {tag}.",
            f"Assess the reachable relation between {person}, {place}, and the {obj} without adding properties.",
        )
    elif family == "relational":
        scenarios = (
            f"Record {tag} links the {obj} to the {other_obj} as {person} is linked to {place}, but records only the first relation's direction.",
            f"A three-part assembly at {place} requires the {obj} after the {other_obj}, the {other_obj} after {person}'s signal, and that signal after the {obj}.",
            f"During refit {tag}, the {obj} is removed from a composite instrument at {place}; no criterion for persistence is supplied.",
            f"The registry at {place} names {person} as a component steward and {other} as a whole-system steward, while record {tag} omits inheritance rules.",
        )
        asks = (
            f"{verb.capitalize()} whether the proposed relational mapping is licensed by record {tag}.",
            f"Identify whether the dependency structure in record {tag} admits an initial step.",
            f"Assess what follows about persistence from the component change in record {tag}.",
            f"Determine which whole-part conclusion, if any, is supported by record {tag}.",
        )
    elif family == "causal_temporal":
        scenarios = (
            f"At {place}, the {obj} activates only after the {other_obj}, and the {other_obj} is logged only after the {obj}; record {tag} gives no outside trigger.",
            f"Record {tag} says {person} observed the {obj} at dawn and that its state can change after one interval, but supplies no present clock reading.",
            f"The {obj} is scheduled before the {other_obj} in one ledger and after it in a second ledger at {place}; record {tag} gives neither ledger priority.",
            f"A counterfactual note {tag} removes {person}'s signal while retaining every other stated condition at {place}; the downstream rule has two prerequisites.",
        )
        asks = (
            f"{verb.capitalize()} the causal status that follows from record {tag} without inventing an initiator.",
            f"Determine whether the recorded state is current, expired, or undecidable in record {tag}.",
            f"Assess the temporal order licensed by the two ledgers in record {tag}.",
            f"Evaluate the stated prerequisite's necessity under the counterfactual in record {tag}.",
        )
    elif family == "normative":
        scenarios = (
            f"Record {tag} assigns {person} two simultaneous duties requiring the single {obj} at different sites, and lists no precedence rule.",
            f"At {place}, {person} promised to deliver the {obj} before a numbered bell; record {tag} has no current bell count.",
            f"A routing change {tag} reduces energy use for the {other_obj} while its effect on nearby workers is not measured.",
            f"The charter at {place} requires {person} to preserve the {obj} and also transfer it immediately to {other}; record {tag} marks both clauses equal.",
        )
        asks = (
            f"{verb.capitalize()} the compliance status supported by record {tag}.",
            f"Determine whether the commitment in record {tag} is open, complete, or breached.",
            f"Identify the evidenced beneficiary and any unmeasured human-floor effect in record {tag}.",
            f"Assess whether record {tag} resolves the competing obligations.",
        )
    elif family == "semantic_pragmatic":
        scenarios = (
            f"Record {tag} asserts that the {obj} exists at {place}; no question, denial, or hypothetical form repeats that content.",
            f"At {place}, one cool lamp and one rough surface are measured under record {tag}, while no atmosphere label is declared.",
            f"The archive sentence in record {tag} says {person} stopped cataloguing the {obj}; no independent entry states a prior catalogue existed.",
            f"A description at {place} calls the {obj} serene and the {other_obj} urgent, but record {tag} supplies no declared style target.",
        )
        asks = (
            f"{verb.capitalize()} the at-issue and backgrounded content supported by record {tag}.",
            f"Determine whether the measurements cohere with a declared atmosphere in record {tag}.",
            f"Assess the projected prior-state commitment in the sentence from record {tag}.",
            f"Compare the measured cues with the missing style declaration in record {tag}.",
        )
    else:
        scenarios = (
            f"From {place}, plan {tag} can reach a marked finish through the {obj} or enter {other_place}, whose success status is not recorded.",
            f"A dispatch cycle {tag} makes {person} wait for {other}, {other} wait for the {obj}, and the {obj}'s release wait for {person}.",
            f"The frontier at {place} retains one certified goal branch and one branch ending at the {other_obj}, which record {tag} leaves unclassified.",
            f"Record {tag} lists two route constraints for the {obj}; each route satisfies one and violates the other, with no ranking rule.",
        )
        asks = (
            f"{verb.capitalize()} whether both goal and anti-goal remain reachable in record {tag}.",
            f"Determine whether the dependency cycle in record {tag} has an enabled first move.",
            f"Assess the frontier's tension using only the classified endpoints in record {tag}.",
            f"Identify whether record {tag} selects a uniquely admissible route.",
        )
    return scenarios[form_index], asks[form_index]


def _compact_content(
    lane: str, family: str, form: str, variant: int, ordinal: int
) -> tuple[str, str]:
    """A task-shaped core that always leaves room in the shortest position bin."""

    pack = PACKS[lane]
    tag = f"{pack['marker']}-{family[:3]}-{form[-1]}-{variant}-{ordinal:04d}"
    digest = hashlib.sha256(tag.encode()).digest()
    person = _pick(pack["people"], digest, 0)
    obj = _pick(pack["objects"], digest, 1)
    verb = _pick(pack["verbs"], digest, 3)
    cores = {
        "physical": f"{tag}: {person} faces a screened {obj}; {pack['marker']} leaves one access property unlisted.",
        "relational": f"{tag}: {obj} and two dependencies form a relation; {pack['marker']} leaves one link unranked.",
        "causal_temporal": f"{tag}: the {obj} has a timed cause; {pack['marker']} omits the present clock value.",
        "normative": f"{tag}: {person} has two duties for one {obj}; {pack['marker']} ranks neither.",
        "semantic_pragmatic": f"{tag}: a sentence about the {obj} has {pack['marker']} asserted and backgrounded cues.",
        "planning_tension": (
            f"{tag}: one branch meets a goal; a {pack['marker']} branch ends "
            f"unclassified by {obj}."
        ),
    }
    asks = {
        "physical": f"{verb.capitalize()} the {pack['marker']} access.",
        "relational": f"{verb.capitalize()} whether {pack['marker']} permits one next step.",
        "causal_temporal": f"{verb.capitalize()} the {pack['marker']} causal-time status.",
        "normative": f"{verb.capitalize()} the {pack['marker']} compliance status.",
        "semantic_pragmatic": f"{verb.capitalize()} the {pack['marker']} content split.",
        "planning_tension": (
            f"{verb.capitalize()} whether opposed endpoints remain."
        ),
    }
    return cores[family], asks[family]


def _generate_row(
    tokenizer: Tokenizer,
    lane: str,
    family: str,
    form: str,
    position_bin: int,
    variant: int,
    ordinal: int,
    grammar_hash: str,
) -> dict[str, Any]:
    scenario, ask = _compact_content(lane, family, form, variant, ordinal)
    lower, upper = POSITION_RANGES[position_bin]
    endpoint_profile, endpoint_text = ENDPOINT_CONTEXTS[(form, variant)]
    note_index = 0
    while True:
        prompt = f"\nSituation: {scenario}\n\nTask: {ask}\n\n{endpoint_text}"
        token_ids = [1, *tokenizer.encode(prompt)]
        if len(token_ids) >= lower:
            break
        marker = PACKS[lane]["marker"]
        # Small lane- and row-specific units avoid crossing the 31-token
        # stratum slack while keeping padding inside the audited body.
        scenario += f" {marker[0]}{ordinal:04x}{note_index:02x}"
        note_index += 1
    if len(token_ids) > upper:
        raise ValueError(
            f"generator overshot {lane}/{family}/{form}/{variant} position range "
            f"{position_bin}: {len(token_ids)} > {upper}"
        )
    canonical_body = f"{_normalize(scenario)}\x1f{_normalize(ask)}"
    content_token_ids = tokenizer.encode(canonical_body)
    if len(canonical_body.encode("utf-8")) < BYTE_WINDOW or len(content_token_ids) < TOKEN_WINDOW:
        raise ValueError("candidate body is too short for non-vacuous leakage checks")
    case_id = f"s2-{lane}-{family}-{form}-{position_bin}-{variant}"
    template_id = _sha256_bytes(canonical_body.encode("utf-8"))
    return {
        "caseId": case_id,
        "lane": lane,
        "vertical": family,
        "taskForm": form,
        "lengthStratum": position_bin,
        "positionBin": list(POSITION_BINS[position_bin]),
        "variant": variant,
        "endpointProfile": endpoint_profile,
        "endpointTextSha256": _sha256_bytes(endpoint_text.encode("utf-8")),
        "grammarPackSha256": grammar_hash,
        "generatorCounter": ordinal,
        "scenario": scenario,
        "ask": ask,
        "rawBodySha256": _sha256_bytes(f"{scenario}\x1f{ask}".encode("utf-8")),
        "normalizedBodySha256": template_id,
        "contentTokenIdsSha256": _sha256_json(content_token_ids),
        "tokenIdsSha256": _sha256_json(token_ids),
        "tokenCount": len(token_ids),
        "sequenceSha256": _sha256_json(token_ids),
        "templateId": template_id,
        "frame": "fidelity",
        "prompt": prompt,
        "truncated": False,
        "_normalizedBody": canonical_body,
        "_contentTokenIds": content_token_ids,
        "_tokenIds": token_ids,
    }


def _rolling_windows(values: Sequence[int], width: int):
    if len(values) < width:
        return
    power = pow(ROLLING_BASE, width - 1, 1 << 64)
    value = 0
    for item in values[:width]:
        value = (value * ROLLING_BASE + int(item) + 1) & MASK64
    yield value, 0
    for index in range(width, len(values)):
        value = (
            ((value - (int(values[index - width]) + 1) * power) * ROLLING_BASE)
            + int(values[index])
            + 1
        ) & MASK64
        yield value, index - width + 1


def _candidate_window_index(rows: Sequence[dict[str, Any]], field: str, width: int):
    index: dict[int, list[tuple[int, int]]] = defaultdict(list)
    for row_index, row in enumerate(rows):
        values = row[field]
        for digest, start in _rolling_windows(values, width):
            index[digest].append((row_index, start))
    return index


def _scan_sequences(
    candidate_rows: Sequence[dict[str, Any]],
    references: Iterable[tuple[str, Sequence[int]]],
    *,
    candidate_field: str,
    width: int,
) -> tuple[set[int], dict[str, int]]:
    index = _candidate_window_index(candidate_rows, candidate_field, width)
    matches: set[int] = set()
    counts: dict[str, int] = defaultdict(int)
    for reference_name, values in references:
        for digest, start in _rolling_windows(values, width):
            candidates = index.get(digest)
            if not candidates:
                continue
            reference_window = list(values[start : start + width])
            for row_index, candidate_start in candidates:
                candidate_values = candidate_rows[row_index][candidate_field]
                if list(candidate_values[candidate_start : candidate_start + width]) == reference_window:
                    matches.add(row_index)
                    counts[reference_name] += 1
    return matches, dict(sorted(counts.items()))


def _decoded_rows(data: np.ndarray) -> Iterable[list[int]]:
    start = 0
    for end in np.flatnonzero(data == 2):
        yield [int(value) for value in data[start : int(end) + 1]]
        start = int(end) + 1
    if start < len(data):
        yield [int(value) for value in data[start:]]


def _exposed_bodies(path: Path) -> list[str]:
    bodies = []
    seen = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        row = json.loads(line)
        prompt = row["prompt"]
        _, separator, remainder = prompt.partition("Situation:")
        if not separator:
            raise ValueError("exposed prompt lacks Situation frame")
        scenario, separator, ask = remainder.partition("\n\nTask:")
        if not separator:
            raise ValueError("exposed prompt lacks Task frame")
        ask = re.sub(r"\s*Output JSON only\.\s*$", "", ask)
        body = f"{_normalize(scenario)}\x1f{_normalize(ask)}"
        if body not in seen:
            seen.add(body)
            bodies.append(body)
    return bodies


def _legacy_sequences(val_data: np.ndarray, roots: Sequence[Path]) -> list[list[int]]:
    sequences = []
    seen = set()
    for root in roots:
        if not root.is_dir():
            continue
        for path in sorted(root.glob("*.pt")):
            match = re.search(r"block-(\d+)-", path.name)
            if not match:
                continue
            block = int(match.group(1))
            start = block * 128
            values = [int(value) for value in val_data[start : start + 128]]
            key = tuple(values)
            if len(values) == 128 and key not in seen:
                seen.add(key)
                sequences.append(values)
    return sequences


def _sealed_s1_references(
    root: Path, tokenizer: Tokenizer
) -> tuple[list[str], list[list[int]], dict[str, Any]]:
    manifest_path = root / "corpus-manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(manifest_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (
        manifest.get("schema") != "holoscript.jspace-s1-corpus-manifest.v0.1.0"
        or manifest.get("semanticLabelsAccessed") is not False
        or manifest.get("selfHash")
        != _sha256_json({**manifest, "selfHash": None})
    ):
        raise ValueError("S1 corpus manifest is not sealed")
    bodies: list[str] = []
    sequences: list[list[int]] = []
    split_names = {"a": "fit-a.jsonl", "b": "fit-b.jsonl", "h": "fidelity-h.jsonl"}
    for lane, name in split_names.items():
        path = root / name
        expected = manifest.get("splitArtifacts", {}).get(lane)
        if (
            not path.is_file()
            or not isinstance(expected, dict)
            or expected.get("sha256") != _sha256_file(path)
        ):
            raise ValueError(f"S1 split {lane} does not match its sealed manifest")
        rows = [
            json.loads(line)
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        if len(rows) != expected.get("rowCount"):
            raise ValueError(f"S1 split {lane} row count is invalid")
        for row in rows:
            if row.get("lane") != lane or row.get("truncated") is not False:
                raise ValueError(f"S1 split {lane} contains an invalid row")
            bodies.append(f"{_normalize(row['scenario'])}\x1f{_normalize(row['ask'])}")
            sequences.append([1, *tokenizer.encode(row["prompt"])])
    binding = {
        "corpusManifestSha256": _sha256_file(manifest_path),
        "corpusManifestSelfHash": manifest["selfHash"],
        "bodyCount": len(bodies),
        "sequenceCount": len(sequences),
        "sequenceIndexSha256": _sha256_json(
            sorted(_sha256_json(sequence) for sequence in sequences)
        ),
    }
    return bodies, sequences, binding


def _audit(
    rows: Sequence[dict[str, Any]],
    *,
    tokenizer: Tokenizer,
    train_data: np.ndarray,
    val_data: np.ndarray,
    exposed_bodies: Sequence[str],
    legacy_sequences: Sequence[Sequence[int]],
    s1_bodies: Sequence[str],
    s1_sequences: Sequence[Sequence[int]],
) -> dict[str, Any]:
    decoded_token_rows = []
    normalized_reference_bodies = []
    reference_row_hashes = []
    split_counts = {}
    for split, data in (("train", train_data), ("val", val_data)):
        count = 0
        for token_row in _decoded_rows(data):
            count += 1
            decoded_token_rows.append((split, token_row))
            body = _normalize(tokenizer.decode(token_row))
            normalized_reference_bodies.append((split, body))
            reference_row_hashes.append(_sha256_bytes(body.encode("utf-8")))
        split_counts[split] = count
    for body in exposed_bodies:
        normalized_reference_bodies.append(("exposed", body))
        reference_row_hashes.append(_sha256_bytes(body.encode("utf-8")))
    for body in s1_bodies:
        normalized_reference_bodies.append(("s1", body))
        reference_row_hashes.append(_sha256_bytes(body.encode("utf-8")))
    legacy_sequence_hashes = [_sha256_json(list(values)) for values in legacy_sequences]
    reference_row_hashes.extend(legacy_sequence_hashes)
    s1_sequence_hashes = [_sha256_json(list(values)) for values in s1_sequences]
    reference_row_hashes.extend(s1_sequence_hashes)

    normalized_candidates = [row["_normalizedBody"] for row in rows]
    normalized_reference_set = {body for _, body in normalized_reference_bodies}
    equality_matches = {
        index for index, body in enumerate(normalized_candidates) if body in normalized_reference_set
    }
    containment_matches = set()
    for index, body in enumerate(normalized_candidates):
        if any(body in reference or reference in body for _, reference in normalized_reference_bodies):
            containment_matches.add(index)

    byte_references = [
        (name, list(body.encode("utf-8")))
        for name, body in normalized_reference_bodies
        if len(body.encode("utf-8")) >= BYTE_WINDOW
    ]
    byte_matches, byte_counts = _scan_sequences(
        rows,
        byte_references,
        candidate_field="_normalizedBodyBytes",
        width=BYTE_WINDOW,
    )
    token_references = [
        *decoded_token_rows,
        *[("legacy", values) for values in legacy_sequences],
        *[("s1", values) for values in s1_sequences],
    ]
    token_matches, token_counts = _scan_sequences(
        rows,
        token_references,
        candidate_field="_contentTokenIds",
        width=TOKEN_WINDOW,
    )

    cross_byte_matches = _cross_lane_window_matches(
        rows, "_normalizedBodyBytes", BYTE_WINDOW
    )
    cross_token_matches = _cross_lane_window_matches(rows, "_contentTokenIds", TOKEN_WINDOW)

    failed = sorted(
        equality_matches
        | containment_matches
        | byte_matches
        | token_matches
        | cross_byte_matches
        | cross_token_matches
    )
    return {
        "schema": "holoscript.jspace-s2-leakage-report.v0.1.0",
        "normalization": NORMALIZATION,
        "byteWindow": BYTE_WINDOW,
        "tokenWindow": TOKEN_WINDOW,
        "candidateCount": len(rows),
        "decodedReferenceRowCounts": split_counts,
        "legacySequenceCount": len(legacy_sequences),
        "legacySequenceIndexSha256": _sha256_json(sorted(legacy_sequence_hashes)),
        "exposedBodyCount": len(exposed_bodies),
        "s1BodyCount": len(s1_bodies),
        "s1SequenceCount": len(s1_sequences),
        "s1SequenceIndexSha256": _sha256_json(sorted(s1_sequence_hashes)),
        "referenceIndexSha256": _sha256_json(sorted(reference_row_hashes)),
        "matchCounts": {
            "normalizedEquality": len(equality_matches),
            "bodyContainment": len(containment_matches),
            "referenceByte64": len(byte_matches),
            "referenceToken32": len(token_matches),
            "crossLaneByte64": len(cross_byte_matches),
            "crossLaneToken32": len(cross_token_matches),
        },
        "matchesByReferenceByte64": byte_counts,
        "matchesByReferenceToken32": token_counts,
        "failedCaseIds": [rows[index]["caseId"] for index in failed],
        "passed": not failed,
        "selfHash": None,
    }


def _cross_lane_window_matches(
    rows: Sequence[dict[str, Any]], field: str, width: int
) -> set[int]:
    index = _candidate_window_index(rows, field, width)
    matches = set()
    for coordinates in index.values():
        if len(coordinates) < 2:
            continue
        for left_offset, (left_index, left_start) in enumerate(coordinates):
            for right_index, right_start in coordinates[left_offset + 1 :]:
                if rows[left_index]["lane"] == rows[right_index]["lane"]:
                    continue
                left = rows[left_index][field]
                right = rows[right_index][field]
                if list(left[left_start : left_start + width]) == list(
                    right[right_start : right_start + width]
                ):
                    matches.update((left_index, right_index))
    return matches


def _public_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if not key.startswith("_")}


def generate(args: argparse.Namespace) -> None:
    preregistration = Path(args.preregistration).resolve()
    checkpoint = Path(args.checkpoint).resolve()
    bins = Path(args.bins).resolve()
    tokenizer_path = bins / "tokenizer.json"
    train_path = bins / "train.bin"
    val_path = bins / "val.bin"
    exposed_path = Path(args.exposed_prompts).resolve()
    s1_corpus_root = Path(args.s1_corpus_dir).resolve()
    output = Path(args.output_dir).resolve()
    for path in (preregistration, checkpoint, tokenizer_path, train_path, val_path, exposed_path):
        if not path.is_file():
            raise FileNotFoundError(path)
    tokenizer = Tokenizer(tokenizer_path)
    checkpoint_sha256 = _sha256_file(checkpoint)
    preregistration_sha256 = _sha256_file(preregistration)
    s1_bodies, s1_sequences, s1_binding = _sealed_s1_references(
        s1_corpus_root, tokenizer
    )

    rows = []
    ordinal = 0
    grammar_hashes = {
        lane: _sha256_json({"lane": lane, "pack": PACKS[lane]}) for lane in ("a", "b", "h")
    }
    seeds = {
        lane: _sha256_bytes(
            f"{preregistration_sha256}|{checkpoint_sha256}|jspace-s2-{lane}".encode()
        )
        for lane in ("a", "b", "h")
    }
    for lane in ("a", "b", "h"):
        lane_rows = []
        for family in FAMILIES:
            for form in TASK_FORMS:
                for position_bin in range(4):
                    candidates = []
                    for variant in range(2):
                        ordinal += 1
                        candidate = _generate_row(
                            tokenizer,
                            lane,
                            family,
                            form,
                            position_bin,
                            variant,
                            ordinal,
                            grammar_hashes[lane],
                        )
                        candidate["selectionRank"] = _sha256_bytes(
                            (
                                f"{seeds[lane]}|{candidate['normalizedBodySha256']}|"
                                f"{candidate['endpointProfile']}"
                            ).encode()
                        )
                        candidate["_normalizedBodyBytes"] = list(
                            candidate["_normalizedBody"].encode("utf-8")
                        )
                        candidates.append(candidate)
                    lane_rows.extend(sorted(candidates, key=lambda row: row["selectionRank"]))
        if len(lane_rows) != 192:
            raise AssertionError(f"lane {lane} generated {len(lane_rows)} rows")
        rows.extend(sorted(lane_rows, key=lambda row: row["selectionRank"]))

    train_data = np.fromfile(train_path, dtype="<u2")
    val_data = np.fromfile(val_path, dtype="<u2")
    legacy_roots = [
        Path(value).resolve()
        for value in args.legacy_shards
    ]
    report = _audit(
        rows,
        tokenizer=tokenizer,
        train_data=train_data,
        val_data=val_data,
        exposed_bodies=_exposed_bodies(exposed_path),
        legacy_sequences=_legacy_sequences(val_data, legacy_roots),
        s1_bodies=s1_bodies,
        s1_sequences=s1_sequences,
    )
    report["scannerSourceSha256"] = _sha256_file(__file__)
    report["candidateCorpusSha256"] = _sha256_json(
        [row["sequenceSha256"] for row in rows]
    )
    report["selfHash"] = _sha256_json({**report, "selfHash": None})
    if not report["passed"]:
        raise RuntimeError(
            f"generated corpus failed leakage admission: {report['matchCounts']} "
            f"cases={report['failedCaseIds'][:10]}"
        )

    output.mkdir(parents=True, exist_ok=True)
    split_paths = {}
    pilot_paths = {}
    for lane in ("a", "b", "h"):
        public = [_public_row(row) for row in rows if row["lane"] == lane]
        path = output / ({"a": "fit-a.jsonl", "b": "fit-b.jsonl", "h": "fidelity-h.jsonl"}[lane])
        _write_jsonl(path, public)
        split_paths[lane] = path
        family_index = {family: index for index, family in enumerate(FAMILIES)}
        pilot = []
        for row in public:
            endpoint_slot = (family_index[row["vertical"]] * 4 + row["lengthStratum"]) % 8
            expected_form = TASK_FORMS[endpoint_slot // 2]
            expected_variant = endpoint_slot % 2
            if row["taskForm"] == expected_form and row["variant"] == expected_variant:
                pilot.append(row)
        if len(pilot) != 24:
            raise AssertionError(f"lane {lane} pilot has {len(pilot)} rows")
        if Counter(row["endpointProfile"] for row in pilot) != Counter(
            {profile: 3 for profile, _ in ENDPOINT_CONTEXTS.values()}
        ):
            raise AssertionError(f"lane {lane} pilot is not endpoint-balanced")
        pilot_path = output / (
            {"a": "fit-a-pilot.jsonl", "b": "fit-b-pilot.jsonl", "h": "fidelity-h-pilot.jsonl"}[lane]
        )
        _write_jsonl(pilot_path, pilot)
        pilot_paths[lane] = pilot_path

    leakage_path = output / "leakage-report.json"
    _write_json(leakage_path, report)
    reference = {
        "schema": "holoscript.jspace-s2-reference-manifest.v0.1.0",
        "checkpointSha256": checkpoint_sha256,
        "tokenizerSha256": _sha256_file(tokenizer_path),
        "trainBinSha256": _sha256_file(train_path),
        "validationBinSha256": _sha256_file(val_path),
        "exposedPromptManifestSha256": _sha256_file(exposed_path),
        "legacySequenceCount": report["legacySequenceCount"],
        "legacySequenceIndexSha256": report["legacySequenceIndexSha256"],
        "referenceIndexSha256": report["referenceIndexSha256"],
        "s1": s1_binding,
        "selfHash": None,
    }
    reference["selfHash"] = _sha256_json(reference)
    reference_path = output / "reference-manifest.json"
    _write_json(reference_path, reference)
    manifest = {
        "schema": "holoscript.jspace-s2-corpus-manifest.v0.1.0",
        "preregistrationSha256": preregistration_sha256,
        "generatorSourceSha256": _sha256_file(__file__),
        "checkpointSha256": checkpoint_sha256,
        "tokenizerSha256": _sha256_file(tokenizer_path),
        "seeds": seeds,
        "grammarPackSha256s": grammar_hashes,
        "endpointContexts": {
            f"{form}:{variant}": {"profile": profile, "terminalText": terminal}
            for (form, variant), (profile, terminal) in ENDPOINT_CONTEXTS.items()
        },
        "positionRanges": [list(value) for value in POSITION_RANGES],
        "positionBins": [list(value) for value in POSITION_BINS],
        "design": {
            "families": 6,
            "taskForms": 4,
            "positionBins": 4,
            "endpointVariants": 2,
        },
        "splitArtifacts": {
            lane: {"sha256": _sha256_file(path), "rowCount": 192}
            for lane, path in split_paths.items()
        },
        "pilotArtifacts": {
            lane: {"sha256": _sha256_file(path), "rowCount": 24}
            for lane, path in pilot_paths.items()
        },
        "referenceManifestSha256": _sha256_file(reference_path),
        "leakageReportSha256": _sha256_file(leakage_path),
        "s1CorpusManifestSha256": s1_binding["corpusManifestSha256"],
        "semanticLabelsAccessed": False,
        "selfHash": None,
    }
    manifest["selfHash"] = _sha256_json(manifest)
    _write_json(output / "corpus-manifest.json", manifest)
    print(
        json.dumps(
            {
                "status": "passed",
                "output": str(output),
                "corpusManifestSha256": _sha256_file(output / "corpus-manifest.json"),
                "leakageReportSha256": _sha256_file(leakage_path),
                "rows": len(rows),
            },
            sort_keys=True,
        )
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preregistration", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--bins", required=True)
    parser.add_argument("--exposed-prompts", required=True)
    parser.add_argument("--s1-corpus-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--legacy-shards", action="append", default=[])
    return parser


def main() -> None:
    generate(_parser().parse_args())


if __name__ == "__main__":
    main()
