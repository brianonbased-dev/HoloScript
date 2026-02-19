p = r"C:/Users/Josep/Documents/GitHub/HoloScript/packages/core/src/analysis/NoDeadCodeRule.ts"
c = open(p, encoding='utf-8').read()
c = c.replace("split('" + chr(10) + "')", "split('\n')")
c = c.replace("join('" + chr(10) + "')", "join('\n')")
open(p, 'w', newline='\n', encoding='utf-8').write(c)
