# Back-translation check: all behaviours

| Behaviour | Rebuild tries | Mistakes shown | False alarms (of situations) | Why the false alarms |
|---|---|---|---|---|
| Keypad Door | 2 | 3/6 (50%) | 18/20 | 18 b-error |
| Corner Shop | 2 | 6/6 (100%) | 0/20 | none |
| Greenhouse Thermostat | 1 | 6/6 (100%) | 0/20 | none |
| **Total** | | **15/18 (83%)** | **18/60** (6.0 per 20 situations) | |

Bar: at least 60% of mistakes shown (target 80%), and a false-alarm rate a person would put up with.

## Verdict

The catch bar is met: 15 of 18 planted mistakes (83%) would have been shown, above the 60% minimum and the 80% target. The false-alarm side is mixed and decides the verdict: two behaviours had no false alarms in 20 situations each, but the door had 18 of 20, all from one point the rules left open (is a wrong try accepted or refused?). Averaged that is 6 false alarms per 20 situations, which a person would not put up with; per behaviour it is 0, 0 and 18. So the approach works when the rules are clear, and fails loudly, not quietly, when they are not: every door alarm traces to one unclear sentence that a person can fix. The weakest link is still the checklist. The next step is to make the interface card say, for each outcome name, whether it is accepted or refused (that is a name-level fact, not logic), then measure again on new behaviours rather than these ones. Rebuild runs also varied: the same door rules produced a different misreading when only the reference example changed, so one recording per behaviour is not enough to state a false-alarm rate with confidence.
