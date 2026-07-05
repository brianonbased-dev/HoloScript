---
"@holoscript/core": patch
---

Fix clean public-registry imports by lazily materializing `VR_TRAITS` in parser error recovery instead of spreading it at module load time.
