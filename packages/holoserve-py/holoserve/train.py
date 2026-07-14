#!/usr/bin/env python3
"""
holoserve.train — the REAL from-scratch GPU trainer for HoloRunner S0.

This is the missing engine: a genuine decoder-only transformer (nanoGPT-style) trained from RANDOM init on the
sovereign HoloScript corpus — NOT a fine-tune of a foreign base, and NOT the CPU hash-classifier smoke. It reads
the uint16 token bins emitted by the native tokenizer and trains the small GPT (holoserve.model) with real
backprop + AdamW + AMP. The Block/GPT classes are imported from holoserve.model so the serving path and the
trainer share one architecture definition.

DESIGNED FOR UNUSED / PREEMPTIBLE GPU (the founder's directive): it CHECKPOINTS every --ckpt-interval steps and
RESUMES from the checkpoint (model + optimizer + iter). So the run can be killed when the box is reclaimed and
picked up wherever spare fleet VRAM appears next — that is what makes training on unused GPU viable.

  # free-first smoke (laptop RTX 3060, 6GB): tiny model, proves the loop trains + checkpoints
  python -m holoserve.train --data-dir .scratch/holorunner/s0/bins --out-dir .scratch/holorunner/s0/ckpt \
      --n-layer 4 --n-head 4 --n-embd 128 --block-size 128 --batch-size 8 --max-iters 60 --eval-interval 20 --ckpt-interval 30

  # fleet run (24GB idle VRAM): larger model, resumable
  python -m holoserve.train --data-dir .scratch/holorunner/s0/bins --out-dir /workspace/s0-ckpt \
      --n-layer 8 --n-head 8 --n-embd 512 --block-size 256 --batch-size 32 --max-iters 20000 --resume --hf-repo <user/holorunner-s0>

Requires the [model] extra (torch, numpy).
"""
import argparse, hashlib, json, math, os, random, re, time
import numpy as np
import torch
from torch.nn import functional as F

from holoserve.model import GPT


RUN_ID_PATTERN = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$')


def artifact_record(file_path, role):
    """Return portable, content-addressed evidence for one real file."""
    digest = hashlib.sha256()
    with open(file_path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return {
        'role': role,
        'name': os.path.basename(file_path),
        'bytes': os.path.getsize(file_path),
        'sha256': f'sha256:{digest.hexdigest()}',
    }


def validated_run_id():
    """Accept the signed fleet run id when present without breaking local smoke runs."""
    run_id = os.environ.get('RUN_ID', '').strip()
    if not run_id:
        return None
    if not RUN_ID_PATTERN.fullmatch(run_id):
        raise ValueError('RUN_ID must be 1-128 portable alphanumeric/._- characters')
    return run_id


def get_batch(data, block_size, batch_size, device, structural_data=None):
    ix = torch.randint(len(data) - block_size - 1, (batch_size,))
    x = torch.stack([torch.from_numpy(data[i:i + block_size].astype(np.int64)) for i in ix])
    y = torch.stack([torch.from_numpy(data[i + 1:i + 1 + block_size].astype(np.int64)) for i in ix])
    x_types = None
    y_types = None
    if structural_data is not None:
        x_types = torch.stack([torch.from_numpy(structural_data[i:i + block_size].astype(np.int64)) for i in ix])
        y_types = torch.stack([torch.from_numpy(structural_data[i + 1:i + 1 + block_size].astype(np.int64)) for i in ix])
    return x.to(device), y.to(device), (x_types.to(device) if x_types is not None else None), (y_types.to(device) if y_types is not None else None)


@torch.no_grad()
def estimate_loss(model, splits, block_size, batch_size, device, iters=20):
    out = {}
    model.eval()
    for name, payload in splits.items():
        data = payload['tokens']
        structural_data = payload.get('types')
        if len(data) < block_size + 2:
            continue
        losses = []
        structural_losses = []
        for _ in range(iters):
            x, y, x_types, y_types = get_batch(data, block_size, batch_size, device, structural_data)
            logits, loss = model(x, y, x_types)
            losses.append(loss.item())
            if y_types is not None:
                flat_loss = F.cross_entropy(logits.view(-1, logits.size(-1)), y.view(-1), reduction='none')
                mask = y_types.reshape(-1) > 0
                if bool(mask.any().item()):
                    structural_losses.append(flat_loss[mask].mean().item())
        out[name] = float(np.mean(losses))
        if structural_losses:
            out[f'{name}_structural'] = float(np.mean(structural_losses))
            out[f'{name}_structural_ppl'] = float(math.exp(min(out[f'{name}_structural'], 20.0)))
    model.train()
    return out


def load_structural_sidecar(data_dir, split, token_data):
    path = os.path.join(data_dir, f'{split}.struct.bin')
    if not os.path.exists(path) or os.path.getsize(path) == 0:
        return None
    sidecar = np.memmap(path, dtype=np.uint16, mode='r')
    if len(sidecar) != len(token_data):
        raise ValueError(f'{split}.struct.bin length {len(sidecar)} does not match {split}.bin length {len(token_data)}')
    return sidecar


def structural_table_from_meta(meta):
    features = meta.get('s0_5_features') or {}
    table = features.get('structural_type_table') or []
    return table if isinstance(table, list) else []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data-dir', default='.scratch/holorunner/s0/bins')
    ap.add_argument('--out-dir', default='.scratch/holorunner/s0/ckpt')
    ap.add_argument('--n-layer', type=int, default=4)
    ap.add_argument('--n-head', type=int, default=4)
    ap.add_argument('--n-embd', type=int, default=128)
    ap.add_argument('--block-size', type=int, default=128)
    ap.add_argument('--batch-size', type=int, default=8)
    ap.add_argument('--grad-accum', type=int, default=1)
    ap.add_argument('--max-iters', type=int, default=200)
    ap.add_argument('--lr', type=float, default=3e-4)
    ap.add_argument('--min-lr', type=float, default=3e-5)
    ap.add_argument('--warmup', type=int, default=20)
    ap.add_argument('--dropout', type=float, default=0.0)
    ap.add_argument('--eval-interval', type=int, default=50)
    ap.add_argument('--ckpt-interval', type=int, default=100)
    ap.add_argument('--resume', action='store_true')
    ap.add_argument('--disable-structural-type-embeddings', action='store_true')
    ap.add_argument('--device', default='auto')
    ap.add_argument('--hf-repo', default='')
    ap.add_argument('--seed', type=int, default=None)
    args = ap.parse_args()

    if args.seed is not None:
        random.seed(args.seed)
        np.random.seed(args.seed)
        torch.manual_seed(args.seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(args.seed)

    device = args.device
    if device == 'auto':
        device = 'cuda' if torch.cuda.is_available() else ('mps' if getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available() else 'cpu')
    use_amp = device == 'cuda'
    os.makedirs(args.out_dir, exist_ok=True)

    run_id = validated_run_id()
    meta_path = os.path.join(args.data_dir, 'meta.json')
    train_path = os.path.join(args.data_dir, 'train.bin')
    val_path = os.path.join(args.data_dir, 'val.bin')
    train_struct_path = os.path.join(args.data_dir, 'train.struct.bin')
    val_struct_path = os.path.join(args.data_dir, 'val.struct.bin')
    tokenizer_path = os.path.join(args.data_dir, 'tokenizer.json')
    meta = json.load(open(meta_path))
    vocab_size = meta['vocab_size']
    train_data = np.memmap(train_path, dtype=np.uint16, mode='r')
    val_data = np.memmap(val_path, dtype=np.uint16, mode='r') if os.path.exists(val_path) and os.path.getsize(val_path) > 0 else train_data
    train_struct = load_structural_sidecar(args.data_dir, 'train', train_data)
    val_struct = load_structural_sidecar(args.data_dir, 'val', val_data) if val_data is not train_data else train_struct
    structural_table = structural_table_from_meta(meta)
    structural_type_count = (
        max([int(row.get('id', 0)) for row in structural_table] + [0]) + 1
    ) if train_struct is not None and not args.disable_structural_type_embeddings else 0
    splits = {
        'train': {'tokens': train_data, 'types': train_struct},
        'val': {'tokens': val_data, 'types': val_struct},
    }
    input_specs = [
        (train_path, 'train_tokens'),
        (val_path, 'validation_tokens'),
        (train_struct_path, 'train_structure'),
        (val_struct_path, 'validation_structure'),
        (meta_path, 'dataset_metadata'),
        (tokenizer_path, 'tokenizer'),
        (os.path.abspath(__file__), 'trainer'),
    ]
    input_artifacts = [
        artifact_record(file_path, role)
        for file_path, role in input_specs
        if os.path.isfile(file_path)
    ]
    input_artifacts.sort(key=lambda item: item['role'])
    print(f"[s0] device={device} vocab={vocab_size} train_tok={len(train_data)} val_tok={len(val_data)}", flush=True)
    if structural_type_count:
        print(f"[s0.5] structural_type_embeddings=on types={structural_type_count} sidecars=train.struct.bin,val.struct.bin", flush=True)

    start_iter = 0
    best_val = float('inf')
    best_val_structural = float('inf')
    ckpt_path = os.path.join(args.out_dir, 'ckpt.pt')
    resume_ck = None
    if args.resume and os.path.exists(ckpt_path):
        resume_ck = torch.load(ckpt_path, map_location=device, weights_only=True)
        ck_count = int(resume_ck.get('structural_type_count', resume_ck.get('config', {}).get('structural_type_count', structural_type_count) or 0))
        if ck_count != structural_type_count:
            print(f"[s0] resume checkpoint structural_type_count={ck_count}; using checkpoint architecture", flush=True)
            structural_type_count = ck_count

    model = GPT(vocab_size, args.n_layer, args.n_head, args.n_embd, args.block_size, args.dropout, structural_type_count).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, betas=(0.9, 0.95), weight_decay=0.1)
    try:
        scaler = torch.amp.GradScaler('cuda', enabled=use_amp)
    except (AttributeError, TypeError):
        scaler = torch.cuda.amp.GradScaler(enabled=use_amp)
    print(f"[s0] model params={model.num_params()/1e6:.2f}M  ({args.n_layer}L/{args.n_head}H/{args.n_embd}d, block={args.block_size})", flush=True)

    if resume_ck is not None:
        ck = resume_ck
        model.load_state_dict(ck['model'])
        opt.load_state_dict(ck['opt'])
        start_iter = ck['iter'] + 1
        best_val = ck.get('best_val', best_val)
        best_val_structural = ck.get('best_val_structural', best_val_structural)
        print(f"[s0] RESUMED from {ckpt_path} at iter {start_iter} (best_val={best_val:.4f})", flush=True)

    def lr_at(it):
        if it < args.warmup:
            return args.lr * (it + 1) / args.warmup
        if it > args.max_iters:
            return args.min_lr
        r = (it - args.warmup) / max(1, args.max_iters - args.warmup)
        return args.min_lr + 0.5 * (1 + math.cos(math.pi * r)) * (args.lr - args.min_lr)

    def save_ckpt(it):
        torch.save({'model': model.state_dict(), 'opt': opt.state_dict(), 'iter': it, 'best_val': best_val,
                    'best_val_structural': best_val_structural, 'vocab_size': vocab_size,
                    'structural_type_count': structural_type_count, 'structural_type_table': structural_table,
                    'config': {**vars(args), 'structural_type_count': structural_type_count},
                    'provenance': {'run_id': run_id, 'inputs': input_artifacts}}, ckpt_path)

    t0 = time.time()
    model.train()
    losslog = []
    for it in range(start_iter, args.max_iters):
        for g in opt.param_groups:
            g['lr'] = lr_at(it)
        opt.zero_grad(set_to_none=True)
        for _ in range(args.grad_accum):
            x, y, x_types, _ = get_batch(train_data, args.block_size, args.batch_size, device, train_struct)
            with torch.autocast(device_type='cuda', dtype=torch.float16, enabled=use_amp):
                _, loss = model(x, y, x_types)
                loss = loss / args.grad_accum
            scaler.scale(loss).backward()
        scaler.unscale_(opt)
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        scaler.step(opt)
        scaler.update()

        if it % args.eval_interval == 0 or it == args.max_iters - 1:
            ls = estimate_loss(model, splits, args.block_size, args.batch_size, device)
            losslog.append({'iter': it, **ls})
            vloss = ls.get('val', ls.get('train'))
            if vloss < best_val:
                best_val = vloss
            vstruct = ls.get('val_structural', ls.get('train_structural'))
            if vstruct is not None and vstruct < best_val_structural:
                best_val_structural = vstruct
            struct_part = f"  val_struct {vstruct:.4f}" if vstruct is not None else ""
            print(f"[s0] iter {it}/{args.max_iters}  train {ls.get('train'):.4f}  val {ls.get('val', float('nan')):.4f}{struct_part}  lr {lr_at(it):.2e}  {time.time()-t0:.0f}s", flush=True)
        if it > start_iter and it % args.ckpt_interval == 0:
            save_ckpt(it)

    save_ckpt(args.max_iters - 1)
    best_structural_loss = None if best_val_structural == float('inf') else round(best_val_structural, 4)
    receipt = {
        'schema': 'holorunner-s0-train.v0',
        'params_millions': round(model.num_params()/1e6, 3),
        'vocab_size': vocab_size,
        'iters': args.max_iters,
        'best_val_loss': round(best_val, 4),
        's0_5_features': {
            'structural_type_embeddings_enabled': structural_type_count > 0,
            'structural_type_count': structural_type_count,
            'structural_type_table': structural_table,
            'structural_sidecars': {
                'train': train_struct is not None,
                'val': val_struct is not None,
            },
            'best_val_structural_loss': best_structural_loss,
            'best_val_structural_ppl': None if best_structural_loss is None else round(math.exp(min(best_val_structural, 20.0)), 4),
        },
        'loss_curve': losslog,
        'config': vars(args),
        'wall_seconds': round(time.time()-t0, 1),
        'provenance': {
            'run_id': run_id,
            'validation_uses_train_tokens': val_data is train_data,
            'inputs': input_artifacts,
            'checkpoint': artifact_record(ckpt_path, 'checkpoint'),
        },
    }
    receipt_path = os.path.join(args.out_dir, 'train-receipt.json')
    with open(receipt_path, 'w', encoding='utf-8') as receipt_file:
        json.dump(receipt, receipt_file, indent=2)
        receipt_file.write('\n')
    print(f"[s0] DONE {args.max_iters} iters, best_val={best_val:.4f}, {time.time()-t0:.0f}s -> {args.out_dir}", flush=True)

    if args.hf_repo:
        try:
            from huggingface_hub import HfApi
            api = HfApi()
            api.create_repo(args.hf_repo, exist_ok=True)
            api.upload_folder(folder_path=args.out_dir, repo_id=args.hf_repo)
            print(f"[s0] pushed checkpoint -> hf.co/{args.hf_repo}", flush=True)
        except Exception as e:
            print(f"[s0] HF push skipped: {e}", flush=True)


if __name__ == '__main__':
    main()
