# Idea Seed

Title: .hs connect/execute wiring topology validator — semantic compile pass

What might be valuable:
The HSP101 parser fix (2026-06-10) chose to parse `connect A.event -> B.method`
and `execute target() schedule` as raw-text AST nodes (harvest approach) rather
than fully parsing the dotted-path chains and scheduling grammar. A semantic
validation pass could:
- Resolve `A.event` as an object-id + signal pair and check that `A` exists in the
  same composition and declares `event` in its emit() calls
- Resolve `B.method` and verify it is a declared `function` in object B
- Validate `execute` schedule expressions: `every <N>ms`, `every <N>s`,
  `repeat forever`, `once at start`
- Emit precise errors like "guard_captain has no method raise_alarm_typo (did you
  mean raise_alarm?)" instead of silently passing unknown wiring
- Power IDE completion and hover docs for connect statements

Why it is not being pursued now:
The compile-phase wiring validator is out of scope for the HSP101 parser hotfix.
The fix must be non-breaking and the raw-text harvest keeps all downstream
compilers (R3F, Babylon, Unity) working without changes. Semantic validation is
a later compile pass, gated on the object-catalog builder (which needs a full
AST walk to extract declared signals and methods before wiring can be validated).

Source: HoloScriptPlusParser.ts parseHsConnectStatement + parseHsExecuteStatement
        Task: task_1781055824225_i8un (HSP101 DOT/ARROW fix, 2026-06-10)
