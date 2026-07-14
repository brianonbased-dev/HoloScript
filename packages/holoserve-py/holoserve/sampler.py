#!/usr/bin/env python3
"""holoserve.sampler - deterministic offline sampler for HoloRunner S0 checkpoints.

This is evaluation glue only. It loads a checkpoint produced by the from-scratch S0
trainer, uses the saved tokenizer.json from the matching bins directory, and writes
generated samples as JSONL for a downstream parser/scorer. It does not train or spend
compute.

The byte-BPE codec (encode/decode) is imported from holoserve.tokenizer and the GPT
model class from holoserve.model — no path-based trainer load, no sibling-script import.

Requires the [model] extra (torch, numpy).
"""
import argparse
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
from torch.nn import functional as F

from holoserve.model import GPT
from holoserve.tokenizer import decode_ids, encode_text


def top_k_logits(logits, top_k):
    if top_k <= 0 or top_k >= logits.numel():
        return logits
    values, _ = torch.topk(logits, top_k)
    threshold = values[-1]
    return torch.where(logits < threshold, torch.full_like(logits, -float("inf")), logits)


@torch.no_grad()
def sample_one(model, context, *, max_new_tokens, temperature, top_k, device, block_size):
    ids = list(context)
    for _ in range(max_new_tokens):
        x = torch.tensor([ids[-block_size:]], dtype=torch.long, device=device)
        logits, _ = model(x)
        logits = logits[0, -1, :] / max(temperature, 1e-6)
        logits = top_k_logits(logits, top_k)
        probs = F.softmax(logits, dim=-1)
        next_id = int(torch.multinomial(probs, num_samples=1).item())
        ids.append(next_id)
        if next_id == 2:
            break
    return ids


def parse_args():
    parser = argparse.ArgumentParser()
    # --data-dir and --ckpt are REQUIRED: the package makes no assumption about a
    # <root>/scripts/ position and does not bundle the ~582MB checkpoint. Runtime
    # artifacts (tokenizer.json, meta.json, ckpt.pt) are supplied on the command line.
    parser.add_argument("--data-dir", required=True, help="S0 bins dir with tokenizer.json + meta.json")
    parser.add_argument("--ckpt", required=True, help="path to the S0 checkpoint (ckpt.pt)")
    parser.add_argument("--out", required=True)
    parser.add_argument("--prompt", default='composition "')
    parser.add_argument("--samples", type=int, default=12)
    parser.add_argument("--max-new-tokens", type=int, default=96)
    parser.add_argument("--temperature", type=float, default=0.8)
    parser.add_argument("--top-k", type=int, default=40)
    parser.add_argument("--seed", type=int, default=1783302334)
    parser.add_argument("--device", default="auto")
    return parser.parse_args()


def main():
    args = parse_args()
    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    data_dir = Path(args.data_dir)
    ckpt_path = Path(args.ckpt)
    tokenizer = json.loads((data_dir / "tokenizer.json").read_text(encoding="utf-8"))
    meta = json.loads((data_dir / "meta.json").read_text(encoding="utf-8"))
    merges = tokenizer["merges"]
    merge_id = {merge[2]: index for index, merge in enumerate(merges)}

    device = args.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"

    ckpt = torch.load(ckpt_path, map_location=device)
    config = ckpt.get("config", {})
    model = GPT(
        int(ckpt.get("vocab_size") or meta["vocab_size"]),
        int(config.get("n_layer", 4)),
        int(config.get("n_head", 4)),
        int(config.get("n_embd", 128)),
        int(config.get("block_size", 128)),
        float(config.get("dropout", 0.0)),
        int(ckpt.get("structural_type_count", config.get("structural_type_count", 0)) or 0),
    ).to(device)
    model.load_state_dict(ckpt["model"])
    model.eval()

    prompt_ids = [1] + encode_text(args.prompt, merges, merge_id)
    started = time.time()
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as handle:
        for index in range(args.samples):
            ids = sample_one(
                model,
                prompt_ids,
                max_new_tokens=args.max_new_tokens,
                temperature=args.temperature,
                top_k=args.top_k,
                device=device,
                block_size=int(config.get("block_size", 128)),
            )
            generated_ids = ids[len(prompt_ids):]
            output = args.prompt + decode_ids(generated_ids, tokenizer)
            row = {
                "schema": "holorunner-s0.sample.v0",
                "sample_id": f"sample_{index + 1:03d}",
                "prompt": args.prompt,
                "output": output,
                "generated_token_count": len(generated_ids),
                "seed": args.seed,
                "temperature": args.temperature,
                "top_k": args.top_k,
                "max_new_tokens": args.max_new_tokens,
                "checkpoint": str(ckpt_path),
                "data_dir": str(data_dir),
            }
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(
        f"[sample-s0] wrote {args.samples} samples to {out_path} "
        f"device={device} elapsed={time.time() - started:.1f}s"
    )


if __name__ == "__main__":
    main()
