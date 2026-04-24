"""Training loop for the constrained-decoding trait model — Paper 19.

Per `phase-1-spec.md` §3.3: HF Trainer fine-tune over (description,
trait JSON) pairs with cross-entropy loss + early stopping on
validation F1 macro.

Heavy deps imported lazily.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from trait_inference.dataset import Pair, Split


@dataclass
class TrainConfig:
    """Frozen-spec hyperparameters per `phase-1-spec.md` §3.3.

    Sweep axes (per §3.3):
      - model_name (Qwen-0.5B / Qwen-1B / Llama-3.2-1B)
      - learning_rate (encoder vs decoder)
      - batch_size, num_epochs (compute-budget bounded)

    Frozen per `preregistration.md`:
      - reseed N=5
      - early_stopping_patience=3 on val F1 macro
      - bootstrap_b=1000 on headline measurement (eval only)
    """
    model_name: str = "Qwen/Qwen2.5-0.5B"
    label_space: tuple[str, ...] = ()
    output_dir: str = "checkpoints/trait_decoder_v0"
    num_epochs: int = 20
    train_batch_size: int = 32
    eval_batch_size: int = 32
    learning_rate: float = 5e-5
    warmup_steps: int = 500
    weight_decay: float = 0.01
    max_seq_len: int = 512
    logging_steps: int = 50
    eval_steps: int = 500
    save_steps: int = 500
    early_stopping_patience: int = 3
    seed: int = 42
    fp16: bool = True             # mixed-precision on supported GPUs
    grad_accumulation_steps: int = 1
    prompt_template: str = (
        "Given a description of a virtual object, return the minimal "
        "set of HoloScript traits that apply, as a JSON array.\n"
        "Description: {description}\n"
        "Traits: {trait_json}"
    )

    def to_dict(self) -> dict:
        return {
            "model_name": self.model_name,
            "label_space_size": len(self.label_space),
            "output_dir": self.output_dir,
            "num_epochs": self.num_epochs,
            "train_batch_size": self.train_batch_size,
            "eval_batch_size": self.eval_batch_size,
            "learning_rate": self.learning_rate,
            "warmup_steps": self.warmup_steps,
            "weight_decay": self.weight_decay,
            "max_seq_len": self.max_seq_len,
            "logging_steps": self.logging_steps,
            "eval_steps": self.eval_steps,
            "save_steps": self.save_steps,
            "early_stopping_patience": self.early_stopping_patience,
            "seed": self.seed,
            "fp16": self.fp16,
            "grad_accumulation_steps": self.grad_accumulation_steps,
        }


def _format_example(pair: Pair, prompt_template: str) -> dict[str, str]:
    """Format a Pair into a {prompt, completion} dict for HF Trainer."""
    trait_json = json.dumps(list(pair.trait_set), separators=(", ", ": "))
    text = prompt_template.format(description=pair.description, trait_json=trait_json)
    return {"text": text, "trait_set": list(pair.trait_set)}


class TraitTrainer:
    """HF Trainer wrapper for the trait-decoder fine-tune.

    Construction triggers heavy imports + tokenizer load. Train +
    eval are compute-heavy and require GPU for non-trivial models.
    """

    def __init__(self, config: TrainConfig):
        if not config.label_space:
            raise ValueError("TrainConfig.label_space must be non-empty")
        try:
            import torch  # noqa: F401
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except ImportError as exc:
            raise ImportError(
                "TraitTrainer requires the [model] extra. "
                "Install via: pip install -e '.[model]'"
            ) from exc

        self.config = config
        self.tokenizer = AutoTokenizer.from_pretrained(config.model_name)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        self.model = AutoModelForCausalLM.from_pretrained(config.model_name)

    def _build_dataset(self, pairs: list[Pair]) -> Any:
        """Build a HF Dataset from Pairs."""
        from datasets import Dataset

        formatted = [_format_example(p, self.config.prompt_template) for p in pairs]
        ds = Dataset.from_list(formatted)

        def tokenize(batch: dict[str, list]) -> dict[str, list]:
            tokens = self.tokenizer(
                batch["text"],
                truncation=True,
                max_length=self.config.max_seq_len,
                padding=False,
            )
            tokens["labels"] = tokens["input_ids"].copy()
            return tokens

        return ds.map(tokenize, batched=True, remove_columns=["text", "trait_set"])

    def _build_eval_callback(
        self, val_pairs: list[Pair], label_space: tuple[str, ...]
    ) -> Callable[..., dict[str, float]]:
        """Return a compute_metrics function for HF Trainer that runs the
        decoder against val pairs and computes F1 macro."""
        from trait_inference.metrics import f1_macro
        from trait_inference.model.decoder import TraitDecoder, TraitDecoderConfig

        def compute_metrics(eval_pred: Any) -> dict[str, float]:
            # NOTE: eval_pred contains predictions from the trainer's
            # default forward pass — but we want to evaluate via
            # constrained decoding, which is a separate inference path.
            # So we run the decoder ourselves here over val_pairs.
            decoder_cfg = TraitDecoderConfig(
                model_name=self.config.model_name,
                label_space=label_space,
                device="cuda" if self.config.fp16 else "cpu",
            )
            decoder = TraitDecoder(decoder_cfg)
            descriptions = [p.description for p in val_pairs]
            preds = decoder.predict_batch(descriptions)
            gold = [list(p.trait_set) for p in val_pairs]
            return {
                "val_f1_macro": f1_macro(gold, preds, label_space=label_space),
            }

        return compute_metrics

    def train(
        self,
        train_pairs: list[Pair],
        val_pairs: list[Pair],
    ) -> dict[str, Any]:
        """Run the full training loop. Returns summary dict.

        Saves checkpoint to `config.output_dir` + structured training
        log to `output_dir/train_log.json`.
        """
        from transformers import (
            DataCollatorForLanguageModeling,
            EarlyStoppingCallback,
            Trainer,
            TrainingArguments,
        )

        train_ds = self._build_dataset(train_pairs)
        val_ds = self._build_dataset(val_pairs)

        training_args = TrainingArguments(
            output_dir=self.config.output_dir,
            num_train_epochs=self.config.num_epochs,
            per_device_train_batch_size=self.config.train_batch_size,
            per_device_eval_batch_size=self.config.eval_batch_size,
            learning_rate=self.config.learning_rate,
            warmup_steps=self.config.warmup_steps,
            weight_decay=self.config.weight_decay,
            logging_steps=self.config.logging_steps,
            eval_strategy="steps",
            eval_steps=self.config.eval_steps,
            save_strategy="steps",
            save_steps=self.config.save_steps,
            save_total_limit=2,
            load_best_model_at_end=True,
            metric_for_best_model="val_f1_macro",
            greater_is_better=True,
            fp16=self.config.fp16,
            seed=self.config.seed,
            gradient_accumulation_steps=self.config.grad_accumulation_steps,
            report_to="none",
        )

        data_collator = DataCollatorForLanguageModeling(
            tokenizer=self.tokenizer, mlm=False
        )

        trainer = Trainer(
            model=self.model,
            args=training_args,
            train_dataset=train_ds,
            eval_dataset=val_ds,
            data_collator=data_collator,
            compute_metrics=self._build_eval_callback(val_pairs, self.config.label_space),
            callbacks=[EarlyStoppingCallback(
                early_stopping_patience=self.config.early_stopping_patience
            )],
        )

        train_output = trainer.train()
        eval_metrics = trainer.evaluate()

        # Persist structured training log + config
        log_path = Path(self.config.output_dir) / "train_log.json"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_path.write_text(json.dumps({
            "config": self.config.to_dict(),
            "train_runtime_seconds": train_output.metrics.get("train_runtime"),
            "train_loss": train_output.metrics.get("train_loss"),
            "best_val_f1_macro": eval_metrics.get("eval_val_f1_macro"),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }, indent=2), encoding="utf-8")

        return {
            "train_runtime_seconds": train_output.metrics.get("train_runtime"),
            "train_loss": train_output.metrics.get("train_loss"),
            "best_val_f1_macro": eval_metrics.get("eval_val_f1_macro"),
            "checkpoint_dir": self.config.output_dir,
        }
