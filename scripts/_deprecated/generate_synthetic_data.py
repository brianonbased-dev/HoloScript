import json
import torch
import os
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

# Configuration
BASE_MODEL = "/var/tmp/phi-3.5-mini"
ADAPTER_PATH = "/var/tmp/brittney-expanded"
PROMPTS_PATH = "/root/deployment/scripts/data/synthetic_prompts.json"
OUTPUT_PATH = "/root/deployment/data/futuristic-holoscript-synthetic.jsonl"

def main():
    print(f"Loading prompts from {PROMPTS_PATH}...")
    with open(PROMPTS_PATH, 'r') as f:
        prompts = json.load(f)
    
    print(f"Loading Base Model: {BASE_MODEL}")
    tokenizer = AutoTokenizer.from_pretrained(ADAPTER_PATH)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        
    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        dtype=torch.bfloat16,
        device_map="auto",
        trust_remote_code=True,
        attn_implementation="eager"
    )
    
    print(f"Loading Adapter: {ADAPTER_PATH}")
    model = PeftModel.from_pretrained(model, ADAPTER_PATH)
    model.eval()
    
    print(f"Starting generation for {len(prompts)} prompts...")
    
    valid_count = 0
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as outfile:
        for i, prompt_text in enumerate(prompts):
            print(f"[{i+1}/{len(prompts)}] Generating: {prompt_text[:50]}...")
            
            full_prompt = f"<|user|>\n{prompt_text}<|end|>\n<|assistant|>\n"
            inputs = tokenizer(full_prompt, return_tensors="pt").to("cuda")
            
            try:
                with torch.no_grad():
                    outputs = model.generate(
                        **inputs,
                        max_new_tokens=1500,
                        temperature=0.7,
                        top_p=0.9,
                        do_sample=True,
                        pad_token_id=tokenizer.pad_token_id,
                        eos_token_id=tokenizer.eos_token_id
                    )
                
                generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
                
                # Fix: When skipping special tokens, <|assistant|> is removed.
                # We simply remove the original prompt text from the beginning.
                # Note: valid prompt text excludes special tokens too.
                # DEBUG:
                if i == 0:
                    print(f"DEBUG: Generated text raw (len={len(generated_text)}):\n{generated_text[:200]}...")
                    print(f"DEBUG: Prompt to strip: '{clean_prompt[:50]}...'")

                if clean_prompt in generated_text:
                    completion = generated_text.split(clean_prompt)[-1].strip()
                else:
                    completion = generated_text
                
                if i == 0:
                     print(f"DEBUG: Extracted completion (len={len(completion)}):\n{completion[:200]}...")

                # Heuristic: If it starts with "PROMPT:", remove it (legacy artifact?)
                # Cleaning up common leaks
                if "PROMPT:" in completion:
                     completion = completion.split("COMPLETION:")[-1].strip()
                
                if i == 0:
                     print(f"DEBUG: Final completion candidacy:\n{completion[:200]}...")
                     print(f"DEBUG: Heuristics: {validate_heuristics(completion)}")
                
                # Remove any system prompt junk if it leaked (unlikely with this template)
                
                # Basic Heuristic Validation
                if validate_heuristics(completion):
                    entry = {"prompt": prompt_text, "completion": completion}
                    outfile.write(json.dumps(entry) + "\n")
                    outfile.flush()
                    valid_count += 1
                    print("  ✅ Parsed & Saved")
                else:
                    print("  ❌ Failed Heuristics (Unbalanced braces or bad start)")
            
            except Exception as e:
                print(f"  🔥 Error: {e}")

    print(f"\nGeneration Complete. {valid_count}/{len(prompts)} saved locally to {OUTPUT_PATH}")

def validate_heuristics(code):
    # 1. Must contain some minimal HoloScript keywords or structure
    if "{" not in code or "}" not in code:
        return False
    
    # 2. Check Brace Balance
    open_braces = code.count('{')
    close_braces = code.count('}')
    if open_braces != close_braces:
        # A simple check, might fail on valid strings containing braces, but good filter for hallucinations
        return False
        
    return True

if __name__ == "__main__":
    main()
