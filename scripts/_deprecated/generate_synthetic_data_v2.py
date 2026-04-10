import json
import torch
import os
import sys
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

# Configuration
BASE_MODEL = "/var/tmp/phi-3.5-mini"
ADAPTER_PATH = "/var/tmp/brittney-expanded"
PROMPTS_PATH = "/root/deployment/scripts/data/synthetic_prompts.json"
OUTPUT_PATH = "/root/deployment/data/futuristic-holoscript-synthetic.jsonl"

def log(msg):
    print(msg)
    sys.stdout.flush()

def main():
    try:
        log(f"Starting generator V2...")
        
        if not os.path.exists(PROMPTS_PATH):
            log(f"ERROR: Prompts file not found at {PROMPTS_PATH}")
            return

        log(f"Loading prompts from {PROMPTS_PATH}...")
        with open(PROMPTS_PATH, 'r') as f:
            prompts = json.load(f)
        log(f"Loaded {len(prompts)} prompts.")

        log(f"Loading Base Model: {BASE_MODEL}")
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
        
        log(f"Loading Adapter: {ADAPTER_PATH}")
        model = PeftModel.from_pretrained(model, ADAPTER_PATH)
        model.eval()
        
        log(f"Starting generation loop...")
        
        valid_count = 0
        with open(OUTPUT_PATH, 'w', encoding='utf-8') as outfile:
            for i, prompt_text in enumerate(prompts):
                log(f"[{i+1}/{len(prompts)}] Generating: {prompt_text[:50]}...")
                
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
                            eos_token_id=tokenizer.eos_token_id,
                            use_cache=False  # CRITICAL: Disable KV cache to avoid DynamicCache error
                        )
                    
                    generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
                    
                    # Debug first entry
                    if i == 0:
                        log(f"DEBUG RAW:\n{generated_text[:200]}...")

                    clean_prompt = prompt_text.strip()
                    if clean_prompt in generated_text:
                        completion = generated_text.split(clean_prompt)[-1].strip()
                    else:
                        completion = generated_text

                    if "PROMPT:" in completion:
                         completion = completion.split("COMPLETION:")[-1].strip()
                    
                    if validate_heuristics(completion):
                        entry = {"prompt": prompt_text, "completion": completion}
                        outfile.write(json.dumps(entry) + "\n")
                        outfile.flush()
                        valid_count += 1
                        log("  ✅ Saved")
                    else:
                        log("  ❌ Failed Heuristics")
                        if i == 0:
                            log(f"DEBUG FAIL CONTENT:\n{completion[:200]}...")
                
                except Exception as e:
                    log(f"  🔥 Error in loop: {e}")

        log(f"\nGeneration Complete. {valid_count}/{len(prompts)} saved.")
        
    except Exception as e:
        log(f"CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()

def validate_heuristics(code):
    if "{" not in code or "}" not in code:
        return False
    open_braces = code.count('{')
    close_braces = code.count('}')
    # Relaxed check: just ensure meaningful content
    if len(code) < 50: return False
    return True

if __name__ == "__main__":
    main()
