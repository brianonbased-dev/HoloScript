import base64
content = open(r"C:/Users/Josep/Documents/GitHub/HoloScript/packages/core/src/analysis/NoDeadCodeRule.ts", encoding="utf-8").read()
print(base64.b64encode(content.encode()).decode())
