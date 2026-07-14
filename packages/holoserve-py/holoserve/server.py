#!/usr/bin/env python3
"""
holoserve.server - native sovereign inference server for HoloRunner S0 (HOLO) models.

PyTorch-direct: loads a from-scratch HOLO checkpoint (ckpt.pt) ONCE, keeps it resident,
and serves an OpenAI-compatible /v1/completions over the native byte-BPE tokenizer. NO
llama.cpp, NO GGUF, NO HoloLlama - the fully-sovereign HOLO runtime north star (D.118).

This is the native replacement for the HoloLlama (llama.cpp llama-server) serving path
for sovereign models: the SAME OpenAI-compatible contract consumers already speak, but
backed by torch.load(ckpt.pt) on our own arch/weights instead of a converted GGUF. The
eval glue reloaded the 582 MB checkpoint per invocation; a server loads it once and keeps
it hot - the single biggest win over the offline sampler.

It reuses the proven PyTorch-direct eval glue verbatim (holoserve.sampler): the GPT
model class, the byte-BPE encode/decode, the top-k sampler, and the autoregressive loop.
Nothing about inference is reinvented - only the resident-model + HTTP surface is new.

Phase 1: resident model, /health, /v1/completions (+ /completions), /v1/models.
Phase 2: grammar-constrained decoding (reuse holoserve.grammar, W.780).
Phase 3: /props + /slots fleet parity — fleet-router discovers this server as a
backend "pytorch-holo" node (discoverPytorchHoloNode gates on /health asserting
sovereign:true, so the health payload below is a routing contract, not decoration).
Phase 4a: /v1/chat/completions (honest flattening — the base model has no chat
template, D.121) + OpenAI-compatible SSE streaming (stream:true) on both endpoints,
free AND grammar-constrained, from ONE shared autoregressive core (stream_generate).
Later phases (see research/2026-07-12_holoserve-native-sovereign-inference-server.md):
batching, model registry, LoRA hot-swap, graduation to holoscript-holoserve PyPI (F.145).

Usage:
  holoserve --ckpt /path/to/ckpt.pt --bins /path/to/s0/bins --port 8080
  curl -s localhost:8080/health
  curl -s localhost:8080/v1/completions -H 'content-type: application/json' \
       -d '{"prompt": "composition \"", "max_tokens": 48, "seed": 7}'

Requires the [model] extra (torch).
"""
import argparse
import json
import queue
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import torch
from torch.nn import functional as F

# Reuse the proven PyTorch-direct eval glue: byte-BPE encode/decode + top-k sampler, and
# the S0 GPT model class. sampler re-exports encode_text/decode_ids from holoserve.tokenizer,
# so smp.encode_text / smp.top_k_logits both resolve.
from holoserve import grammar as gram
from holoserve import sampler as smp
from holoserve.model import GPT

# Phase 2: sovereign grammar-constrained decoding — the byte-NFA logit-mask (W.780). No GBNF,
# no llama.cpp: every sampled token keeps the output a valid IR by construction (gram module).

MODEL_NAME = "holorunner-s0"


def _partial_tail_len(buf):
    """Length of an INCOMPLETE UTF-8 sequence at the very end of buf (0 if none).

    Walk back over at most 3 trailing continuation bytes to the lead byte; if the
    lead byte declares more bytes than the buffer holds, that tail is a torn
    sequence the next token may complete. Invalid arrangements return 0 (they are
    garbage now and stay garbage — replace, don't hold).
    """
    for back in range(1, min(3, len(buf)) + 1):
        b = buf[-back]
        if b & 0b11000000 == 0b11000000:  # lead byte of a multi-byte sequence
            if b & 0b11100000 == 0b11000000:
                need = 2
            elif b & 0b11110000 == 0b11100000:
                need = 3
            elif b & 0b11111000 == 0b11110000:
                need = 4
            else:
                return 0  # invalid lead — not completable
            return back if need > back else 0
        if b & 0b11000000 != 0b10000000:
            return 0  # ASCII or invalid — no partial sequence in progress
    return 0


def utf8_prefix(buf):
    """Split a byte buffer into (decodable text, held-back tail bytes).

    Byte-BPE tokens can end mid-codepoint; streaming must never emit a torn
    multi-byte sequence. ONLY a completable partial sequence at the buffer end is
    held back (structural check, not exception-position — an invalid byte earlier
    in the buffer must not stop the tail from being held). Everything before the
    tail decodes with errors="replace" (same contract as decode_ids) so invalid
    model bytes can never stall the stream.
    """
    hold = _partial_tail_len(buf)
    cut = len(buf) - hold
    return buf[:cut].decode("utf-8", errors="replace"), bytearray(buf[cut:])

# The resident model registry, populated once in main(). Read by the request
# handler. P4b: multiple named checkpoints can be resident at once (--model-spec);
# a request's `model` param selects one, defaulting to DEFAULT_MODEL_NAME. Serving
# an UNKNOWN name is refused (404) rather than silently answered with different
# weights — eval receipts depend on the name→weights binding being honest.
MODELS = {}
DEFAULT_MODEL_NAME = MODEL_NAME
# Back-compat alias for the default model (set in main alongside MODELS).
MODEL = None


class HoloModel:
    """A resident HOLO model + tokenizer. Loaded once; generate() is serialized for safety.

    Holds the GPT instance and byte-BPE tables in memory so every request is a forward pass,
    not a 582 MB reload. Generation runs under a lock: the model is stateless per forward, but
    serializing keeps sampling deterministic under a seed and avoids interleaved CUDA work on
    the single resident model.
    """

    def __init__(self, ckpt_path, bins_dir, device):
        self.ckpt_path = Path(ckpt_path)
        self.bins_dir = Path(bins_dir)
        self.device = device
        self._lock = threading.Lock()
        self._load()

    def _load(self):
        self.tokenizer = json.loads((self.bins_dir / "tokenizer.json").read_text(encoding="utf-8"))
        self.meta = json.loads((self.bins_dir / "meta.json").read_text(encoding="utf-8"))
        self.merges = self.tokenizer["merges"]
        self.merge_id = {merge[2]: index for index, merge in enumerate(self.merges)}

        ckpt = torch.load(self.ckpt_path, map_location=self.device)
        cfg = ckpt.get("config", {})
        self.block_size = int(cfg.get("block_size", 128))
        struct_count = int(
            ckpt.get("structural_type_count", cfg.get("structural_type_count", 0)) or 0
        )
        self.config = {
            "vocab_size": int(ckpt.get("vocab_size") or self.meta["vocab_size"]),
            "n_layer": int(cfg.get("n_layer", 4)),
            "n_head": int(cfg.get("n_head", 4)),
            "n_embd": int(cfg.get("n_embd", 128)),
            "block_size": self.block_size,
            "structural_type_count": struct_count,
            "iter": ckpt.get("iter"),
            "best_val": ckpt.get("best_val"),
        }
        model = GPT(
            self.config["vocab_size"],
            self.config["n_layer"],
            self.config["n_head"],
            self.config["n_embd"],
            self.block_size,
            float(cfg.get("dropout", 0.0)),
            struct_count,
        ).to(self.device)
        model.load_state_dict(ckpt["model"])
        model.eval()
        self.model = model
        self.params_millions = round(sum(p.numel() for p in model.parameters()) / 1e6, 3)

        # Phase 2: token-id -> byte-string table for grammar-constrained decoding, built once
        # (static per tokenizer/vocab). specials map to None so they're never sampleable under
        # constraint. The available verticals come straight from the W.780 grammar registry.
        self.token_bytes = gram.build_token_bytes(self.tokenizer, self.config["vocab_size"])
        self.grammars = set(gram.GRAMMARS.keys())

    @property
    def busy(self):
        """True while a generation holds the lock — the /slots busy signal."""
        return self._lock.locked()

    def stream_generate(self, prompt, max_new_tokens, temperature, top_k, seed=None, grammar=None):
        """THE generation loop — one autoregressive core for all four serving modes
        (free/constrained × streaming/blocking). Yields {"delta": <utf-8-safe text>}
        events as tokens decode, then exactly one terminal event:
          {"done": True, "finish_reason", "prompt_tokens", "completion_tokens"[, "grammar_complete"]}

        Free mode reproduces sample_one's loop (EOS=2 stops); grammar mode masks
        each step's logits to the byte-NFA's allowed tokens (W.780) so the output
        is a valid uAAL IR by construction. Runs under the model lock; a byte
        buffer holds partial multi-byte sequences so no delta tears a codepoint.
        """
        with self._lock:
            if seed is not None:
                torch.manual_seed(seed)
            decoder = gram.ConstrainedIRDecoder(grammar, self.token_bytes) if grammar else None
            prompt_ids = [1] + smp.encode_text(prompt, self.merges, self.merge_id)  # BOS=1
            ids = list(prompt_ids)
            pending = bytearray()
            steps = 0
            finish = "length"
            with torch.no_grad():
                for _ in range(max_new_tokens):
                    x = torch.tensor([ids[-self.block_size:]], dtype=torch.long, device=self.device)
                    logits, _ = self.model(x)
                    logits = logits[0, -1, :] / max(temperature, 1e-6)
                    if decoder is not None:
                        allowed = torch.tensor(decoder.allowed_tokens(), dtype=torch.long, device=logits.device)
                        masked = torch.full_like(logits, float("-inf"))
                        masked[allowed] = logits[allowed]
                        logits = masked
                    probs = F.softmax(smp.top_k_logits(logits, top_k), dim=-1)
                    next_id = int(torch.multinomial(probs, num_samples=1).item())
                    ids.append(next_id)
                    steps += 1
                    if decoder is not None:
                        decoder.push(next_id)
                    token_bytes = self.token_bytes[next_id] if 0 <= next_id < len(self.token_bytes) else None
                    if token_bytes:
                        pending.extend(token_bytes)
                        text, pending = utf8_prefix(pending)
                        if text:
                            yield {"delta": text}
                    if decoder is not None:
                        if decoder.done:
                            finish = "stop"
                            break
                    elif next_id == 2:  # EOS
                        finish = "stop"
                        break
            if pending:  # trailing torn/partial bytes — same replace contract as decode_ids
                yield {"delta": pending.decode("utf-8", errors="replace")}
            yield {
                "done": True,
                "finish_reason": finish,
                "prompt_tokens": len(prompt_ids),
                "completion_tokens": steps,
                # A constrained decode "stops" only when the grammar completes; otherwise it
                # hit the token budget with a partial (structurally-incomplete) IR.
                **({"grammar_complete": decoder.done} if decoder is not None else {}),
            }

    def _drain(self, events):
        """Collect a stream_generate() run into the blocking generate() result shape."""
        parts = []
        try:
            for ev in events:
                if "delta" in ev:
                    parts.append(ev["delta"])
                if ev.get("done"):
                    return {"text": "".join(parts), **{k: v for k, v in ev.items() if k != "done"}}
            raise RuntimeError("stream_generate ended without a terminal event")
        finally:
            # The terminal yield suspends INSIDE `with self._lock` — close explicitly
            # so lock release never depends on refcount finalization timing.
            events.close()

    def generate(self, prompt, max_new_tokens, temperature, top_k, seed=None):
        return self._drain(self.stream_generate(prompt, max_new_tokens, temperature, top_k, seed))

    def generate_constrained(self, prompt, grammar, max_new_tokens, temperature, top_k, seed=None):
        """Grammar-constrained generation (W.780) — see stream_generate."""
        return self._drain(
            self.stream_generate(prompt, max_new_tokens, temperature, top_k, seed, grammar=grammar)
        )


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    # Idle/half-open keep-alive connections (fleet discovery polls every routing turn)
    # must not pin a handler thread forever — time out and let the client reconnect.
    timeout = 65

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # keep the console quiet
        pass

    def _health(self):
        return {
            "status": "ok",
            "backend": "pytorch-holo",
            "sovereign": True,
            "llama_cpp": False,
            "gguf": False,
            "device": MODEL.device,
            "grammars": sorted(MODEL.grammars),
            # llama-parity single-model block = the DEFAULT; the registry list names
            # every resident checkpoint (P4b — request `model` param selects one).
            "model": {"name": DEFAULT_MODEL_NAME, "params_millions": MODEL.params_millions, **MODEL.config},
            "models": sorted(MODELS),
        }

    def do_GET(self):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path in ("/health", "/healthz"):
            self._json(200, self._health())
        elif path == "/props":
            # Phase 3: full HoloLlama-parity discovery surface. fleet-router's PropsResponse
            # reads default_generation_settings.model first, then model, then model_path —
            # without a model name it would derive the id "ckpt.pt" from the path.
            self._json(200, {
                "default_generation_settings": {"model": DEFAULT_MODEL_NAME, "n_ctx": MODEL.block_size},
                "model": DEFAULT_MODEL_NAME,
                "model_path": str(MODEL.ckpt_path),
                "total_slots": 1,
                "backend": "pytorch-holo",
                "sovereign": True,
                "grammars": sorted(MODEL.grammars),
                "models": sorted(MODELS),
            })
        elif path == "/slots":
            # Phase 3: llama-server-parity slot state — one slot, busy while ANY
            # resident model's generation lock is held. fleet-router counts
            # state!==0 / is_processing as busy load.
            busy = any(m.busy for m in MODELS.values())
            self._json(200, [{
                "id": 0,
                "state": 1 if busy else 0,
                "is_processing": busy,
                "model": DEFAULT_MODEL_NAME,
            }])
        elif path == "/v1/models":
            self._json(200, {
                "object": "list",
                "data": [
                    {"id": name, "object": "model", "owned_by": "holoscript-sovereign"}
                    for name in sorted(MODELS)
                ],
            })
        else:
            self._json(404, {"error": {"message": f"not found: {self.path}", "type": "invalid_request_error"}})

    def do_POST(self):
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        # Drain the request body BEFORE any early reply: with HTTP/1.1 keep-alive,
        # responding without reading rfile leaves the body bytes on the socket, and
        # the NEXT request on the same connection parses them as a request line
        # (connection poisoning). Chunked bodies can't be drained by length → 411.
        if "chunked" in (self.headers.get("Transfer-Encoding") or "").lower():
            self.close_connection = True
            self._json(411, {"error": {"message": "chunked bodies not supported; send Content-Length", "type": "invalid_request_error"}})
            return
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except (TypeError, ValueError):
            self.close_connection = True  # body length unknowable → can't drain safely
            self._json(400, {"error": {"message": "bad Content-Length", "type": "invalid_request_error"}})
            return
        raw = self.rfile.read(length) if length > 0 else b""
        chat = path == "/v1/chat/completions"
        if not chat and path not in ("/v1/completions", "/completions"):
            self._json(404, {"error": {"message": f"not found: {self.path}", "type": "invalid_request_error"}})
            return
        try:
            req = json.loads(raw or b"{}")
        except Exception as exc:
            self._json(400, {"error": {"message": f"bad request body: {exc}", "type": "invalid_request_error"}})
            return

        if chat:
            messages = req.get("messages")
            if not isinstance(messages, list) or not messages:
                self._json(400, {"error": {"message": "messages must be a non-empty array", "type": "invalid_request_error"}})
                return
            # HONEST chat flattening (D.121): the from-scratch base model has NO chat
            # template in its training — fabricated role tokens would be out-of-
            # distribution noise. Contents are joined in order; chat SEMANTICS
            # (turn-taking, instruction-following) are a training axis, not a
            # serving feature. This endpoint exists for OpenAI-client parity.
            parts = []
            for m in messages:
                content = m.get("content", "") if isinstance(m, dict) else ""
                if isinstance(content, list):  # OpenAI content-block arrays
                    content = "".join(
                        str(b.get("text") or "")  # str-coerce: text may be null/non-string
                        for b in content
                        if isinstance(b, dict) and b.get("type") == "text"
                    )
                if content:
                    parts.append(str(content))
            prompt = "\n\n".join(parts)
        else:
            prompt = req.get("prompt", "")
            if isinstance(prompt, list):
                prompt = prompt[0] if prompt else ""
        # P4b model registry: the request's `model` selects a resident checkpoint.
        # Unknown names are REFUSED — silently serving different weights under a
        # requested name would poison eval receipts (name→weights binding is honest).
        model_name = req.get("model") or DEFAULT_MODEL_NAME
        target = MODELS.get(model_name)
        if target is None:
            self._json(404, {"error": {
                "message": f"model '{model_name}' not found. serving: {sorted(MODELS)}",
                "type": "invalid_request_error",
                "code": "model_not_found",
            }})
            return

        grammar = req.get("grammar")
        if grammar is not None and grammar not in target.grammars:
            self._json(400, {"error": {
                "message": f"unknown grammar '{grammar}'. valid: {sorted(target.grammars)}",
                "type": "invalid_request_error",
            }})
            return
        if grammar is not None:
            # The constrained decoder tracks grammar state independently of the model's context
            # window (which just slides), and the grammar's rep-bounds GUARANTEE termination — so
            # the budget can safely exceed block_size. Default generous; cap only as a runaway guard.
            max_tokens = max(1, min(int(req.get("max_tokens", 1024)), 4096))
        else:
            # Free generation has no structural terminator (only EOS), so cap at the context window.
            max_tokens = max(1, min(int(req.get("max_tokens", 64)), target.block_size))
        temperature = float(req.get("temperature", 0.8))
        top_k = int(req.get("top_k", 40))
        seed = req.get("seed")
        seed = int(seed) if seed is not None else None
        stream = req.get("stream") is True

        t0 = time.time()
        req_id = f"{'chatcmpl' if chat else 'cmpl'}-holo-{int(t0 * 1000)}"
        if stream:
            self._sse_stream(chat, req_id, int(t0), str(prompt), grammar, max_tokens, temperature, top_k, seed, target, model_name)
            return
        try:
            if grammar is not None:
                result = target.generate_constrained(str(prompt), grammar, max_tokens, temperature, top_k, seed)
            else:
                result = target.generate(str(prompt), max_tokens, temperature, top_k, seed)
        except Exception as exc:
            self._json(500, {"error": {"message": f"generation failed: {exc}", "type": "server_error"}})
            return
        elapsed = time.time() - t0

        usage = {
            "prompt_tokens": result["prompt_tokens"],
            "completion_tokens": result["completion_tokens"],
            "total_tokens": result["prompt_tokens"] + result["completion_tokens"],
        }
        holo = {
            "backend": "pytorch-holo",
            "sovereign": True,
            "llama_cpp": False,
            "elapsed_s": round(elapsed, 3),
            "tokens_per_s": round(result["completion_tokens"] / elapsed, 1) if elapsed > 0 else None,
            **({"grammar": grammar, "grammar_complete": result.get("grammar_complete", False)}
               if grammar is not None else {}),
        }
        if chat:
            self._json(200, {
                "id": req_id,
                "object": "chat.completion",
                "created": int(t0),
                "model": model_name,
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": result["text"]},
                    "finish_reason": result["finish_reason"],
                }],
                "usage": usage,
                "holo": holo,
            })
        else:
            self._json(200, {
                "id": req_id,
                "object": "text_completion",
                "created": int(t0),
                "model": model_name,
                "choices": [{
                    "text": result["text"],
                    "index": 0,
                    "logprobs": None,
                    "finish_reason": result["finish_reason"],
                }],
                "usage": usage,
                "holo": holo,
            })

    def _sse_stream(self, chat, req_id, created, prompt, grammar, max_tokens, temperature, top_k, seed, target, model_name):
        """OpenAI-compatible SSE: one `data: {json}` frame per text delta, a final
        frame carrying finish_reason (+usage, llama-server style), then `data: [DONE]`.

        P4b: generation is DECOUPLED from socket I/O. A producer thread runs the
        (lock-holding) generator and feeds a bounded IN-PROCESS queue; this handler
        thread only writes frames — the MODEL LOCK is never held across a socket
        write. A consumer that stops reading fills the queue; the producer then
        ABORTS the decode (releasing GPU + lock) instead of stalling other requests.

        The body is EOF-terminated (Connection: close) — BaseHTTPRequestHandler does
        no chunked encoding, and a stream has no Content-Length. A mid-generation
        model failure is surfaced as an SSE `error` frame (never a silent EOF that
        would be indistinguishable from a clean finish).
        """
        self.close_connection = True
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()
        self.connection.settimeout(15)  # bounds each write against a stalled socket

        def frame(obj):
            self.wfile.write(b"data: " + json.dumps(obj).encode("utf-8") + b"\n\n")
            self.wfile.flush()

        def chunk(delta_content=None, finish=None, role=None, usage=None, holo=None):
            if chat:
                delta = {}
                if role is not None:
                    delta["role"] = role
                if delta_content is not None:
                    delta["content"] = delta_content
                choice = {"index": 0, "delta": delta, "finish_reason": finish}
            else:
                choice = {"index": 0, "text": delta_content or "", "logprobs": None, "finish_reason": finish}
            obj = {
                "id": req_id,
                "object": "chat.completion.chunk" if chat else "text_completion",
                "created": created,
                "model": model_name,
                "choices": [choice],
            }
            if usage is not None:
                obj["usage"] = usage
            if holo is not None:
                obj["holo"] = holo
            return obj

        # Bounded event queue: producer (generation, holds the model lock) →
        # consumer (this thread, owns the socket). In-process only.
        events = queue.Queue(maxsize=256)
        abort = threading.Event()

        def produce():
            gen = target.stream_generate(prompt, max_tokens, temperature, top_k, seed, grammar=grammar)
            try:
                for ev in gen:
                    if abort.is_set():
                        break
                    try:
                        events.put(("ev", ev), timeout=15)
                    except queue.Full:
                        break  # consumer stalled 15s with 256 frames pending — abandon the decode
            except Exception as exc:  # model-side failure (CUDA OOM, decoder bug)
                try:
                    events.put_nowait(("error", str(exc)))
                except queue.Full:
                    pass
            finally:
                gen.close()  # releases the model lock deterministically
                try:
                    events.put_nowait(("end", None))
                except queue.Full:
                    pass  # consumer is gone/stalled; it aborts on its own timeout

        worker = threading.Thread(target=produce, name=f"holoserve-gen-{req_id}", daemon=True)
        worker.start()
        try:
            if chat:
                frame(chunk(role="assistant", delta_content=""))
            while True:
                # Generous inter-event bound: covers slow CPU-fallback token steps;
                # a silent producer beyond it is treated as a dead stream.
                kind, payload = events.get(timeout=120)
                if kind == "ev":
                    ev = payload
                    if "delta" in ev:
                        frame(chunk(delta_content=ev["delta"]))
                    if ev.get("done"):
                        usage = {
                            "prompt_tokens": ev["prompt_tokens"],
                            "completion_tokens": ev["completion_tokens"],
                            "total_tokens": ev["prompt_tokens"] + ev["completion_tokens"],
                        }
                        holo = {
                            "backend": "pytorch-holo",
                            "sovereign": True,
                            "llama_cpp": False,
                            **({"grammar": grammar, "grammar_complete": ev.get("grammar_complete", False)}
                               if grammar is not None else {}),
                        }
                        frame(chunk(finish=ev["finish_reason"], usage=usage, holo=holo))
                elif kind == "error":
                    # Surface the failure as an SSE error frame — a silent EOF would be
                    # indistinguishable from a clean finish on an EOF-terminated body.
                    frame({"error": {"message": f"generation failed: {payload}", "type": "server_error"}})
                    return
                else:  # "end"
                    break
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except queue.Empty:
            try:
                frame({"error": {"message": "generation stalled (no event within 120s)", "type": "server_error"}})
            except OSError:
                pass
        except (BrokenPipeError, ConnectionError, TimeoutError, OSError):
            pass  # client went away / stalled — producer aborts via the event below
        finally:
            abort.set()


def main():
    parser = argparse.ArgumentParser(description="Native sovereign inference server for HOLO models (PyTorch-direct, no llama.cpp).")
    # --ckpt and --bins are REQUIRED: the package makes no assumption about a
    # <root>/scripts/ position and does not bundle the ~582MB checkpoint. Runtime
    # artifacts (ckpt.pt, tokenizer.json, meta.json) are supplied on the command line.
    parser.add_argument("--ckpt", required=True, help="path to the S0 checkpoint (ckpt.pt)")
    parser.add_argument("--bins", required=True, help="S0 bins dir with tokenizer.json + meta.json")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--device", default="auto", help="auto|cuda|cpu")
    parser.add_argument(
        "--model-spec",
        action="append",
        default=[],
        metavar="NAME=CKPT[@BINS]",
        help="serve an ADDITIONAL named checkpoint (repeatable; P4b registry — e.g. the "
        "P.041 s1/s2 disposition pair from one process). BINS defaults to --bins. "
        "Requests select via the OpenAI `model` param; unknown names get 404.",
    )
    args = parser.parse_args()

    device = args.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"

    global MODEL
    print(f"[holoserve] loading {args.ckpt} on {device} ...", flush=True)
    t0 = time.time()
    MODEL = HoloModel(args.ckpt, args.bins, device)
    MODELS[DEFAULT_MODEL_NAME] = MODEL
    print(
        f"[holoserve] model resident: {MODEL.params_millions}M params, "
        f"vocab {MODEL.config['vocab_size']}, iter {MODEL.config['iter']}, "
        f"device {device}, load {time.time() - t0:.1f}s",
        flush=True,
    )
    # P4b registry: additional named checkpoints (e.g. the P.041 s1/s2 disposition
    # pair) resident in the same process; requests select via the `model` param.
    for spec in args.model_spec:
        if "=" not in spec:
            raise SystemExit(f"--model-spec must be NAME=CKPT[@BINS], got: {spec!r}")
        name, rest = spec.split("=", 1)
        name = name.strip()
        ckpt_path, _, bins_path = rest.partition("@")
        if not name or not ckpt_path:
            raise SystemExit(f"--model-spec must be NAME=CKPT[@BINS], got: {spec!r}")
        if name in MODELS:
            raise SystemExit(f"--model-spec duplicate model name: {name!r}")
        print(f"[holoserve] loading extra model '{name}' from {ckpt_path} ...", flush=True)
        t1 = time.time()
        MODELS[name] = HoloModel(ckpt_path, bins_path or args.bins, device)
        print(
            f"[holoserve] '{name}' resident: {MODELS[name].params_millions}M params, "
            f"iter {MODELS[name].config['iter']}, load {time.time() - t1:.1f}s",
            flush=True,
        )

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(
        f"[holoserve] serving sovereign HOLO model at http://{args.host}:{args.port} "
        f"(/health, /v1/completions) - PyTorch-direct, no llama.cpp",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
