p = r"C:/Users/Josep/Documents/GitHub/HoloScript/packages/core/src/__tests__/DeadCode.test.ts"
c = open(p, encoding='utf-8').read()
c = c.replace('\\!', '?')
open(p, 'w', newline='\n', encoding='utf-8').write(c)
