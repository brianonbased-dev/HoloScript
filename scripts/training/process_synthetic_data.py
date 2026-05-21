import json
import re
import sys

INPUT_FILE = "v4_final_v2.jsonl"
OUTPUT_FILE = "final_synthetic.jsonl"

def extract_code(text):
    # Try Markdown blocks first
    # pattern: ```(holoscript|holo|...) code ```
    matches = re.findall(r"```(?:\w+)?\n(.*?)```", text, re.DOTALL)
    if matches:
        # Return the longest code block, assuming it's the main answer
        return max(matches, key=len).strip()
    
    # Heuristic: Look for pattern `type "name" { ... }` or `word "name" { ... }`
    # We find the first occurrence of `word "..." {` and trace braces.
    
    # Regex for start of block:  \w+ "[^"]+" \{
    # or just: \w+ \w+ \{  (if keys aren't quoted? usually they are "name")
    
    start_pattern = re.compile(r'(\w+\s+"[^"]+"\s*\{)')
    match = start_pattern.search(text)
    
    if match:
        start_index = match.start()
        # Simple brace counting
        brace_count = 0
        in_block = False
        captured = []
        
        for i in range(start_index, len(text)):
            char = text[i]
            if char == '{':
                brace_count += 1
                in_block = True
            elif char == '}':
                brace_count -= 1
            
            captured.append(char)
            
            if in_block and brace_count == 0:
                return "".join(captured).strip()
    
    return None

def main():
    print(f"Processing {INPUT_FILE}...")
    success_count = 0
    total_count = 0
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as outfile:
        try:
            with open(INPUT_FILE, 'r', encoding='utf-8') as infile:
                for line in infile:
                    line = line.strip()
                    if not line: continue
                    total_count += 1
                    
                    try:
                        data = json.loads(line)
                        prompt = data.get("prompt", "")
                        completion = data.get("completion", "")
                        
                        code = extract_code(completion)
                        
                        if code:
                            # Create a clean training entry
                            # Format: {"text": "PROMPT: ... COMPLETION: ..."} ? 
                            # Or just the object for further processing. 
                            # The user wants a dataset. usually pairs.
                            
                            # Let's save as similar format to golden:
                            # {"prompt": "...", "completion": "..."} but completion is JUST the code.
                            
                            entry = {
                                "prompt": prompt,
                                "completion": code
                            }
                            outfile.write(json.dumps(entry) + "\n")
                            success_count += 1
                        else:
                            print(f"  [WARN] No code found for prompt: {prompt[:30]}...")
                            # Optional: write the raw one to a debug file?
                            
                    except json.JSONDecodeError:
                        print("  [ERROR] Failed to decode JSON line.")
                        
        except FileNotFoundError:
            print(f"Error: {INPUT_FILE} not found. Run this after downloading the data.")
            return

    print(f"\nDone. Extracted {success_count}/{total_count} entries.")
    print(f"Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
