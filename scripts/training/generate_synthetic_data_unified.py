#!/usr/bin/env python3
"""
HoloScript Synthetic Data Generator (Unified)

Consolidates v1, v2, v3, v4 scripts into a single parameterized tool.
Prevents OOM by supporting memory-efficient generation modes.

Usage:
  python generate_synthetic_data_unified.py --help
  python generate_synthetic_data_unified.py --mode standard
  python generate_synthetic_data_unified.py --mode one-shot --validate
  python generate_synthetic_data_unified.py --no-cache --max-tokens 1500
"""

import argparse
import json
import sys
import os
from typing import Optional

try:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Install: pip install torch transformers peft")
    sys.exit(1)


# =============================================================================
# CONFIGURATION DEFAULTS
# =============================================================================
DEFAULT_BASE_MODEL = "/var/tmp/phi-3.5-mini"
DEFAULT_ADAPTER_PATH = "/var/tmp/brittney-expanded"
DEFAULT_PROMPTS_PATH = "/root/deployment/scripts/data/synthetic_prompts.json"
DEFAULT_OUTPUT_PATH = "/root/deployment/data/futuristic-holoscript-synthetic.jsonl"

# One-shot example for guided generation (v4 mode)
ONE_SHOT_CONTEXT = '''User: Create a HoloScript NPC definition for a guide.
Assistant: 
npc "Guide" {
  role: "tutorial",
  dialogue: {
    greeting: "Welcome to Hololand."
  }
}
'''


def log(msg: str) -> None:
    """Flush-safe logging for remote execution."""
    print(msg)
    sys.stdout.flush()


def validate_heuristics(code: str) -> bool:
    """
    Basic validation to filter hallucinated outputs.
    Returns True if code appears to be valid HoloScript.
    """
    if "{" not in code or "}" not in code:
        return False
    
    # Check brace balance
    open_braces = code.count('{')
    close_braces = code.count('}')
    if open_braces != close_braces:
        return False
    
    return True


def clean_completion(generated_text: str, original_prompt: str, one_shot: bool = False) -> str:
    """Extract the completion from generated text, removing prompt echoes."""
    completion = generated_text
    
    # Try to find and remove the original prompt
    if original_prompt in completion:
        completion = completion.split(original_prompt)[-1].strip()
    
    # Clean up legacy artifacts
    if "PROMPT:" in completion:
        completion = completion.split("COMPLETION:")[-1].strip()
    
    return completion


def load_model(
    base_model: str,
    adapter_path: str,
    use_eager_attn: bool = False
) -> tuple:
    """Load tokenizer and model with adapter."""
    log(f"Loading tokenizer from: {adapter_path}")
    tokenizer = AutoTokenizer.from_pretrained(adapter_path)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    log(f"Loading base model: {base_model}")
    model_kwargs = {
        "torch_dtype": torch.bfloat16,
        "device_map": "auto",
    }
    
    if use_eager_attn:
        model_kwargs["trust_remote_code"] = True
        model_kwargs["attn_implementation"] = "eager"
    
    model = AutoModelForCausalLM.from_pretrained(base_model, **model_kwargs)
    
    log(f"Loading adapter: {adapter_path}")
    model = PeftModel.from_pretrained(model, adapter_path)
    model.eval()
    
    return tokenizer, model


def generate_completions(
    tokenizer,
    model,
    prompts: list,
    output_path: str,
    max_tokens: int = 1000,
    temperature: float = 0.7,
    top_p: float = 0.9,
    use_cache: bool = True,
    one_shot: bool = False,
    validate: bool = False,
    debug: bool = False
) -> int:
    """Generate completions for all prompts and save to output file."""
    valid_count = 0
    
    with open(output_path, 'w', encoding='utf-8') as outfile:
        for i, prompt_text in enumerate(prompts):
            log(f"[{i+1}/{len(prompts)}] Generating: {prompt_text[:50]}...")
            
            # Build the full prompt
            if one_shot:
                augmented_prompt = f"Create a HoloScript definition for: {prompt_text}"
                full_prompt = f"<|user|>\n{ONE_SHOT_CONTEXT}\n{augmented_prompt}<|end|>\n<|assistant|>\n"
                search_key = augmented_prompt
            else:
                full_prompt = f"<|user|>\n{prompt_text}<|end|>\n<|assistant|>\n"
                search_key = prompt_text.strip()
            
            inputs = tokenizer(full_prompt, return_tensors="pt").to("cuda")
            
            try:
                generate_kwargs = {
                    "max_new_tokens": max_tokens,
                    "temperature": temperature,
                    "do_sample": True,
                    "pad_token_id": tokenizer.pad_token_id,
                }
                
                # top_p only in certain modes
                if top_p < 1.0:
                    generate_kwargs["top_p"] = top_p
                
                # KV cache control (disable to prevent OOM on some setups)
                if not use_cache:
                    generate_kwargs["use_cache"] = False
                
                with torch.no_grad():
                    outputs = model.generate(**inputs, **generate_kwargs)
                
                generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
                
                # Debug first entry
                if debug and i == 0:
                    log(f"DEBUG RAW (len={len(generated_text)}):\n{generated_text[:300]}...")
                
                # Clean the completion
                completion = clean_completion(generated_text, search_key, one_shot)
                
                if debug and i == 0:
                    log(f"DEBUG CLEANED:\n{completion[:300]}...")
                
                # Validate if requested
                if validate:
                    if validate_heuristics(completion):
                        entry = {"prompt": prompt_text, "completion": completion}
                        outfile.write(json.dumps(entry) + "\n")
                        outfile.flush()
                        valid_count += 1
                        log("  ✅ Valid & Saved")
                    else:
                        log("  ❌ Failed validation (unbalanced braces or missing structure)")
                else:
                    # Save unconditionally
                    entry = {"prompt": prompt_text, "completion": completion}
                    outfile.write(json.dumps(entry) + "\n")
                    outfile.flush()
                    valid_count += 1
                    log("  ✅ Saved")
            
            except Exception as e:
                log(f"  🔥 Error: {e}")
    
    return valid_count


def main():
    parser = argparse.ArgumentParser(
        description="Unified HoloScript Synthetic Data Generator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Modes (matching legacy scripts):
  standard   - Basic generation (v1/v2/v3 equivalent)
  one-shot   - Include one-shot example in prompt (v4 equivalent)

Examples:
  %(prog)s --mode standard --validate
  %(prog)s --mode one-shot --no-cache --max-tokens 1500
  %(prog)s --prompts custom.json --output results.jsonl
        """
    )
    
    # Mode selection
    parser.add_argument(
        "--mode", choices=["standard", "one-shot"], default="standard",
        help="Generation mode (default: standard)"
    )
    
    # Paths
    parser.add_argument("--base-model", default=DEFAULT_BASE_MODEL, help="Base model path")
    parser.add_argument("--adapter", default=DEFAULT_ADAPTER_PATH, help="Adapter/LoRA path")
    parser.add_argument("--prompts", default=DEFAULT_PROMPTS_PATH, help="Input prompts JSON file")
    parser.add_argument("--output", default=DEFAULT_OUTPUT_PATH, help="Output JSONL file")
    
    # Generation params
    parser.add_argument("--max-tokens", type=int, default=1000, help="Max new tokens (default: 1000)")
    parser.add_argument("--temperature", type=float, default=0.7, help="Temperature (default: 0.7)")
    parser.add_argument("--top-p", type=float, default=0.9, help="Top-p nucleus sampling (default: 0.9)")
    
    # Flags
    parser.add_argument("--no-cache", action="store_true", help="Disable KV cache (prevents some OOM issues)")
    parser.add_argument("--validate", action="store_true", help="Enable heuristic validation")
    parser.add_argument("--eager-attn", action="store_true", help="Use eager attention implementation")
    parser.add_argument("--debug", action="store_true", help="Enable debug output for first prompt")
    
    args = parser.parse_args()
    
    try:
        log(f"=== HoloScript Synthetic Data Generator (Unified) ===")
        log(f"Mode: {args.mode}")
        log(f"Prompts: {args.prompts}")
        log(f"Output: {args.output}")
        log(f"Cache: {'disabled' if args.no_cache else 'enabled'}")
        log(f"Validate: {args.validate}")
        log("")
        
        # Check prompts file exists
        if not os.path.exists(args.prompts):
            log(f"ERROR: Prompts file not found: {args.prompts}")
            sys.exit(1)
        
        # Load prompts
        with open(args.prompts, 'r') as f:
            prompts = json.load(f)
        log(f"Loaded {len(prompts)} prompts.")
        
        # Load model
        tokenizer, model = load_model(
            args.base_model,
            args.adapter,
            use_eager_attn=args.eager_attn
        )
        
        # Generate
        log("Starting generation loop...")
        valid_count = generate_completions(
            tokenizer=tokenizer,
            model=model,
            prompts=prompts,
            output_path=args.output,
            max_tokens=args.max_tokens,
            temperature=args.temperature,
            top_p=args.top_p,
            use_cache=not args.no_cache,
            one_shot=(args.mode == "one-shot"),
            validate=args.validate,
            debug=args.debug
        )
        
        log(f"\n=== Generation Complete ===")
        log(f"Saved: {valid_count}/{len(prompts)}")
        log(f"Output: {args.output}")
        
    except Exception as e:
        log(f"CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
