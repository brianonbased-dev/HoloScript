import json
import torch
import sys
import os
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
        log("Starting generator V4 (One-Shot Prompting)...")
        
        if not os.path.exists(PROMPTS_PATH):
            log(f"ERROR: Prompts file not found at {PROMPTS_PATH}")
            return

        with open(PROMPTS_PATH, 'r') as f:
            prompts = json.load(f)
        log(f"Loaded {len(prompts)} prompts.")

        log(f"Loading Model...")
        tokenizer = AutoTokenizer.from_pretrained(ADAPTER_PATH)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        model = AutoModelForCausalLM.from_pretrained(
            BASE_MODEL, 
            torch_dtype=torch.bfloat16, 
            device_map="auto"
        )
        model = PeftModel.from_pretrained(model, ADAPTER_PATH)
        
        log(f"Starting generation loop...")
        
        valid_count = 0
        # Overwrite previous file
        with open(OUTPUT_PATH, 'w', encoding='utf-8') as outfile:
            for i, prompt_text in enumerate(prompts):
                log(f"[{i+1}/{len(prompts)}] Generating: {prompt_text[:50]}...")
                
                # ONE-SHOT PROMPT INJECTION
                # We show it what we want.
                one_shot_context = (
                    "User: Create a HoloScript NPC definition for a guide.\n"
                    "Assistant: \n"
                    "npc \"Guide\" {\n"
                    "  role: \"tutorial\",\n"
                    "  dialogue: {\n"
                    "    greeting: \"Welcome to Hololand.\"\n"
                    "  }\n"
                    "}\n"
                )
                
                # We augment the user prompt to ask for HoloScript explicitly
                augmented_prompt = f"Create a HoloScript definition for: {prompt_text}"
                
                full_prompt = f"<|user|>\n{one_shot_context}\n{augmented_prompt}<|end|>\n<|assistant|>\n"
                
                inputs = tokenizer(full_prompt, return_tensors="pt").to("cuda")
                
                try:
                    with torch.no_grad():
                        outputs = model.generate(
                            **inputs, 
                            max_new_tokens=1000, 
                            temperature=0.7, 
                            do_sample=True,
                            pad_token_id=tokenizer.pad_token_id
                        )
                    
                    generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
                    
                    # Extract completion (robustly)
                    # Ideally we split by the last <|assistant|> if purely decoding, 
                    # but skip_special_tokens removes it. 
                    # We look for the part AFTER our augmented prompt.
                    # Note: Since we added One-shot to the context, we should look for the end of the input prompt.
                    
                    # Reconstruction of what the model "saw" as clear text (approx)
                    # It's easier to just match what we sent.
                    
                    # A marker to split on might be best, but `clean_prompt` method is decent if unique.
                    # Let's try to find the `augmented_prompt` in the text.
                    
                    search_str = augmented_prompt
                    if search_str in generated_text:
                         completion = generated_text.split(search_str)[-1].strip()
                    else:
                         # Fallback: maybe it didn't echo the one-shot context?
                         # Just dump everything.
                         completion = generated_text

                    if "PROMPT:" in completion:
                         completion = completion.split("COMPLETION:")[-1].strip()
                    
                    # Debug first entry
                    if i == 0:
                        log(f"DEBUG V4 RAW:\n{completion[:300]}...")

                    # Save unconditionally
                    entry = {"prompt": prompt_text, "completion": completion}
                    outfile.write(json.dumps(entry) + "\n")
                    outfile.flush()
                    valid_count += 1
                    log("  ✅ Saved")
                
                except Exception as e:
                    log(f"  🔥 Error in loop: {e}")

        log(f"\nGeneration Complete. {valid_count}/{len(prompts)} saved.")
        
    except Exception as e:
        log(f"CRITICAL ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
