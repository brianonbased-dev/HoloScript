#!/usr/bin/env python3
"""Train Brittney on expanded 109-example clean dataset."""

import json
import torch
from datasets import Dataset
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling,
)
from peft import LoraConfig, get_peft_model

BASE_MODEL = "/var/tmp/phi-3.5-mini"
DATA_PATH = "/root/deployment/data/golden.jsonl"
OUTPUT_DIR = "/var/tmp/brittney-expanded"
MAX_LENGTH = 2048

def load_data(path):
    examples = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            if line.strip():
                data = json.loads(line)
                if "prompt" in data and "completion" in data:
                    text = f"<|user|>\n{data['prompt']}<|end|>\n<|assistant|>\n{data['completion']}<|end|>\n"
                    examples.append({"text": text})
    return Dataset.from_list(examples)

def main():
    print("=" * 60)
    print("Training Brittney on Expanded Clean Dataset")
    print("=" * 60)

    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    print(f"\nLoading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    print(f"Loading model from {BASE_MODEL}...")
    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
        attn_implementation="eager",
    )

    print("Configuring LoRA...")
    lora_config = LoraConfig(
        r=128,
        lora_alpha=256,
        target_modules=["qkv_proj", "o_proj", "gate_up_proj", "down_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    print(f"\nLoading data from {DATA_PATH}...")
    dataset = load_data(DATA_PATH)
    print(f"Dataset size: {len(dataset)} examples")

    def tokenize(examples):
        result = tokenizer(
            examples["text"],
            truncation=True,
            max_length=MAX_LENGTH,
            padding="max_length",
        )
        result["labels"] = result["input_ids"].copy()
        return result

    print("Tokenizing...")
    tokenized = dataset.map(tokenize, batched=True, remove_columns=["text"], num_proc=4)

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=5,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        learning_rate=2e-4,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        weight_decay=0.01,
        logging_steps=5,
        save_steps=50,
        save_total_limit=2,
        bf16=True,
        gradient_checkpointing=True,
        report_to="none",
        optim="adamw_torch_fused",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized,
        data_collator=DataCollatorForLanguageModeling(tokenizer, mlm=False),
    )

    print("\n" + "=" * 60)
    print("Starting Training...")
    print(f"  Base: Phi-3.5-mini (FRESH)")
    print(f"  Data: {len(dataset)} clean examples")
    print(f"  Epochs: 5")
    print(f"  Effective batch: 2 x 4 = 8")
    print("=" * 60)

    trainer.train()

    print("\nSaving model...")
    trainer.save_model(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)

    print("\nTraining Complete!")
    print(f"Model saved to: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
