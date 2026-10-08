# Rule conflicts

`holoscript validate` (and the MCP `validate_holoscript` tool) warns when two
rules in one action can both apply at the same moment and say different things,
and nothing but their order in the file decides which one wins. The warning is a
question for whoever owns the rules, not an error: the file stays valid.

## What it looks like

The founder's heat-pump rules, written one rule per block
(`packages/cli/src/__tests__/fixtures/rule-conflicts/heat-pump-rules.hsplus`):

```hsplus
// rule 14: backup heat strips, only when the backup setting is on, while heat is called for:
// on at 3 or more degrees below the setting, off at less than 3 below
if (state.heatCall) {
  state.backupHeating = state.backup == "on" && room <= state.setPoint - 3
} else {
  state.backupHeating = false
}
// rule 15: below the outdoor cut-off, heat comes only from the backup strips
if (state.heatCall && outdoor < state.cutoff) {
  state.backupHeating = state.backup == "on"
}
```

```text
✓ Validation passed with 1 warnings:
  Line 148:1: Rule 14 and rule 15 both apply when reading is given room 69 and
  outdoor 24, while heat call is yes, backup is on, set point is 70 and cutoff
  is 25. They say different things: rule 14 turns backup heating off, but rule
  15 turns it on. Which should win? As written, rule 15 wins only because it
  comes later.
    Fix: If rule 15 should win, write "// rule 15 wins over rule 14" next to the
    rules. If rule 14 should win, change the rules so rule 15 does not apply then.
```

The moment in the warning (room 69, outdoor 24, ...) is a real one: the check
replays the action at that moment before it reports, and its tests run the same
moment in the headless runtime with each rule winning in turn.

## What counts as a conflict

A **rule** is an assignment to `state.*` inside one or more `if` blocks. Two
rules conflict when all of these hold:

1. they write the same state in the same action;
2. both can apply in one call (their conditions can be true together, for some
   state the program can actually reach and some inputs);
3. at that moment they set different values;
4. neither one was placed to decide the other.

These already decide which rule wins, so they are never reported:

| Shape                                   | Example                                            |
| --------------------------------------- | -------------------------------------------------- |
| `else` / `else if` chain                | `if (a) { x = 1 } else if (b) { x = 2 }`           |
| early `return` (first match wins)       | `if (a) { x = 1; return {...} }` then `if (b) ...` |
| a condition that excludes the other     | `if (b && !a) { x = 2 }`                           |
| one rule nested inside the other        | `if (a) { x = 1; if (b) { x = 2 } }`               |
| a default that a rule overrides         | `x = 0` then `if (a) { x = 1 }`                    |
| a later rule that builds on the earlier | `if (b) { x += 2 }`                                |
| a declared priority                     | `// rule 15 wins over rule 14`                     |

## Naming rules and recording an answer

- A comment that starts with `rule <name>` (`// rule 14`, `// rules 9, 11 and 12:`)
  names the statement on the next code line, and everything inside it. Without
  names, the warning gives line numbers.
- `// rule A wins over rule B` records the owner's answer. If the program already
  lets A win, the check stays quiet. If the program lets B win, you get a
  `RULE-PRIORITY-MISMATCH` warning: "You said rule A wins over rule B, but as
  written rule B wins when ...".

Example: the founder ruled on 2026-10-07 that below the cut-off the strips run
whenever heat is called for ("strips run, I believe"). The ruled copy
(`heat-pump-rules-founder-ruling.hsplus`) carries
`// rule 15 wins over rule 14`, and validates without a warning.

## What it can and cannot see

- **Decided exactly:** comparisons that add, subtract, or multiply by constants
  over numbers in state and inputs (`room <= state.setPoint - 3`), yes/no values,
  and equality of text (`mode == "heat"`). `?:`, `min`, `max` and `abs` are split
  into cases.
- **State ranges** come from every action in the file, starting from the declared
  state: if `setSwing` refuses anything outside 1 to 3, the check never invents a
  moment where swing is 0.
- **Anything else** (other calls, multiplying two values, loops) becomes an
  unknown. An unknown can make the check miss a conflict; it cannot make it report
  a false one, because every report is replayed first. Actions with loops or other
  statements outside the deterministic action subset are skipped, never guessed.
- **One action at a time.** Rules in different actions run in different calls, so
  they never apply at the same moment.
- **A decision already in the code is not questioned.** The original heat-pump
  program nests rule 14 under "not below the cut-off". That is a decision (made by
  whoever translated the rules), so it is not reported. Write rules one per block
  when you want the check to ask the owner.

API: `findRuleConflicts(source)` and `ruleConflictDiagnostics(...)` from
`@holoscript/core` (`packages/core/src/validation/RuleConflictChecker.ts`).
