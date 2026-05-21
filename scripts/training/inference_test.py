import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

BASE_MODEL = "/var/tmp/phi-3.5-mini"
ADAPTER_PATH = "/var/tmp/brittney-expanded"

print("Loading model...")
tokenizer = AutoTokenizer.from_pretrained(ADAPTER_PATH)
model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL, 
    torch_dtype=torch.bfloat16, 
    device_map="auto"
)
model = PeftModel.from_pretrained(model, ADAPTER_PATH)

prompt = "<|user|>\nCreate a floating island with a waterfall<|end|>\n<|assistant|>\n"
inputs = tokenizer(prompt, return_tensors="pt").to("cuda")

print("Generating...")
outputs = model.generate(**inputs, max_new_tokens=300, temperature=0.7, do_sample=True)
print("\n" + "="*40)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
print("="*40)
