# Back-translation check: Bike Share Account

## What was checked

An author agent (Claude (Anthropic), seat claude7, session 670fb727) wrote the program and a list of its rules in plain words. A second agent from a different company (xai) rebuilt the program from the rules and a card of names only, 3 separate times with the same inputs. It never saw the program. The card says, for every answer, whether it is accepted (things may change) or refused (nothing changes).

The rules it worked from:

1. The account starts with no bikes out and no fine owed.
2. Renting is refused while any fine is owed.
3. Renting fewer than one bike is refused.
4. A member can have at most 2 bikes out at once. Renting that would go over 2 is refused; reaching exactly 2 is fine.
5. Otherwise the bikes go out, and the rental is announced with how many were rented and how many are now out.
6. Giving a bike back when none are out is refused.
7. Giving a bike back with fewer than 0 hours late is refused.
8. Giving a bike back on time (0 hours late) brings one bike back, and the return is announced with how many are still out.
9. Giving a bike back late brings one bike back and adds a fine of 2 for each hour late. The fine owed never goes above 10 in total; anything past 10 is dropped. The late return is announced with the hours late and the fine now owed.
10. Paying a fine when nothing is owed is refused.
11. Paying less than the whole fine is refused; part payments are not taken.
12. Otherwise the whole fine is paid off, and the payment is announced with the amount of the fine and the change given back.
13. Checking the account tells who asked, how many bikes are out, the fine owed, and whether renting is possible right now (no fine owed and fewer than 2 bikes out). Checking changes nothing.
14. When more than one reason to refuse applies, the first one in this list is the answer.

Every rebuild was run in the same 20 made-up situations (5 of them pushed to the exact limits). 6 small mistakes were planted in copies of the correct program. A mistake counts as shown when the rebuild and the faulty program act differently in a situation where the rebuild and the correct program agree. A false alarm is a situation where the rebuild and the correct program act differently.
Left out: number 0 changed to 1, because it acts exactly like the correct program in all 20 situations, so no check could ever show it.

| Rebuild | Checker tries | Mistakes shown | False alarms (of situations) | Why the false alarms |
|---|---|---|---|---|
| r1 | 2 | 6/6 (100%) | 0/20 | none |
| r2 | 2 | 6/6 (100%) | 0/20 | none |
| r3 | 2 | 6/6 (100%) | 0/20 | none |

Spread across rebuilds: mistakes shown 100% to 100%; false alarms 0 to 0 of 20 situations (tolerance: at most 1 per 20).

### Rebuild r1

- SHOWN: comparison ">" changed to "<=" (19 of 20 situations)
- SHOWN: refusal removed: if (state.fineOwed > 0) { ... } (7 of 20 situations)
- SHOWN: false changed to true (7 of 20 situations)
- SHOWN: arithmetic "+" changed to "-" (15 of 20 situations)
- SHOWN: statement removed: state.bikesOut += count (16 of 20 situations)
- SHOWN: event name "bikes_rented" changed to "bikes_rented_renamed" (16 of 20 situations)

### Rebuild r2

- SHOWN: comparison ">" changed to "<=" (19 of 20 situations)
- SHOWN: refusal removed: if (state.fineOwed > 0) { ... } (7 of 20 situations)
- SHOWN: false changed to true (7 of 20 situations)
- SHOWN: arithmetic "+" changed to "-" (15 of 20 situations)
- SHOWN: statement removed: state.bikesOut += count (16 of 20 situations)
- SHOWN: event name "bikes_rented" changed to "bikes_rented_renamed" (16 of 20 situations)

### Rebuild r3

- SHOWN: comparison ">" changed to "<=" (19 of 20 situations)
- SHOWN: refusal removed: if (state.fineOwed > 0) { ... } (7 of 20 situations)
- SHOWN: false changed to true (7 of 20 situations)
- SHOWN: arithmetic "+" changed to "-" (15 of 20 situations)
- SHOWN: statement removed: state.bikesOut += count (16 of 20 situations)
- SHOWN: event name "bikes_rented" changed to "bikes_rented_renamed" (16 of 20 situations)

## Verdict

Passes both bars. All three rebuilds showed all 6 planted mistakes and raised no false alarms in 20 situations. A late return was rebuilt as accepted every time, which is the kind of point the slice-2 door got wrong; the card now says so. One more planted mistake (a fine above 1 instead of above 0) was left out because fines only come in steps of 2, so it acts exactly like the correct program and no check could ever show it. The three rebuilds were nearly identical, so the spread here says little about how much rebuilds vary.
