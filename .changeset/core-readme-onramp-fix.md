---
"@holoscript/core": patch
---

Fix the README § Usage on-ramp so a fresh `npm install @holoscript/core` user's
documented first use runs end-to-end. `HoloCompositionParser` is invoked with
`.parse()` (the class has no `.parseHolo()` method — that's a standalone export),
the `const result` collision is deduped to `const composition`, and the compile
example uses `composition.ast` instead of an undefined `ast`. Previously the
second example crashed with `TypeError: parseHolo is not a function`. The
`cold-repro-onramp` falsifier now probes the full on-ramp (HoloScriptPlusParser +
HoloCompositionParser + UnityCompiler, ESM and CJS) and runs `--local`
pre-publish, so a broken on-ramp can no longer ship. (task_1780207572551_ax8w)
