"""holoserve.model — the from-scratch HoloRunner S0 GPT (Block + GPT).

Extracted verbatim from the sovereign from-scratch trainer (train_holorunner_s0.py).
This is the decoder-only transformer (nanoGPT-style) that the offline sampler
(holoserve.sampler) and the resident-model server (holoserve.server) instantiate to
load a sovereign HOLO checkpoint (ckpt.pt). Only the model classes live here so the
serving path never imports the training loop; the full trainer is holoserve.train.

Requires the [model] extra (torch).
"""
import torch
import torch.nn as nn
from torch.nn import functional as F


class Block(nn.Module):
    def __init__(self, n_embd, n_head, block_size, dropout):
        super().__init__()
        self.ln1 = nn.LayerNorm(n_embd)
        self.attn = nn.MultiheadAttention(n_embd, n_head, dropout=dropout, batch_first=True)
        self.ln2 = nn.LayerNorm(n_embd)
        self.mlp = nn.Sequential(nn.Linear(n_embd, 4 * n_embd), nn.GELU(), nn.Linear(4 * n_embd, n_embd), nn.Dropout(dropout))
        mask = torch.triu(torch.ones(block_size, block_size) * float('-inf'), diagonal=1)
        self.register_buffer('mask', mask)

    def forward(self, x):
        T = x.size(1)
        h = self.ln1(x)
        a, _ = self.attn(h, h, h, attn_mask=self.mask[:T, :T], need_weights=False)
        x = x + a
        x = x + self.mlp(self.ln2(x))
        return x


class GPT(nn.Module):
    def __init__(self, vocab_size, n_layer, n_head, n_embd, block_size, dropout=0.0, structural_type_count=0):
        super().__init__()
        self.block_size = block_size
        self.structural_type_count = int(structural_type_count or 0)
        self.tok = nn.Embedding(vocab_size, n_embd)
        self.struct = nn.Embedding(self.structural_type_count, n_embd) if self.structural_type_count > 0 else None
        self.pos = nn.Embedding(block_size, n_embd)
        self.drop = nn.Dropout(dropout)
        self.blocks = nn.ModuleList([Block(n_embd, n_head, block_size, dropout) for _ in range(n_layer)])
        self.lnf = nn.LayerNorm(n_embd)
        self.head = nn.Linear(n_embd, vocab_size, bias=False)
        self.tok.weight = self.head.weight  # weight tying
        self.apply(self._init)

    def _init(self, m):
        if isinstance(m, nn.Linear):
            nn.init.normal_(m.weight, mean=0.0, std=0.02)
            if m.bias is not None:
                nn.init.zeros_(m.bias)
        elif isinstance(m, nn.Embedding):
            nn.init.normal_(m.weight, mean=0.0, std=0.02)

    def embed(self, idx, type_ids=None):
        """Embed a token sequence before the transformer blocks."""
        T = idx.size(1)
        pos = torch.arange(T, device=idx.device)
        tok = self.tok(idx)
        if self.struct is not None:
            if type_ids is None:
                type_ids = torch.zeros_like(idx)
            type_ids = type_ids.to(device=idx.device, dtype=torch.long).clamp(0, self.structural_type_count - 1)
            tok = tok + self.struct(type_ids)
        return self.drop(tok + self.pos(pos))

    def _forward_blocks(self, idx, type_ids=None, capture_residuals=False):
        """Run transformer blocks, retaining residuals only when explicitly requested."""
        x = self.embed(idx, type_ids=type_ids)
        residuals = [] if capture_residuals else None
        for b in self.blocks:
            x = b(x)
            if residuals is not None:
                residuals.append(x)
        logits = self.head(self.lnf(x))
        return logits, tuple(residuals) if residuals is not None else ()

    def forward(self, idx, targets=None, type_ids=None):
        logits, _ = self._forward_blocks(idx, type_ids=type_ids, capture_residuals=False)
        loss = None
        if targets is not None:
            loss = F.cross_entropy(logits.view(-1, logits.size(-1)), targets.view(-1), ignore_index=-1)
        return logits, loss

    def forward_with_residuals(self, idx, type_ids=None):
        """Observation-only surface for probes; ordinary callers keep `(logits, loss)`."""
        return self._forward_blocks(idx, type_ids=type_ids, capture_residuals=True)

    def forward_from_residual(self, residual, start_layer, normalize=True):
        """Continue a captured residual through blocks `[start_layer, n_layer)`.

        Jacobian-lens fitting differentiates this function with respect to one
        source-position residual. It does not mutate model parameters or expose
        an intervention path through the serving API.
        """
        if start_layer < 0 or start_layer > len(self.blocks):
            raise ValueError(f"start_layer must be in [0, {len(self.blocks)}]")
        x = residual
        for b in self.blocks[start_layer:]:
            x = b(x)
        return self.lnf(x) if normalize else x

    def num_params(self):
        return sum(p.numel() for p in self.parameters())
