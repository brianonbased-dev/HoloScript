p = r"C:/Users/Josep/Documents/GitHub/HoloScript/packages/core/src/analysis/NoDeadCodeRule.ts"
c = open(p, encoding='utf-8').read()
import re
c = open(p, encoding='utf-8').read()
c = c.replace(chr(1), '')
open(p, 'w', newline='\n', encoding='utf-8').write(c)
print('ok')
