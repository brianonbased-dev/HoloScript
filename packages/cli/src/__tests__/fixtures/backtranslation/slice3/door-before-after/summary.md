# Back-translation check: Keypad Door

> Before/after check only. This behaviour was already used in slice 2, so it does not count toward the slice-3 score.

## What was checked

An author agent (Claude (Anthropic), seat claude7, session 670fb727) wrote the program and a list of its rules in plain words. A second agent from a different company (xai) rebuilt the program from the rules and a card of names only, 3 separate times with the same inputs. It never saw the program. The card says, for every answer, whether it is accepted (things may change) or refused (nothing changes).

The rules it worked from:

1. The door starts locked, with no wrong tries counted, and not locked out.
2. The door code is 4721. The manager's code is 9000.
3. Trying a code while the door is locked out is refused, and nothing changes.
4. Trying a code while the door is already open is refused, and nothing changes.
5. The right code opens the door and wipes the count of wrong tries. The announcement that it opened says how many wrong tries there had been before.
6. A wrong code adds one to the count of wrong tries and announces the new count.
7. On the third wrong try, the door locks out instead: it announces the lockout with the count, and answers that the code was wrong and the door is now locked out.
8. Locking the door when it is already locked is refused. Otherwise the door locks, and it announces that the keypad locked it.
9. Clearing a lockout is refused when there is no lockout. It is also refused when the manager's code is wrong.
10. Otherwise the lockout ends, the count of wrong tries goes back to none, and it announces that the manager cleared it. Clearing a lockout does not open the door.
11. Asking for the status tells who asked, whether the door is locked, whether it is locked out, and how many more wrong tries it would take to lock it out: 3 when none have been made, none once it is locked out. Asking changes nothing.
12. When more than one reason to refuse applies, the first one in this list is the answer.

Every rebuild was run in the same 20 made-up situations (5 of them pushed to the exact limits). 6 small mistakes were planted in copies of the correct program. A mistake counts as shown when the rebuild and the faulty program act differently in a situation where the rebuild and the correct program agree. A false alarm is a situation where the rebuild and the correct program act differently.

| Rebuild | Checker tries | Mistakes shown | False alarms (of situations) | Why the false alarms |
|---|---|---|---|---|
| r1 | 1 | 4/6 (67%) | 11/20 | 11 checklist-ambiguity |
| r2 | 1 | 4/6 (67%) | 11/20 | 11 checklist-ambiguity |
| r3 | 2 | 5/6 (83%) | 11/20 | 11 b-error |

Spread across rebuilds: mistakes shown 67% to 83%; false alarms 11 to 11 of 20 situations (tolerance: at most 1 per 20).

### Rebuild r1

- SHOWN: comparison "==" changed to "!=" (9 of 20 situations)
- MISSED: number 3 changed to 4 (0 of 20 situations)
- MISSED: refusal removed: if (state.lockedOut) { ... } (0 of 20 situations)
- SHOWN: true changed to false (9 of 20 situations)
- SHOWN: arithmetic "-" changed to "+" (4 of 20 situations)
- SHOWN: statement removed: emit("door_unlocked", { wrong_tries_before: state.wrongTries }) (8 of 20 situations)
- false alarm (11 situations), checklist-ambiguity: Once the door is locked out, the rebuild answers tries_left with the word "none" instead of the number 0. Rule 11 literally says "none once it is locked out", so the word can be read as the text to show. The same misreading appeared in an earlier slice-2 recording; the rule should say "0".

### Rebuild r2

- SHOWN: comparison "==" changed to "!=" (9 of 20 situations)
- MISSED: number 3 changed to 4 (0 of 20 situations)
- MISSED: refusal removed: if (state.lockedOut) { ... } (0 of 20 situations)
- SHOWN: true changed to false (9 of 20 situations)
- SHOWN: arithmetic "-" changed to "+" (4 of 20 situations)
- SHOWN: statement removed: emit("door_unlocked", { wrong_tries_before: state.wrongTries }) (8 of 20 situations)
- false alarm (11 situations), checklist-ambiguity: Once the door is locked out, the rebuild answers tries_left with the word "none" instead of the number 0. Rule 11 literally says "none once it is locked out", so the word can be read as the text to show. The same misreading appeared in an earlier slice-2 recording; the rule should say "0".

### Rebuild r3

- SHOWN: comparison "==" changed to "!=" (9 of 20 situations)
- SHOWN: number 3 changed to 4 (8 of 20 situations)
- SHOWN: refusal removed: if (state.lockedOut) { ... } (5 of 20 situations)
- SHOWN: true changed to false (9 of 20 situations)
- SHOWN: arithmetic "-" changed to "+" (9 of 20 situations)
- MISSED: statement removed: emit("door_unlocked", { wrong_tries_before: state.wrongTries }) (0 of 20 situations)
- false alarm (11 situations), b-error: The rebuild never opens the door on the right code: it announces the unlock and clears the wrong tries but leaves locked = true. Rule 5 says the right code opens the door. This rebuild differs from the correct program by that one missing line only, so every difference in this recording (later answers, refusals and status) follows from it.

## Verdict

Before/after check only, not part of the slice-3 score. Before (slice 2): 3 of 6 mistakes shown and 18 false alarms in 20 situations, all from reading a wrong code as refused. After, with the card marking a wrong code as accepted: that misreading is gone in all three rebuilds. But the door still has 11 false alarms in 20 situations in every rebuild, from two other causes: two rebuilds answered the word none instead of the number 0 for tries left (the rule says none, so this is the rule wording, which slice 2 already saw once), and one rebuild forgot to open the door on the right code (a rebuild mistake). Mistakes shown went up to 4, 4 and 5 of 6. The card fixed the problem it was aimed at; the door rules still need rule 11 to say 0.
