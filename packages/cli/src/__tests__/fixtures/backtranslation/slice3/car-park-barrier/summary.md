# Back-translation check: Car Park Barrier

## What was checked

An author agent (Claude (Anthropic), seat claude7, session 670fb727) wrote the program and a list of its rules in plain words. A second agent from a different company (xai) rebuilt the program from the rules and a card of names only, 3 separate times with the same inputs. It never saw the program. The card says, for every answer, whether it is accepted (things may change) or refused (nothing changes).

The rules it worked from:

1. The car park starts empty: no car inside, no time counted, nothing paid, and no tickets issued yet.
2. Arriving while a car is already inside is refused.
3. Otherwise a ticket is issued: the car is inside, its time starts from 0, nothing is paid yet, and the ticket is announced with its number (1 for the first ticket ever, then 2, and so on).
4. Waiting when no car is inside is refused. Waiting less than 1 minute is refused. Otherwise the minutes are added to the time parked, and nothing is announced.
5. The price depends on the total time parked: up to half an hour (30 minutes) is free, up to 2 hours (120 minutes) costs 3, up to 4 hours (240 minutes) costs 6, and longer costs 10. What is owed is the price minus what has already been paid.
6. Paying when no car is inside is refused.
7. Paying when nothing is owed is refused.
8. Paying fewer than 1 coin is refused.
9. Paying at least what is owed pays it off: it announces the change given back, and from then on the amount paid is the full price.
10. Paying less than what is owed is not enough to leave: the coins count toward the price, and it announces how much is still owed.
11. Leaving when no car is inside is refused. Leaving while anything is owed is refused. If time passes after paying and the stay reaches a dearer price, the difference is owed before leaving.
12. Otherwise the barrier opens: it announces the minutes parked and the amount paid, and the car park is empty again, with the time and the amount paid back to 0.
13. Looking at the display tells who asked, whether a car is inside, the minutes parked, and what is owed right now. Looking changes nothing.
14. When more than one reason to refuse applies, the first one in this list is the answer.

Every rebuild was run in the same 20 made-up situations (5 of them pushed to the exact limits). 6 small mistakes were planted in copies of the correct program. A mistake counts as shown when the rebuild and the faulty program act differently in a situation where the rebuild and the correct program agree. A false alarm is a situation where the rebuild and the correct program act differently.

| Rebuild | Checker tries | Mistakes shown | False alarms (of situations) | Why the false alarms |
|---|---|---|---|---|
| r1 | 2 | 6/6 (100%) | 0/20 | none |
| r2 | 2 | 6/6 (100%) | 5/20 | 5 b-error |
| r3 | 2 | 6/6 (100%) | 5/20 | 5 b-error |

Spread across rebuilds: mistakes shown 100% to 100%; false alarms 0 to 5 of 20 situations (tolerance: at most 1 per 20).

### Rebuild r1

- SHOWN: comparison "<" changed to ">=" (12 of 20 situations)
- SHOWN: number 1 changed to 2 (2 of 20 situations)
- SHOWN: refusal removed: if (state.carInside) { ... } (14 of 20 situations)
- SHOWN: false changed to true (20 of 20 situations)
- SHOWN: arithmetic "-" changed to "+" (1 of 20 situations)
- SHOWN: statement removed: state.carInside = true (18 of 20 situations)

### Rebuild r2

- SHOWN: comparison "<" changed to ">=" (7 of 20 situations)
- SHOWN: number 1 changed to 2 (1 of 20 situations)
- SHOWN: refusal removed: if (state.carInside) { ... } (9 of 20 situations)
- SHOWN: false changed to true (15 of 20 situations)
- SHOWN: arithmetic "-" changed to "+" (1 of 20 situations)
- SHOWN: statement removed: state.carInside = true (13 of 20 situations)
- false alarm (5 situations), b-error: When a payment is not enough, the rebuild announces the amount still owed as the price minus what has been paid minus the coins again, so the coins are taken off twice. Rule 10 says the coins count toward the price and the announcement says how much is still owed; the rebuild misapplied a clear rule.

### Rebuild r3

- SHOWN: comparison "<" changed to ">=" (7 of 20 situations)
- SHOWN: number 1 changed to 2 (1 of 20 situations)
- SHOWN: refusal removed: if (state.carInside) { ... } (9 of 20 situations)
- SHOWN: false changed to true (15 of 20 situations)
- SHOWN: arithmetic "-" changed to "+" (1 of 20 situations)
- SHOWN: statement removed: state.carInside = true (13 of 20 situations)
- false alarm (5 situations), b-error: When a payment is not enough, the rebuild announces the amount still owed as the price minus what has been paid minus the coins again, so the coins are taken off twice. Rule 10 says the coins count toward the price and the announcement says how much is still owed; the rebuild misapplied a clear rule.

## Verdict

Catch bar met, false-alarm bar met by one rebuild of three. All three rebuilds showed all 6 planted mistakes. The first rebuild matched the correct program in all 20 situations. The second and third made the same slip: when a payment is not enough, they take the coins off twice in the announcement of what is still owed, which caused 5 false alarms in 20 situations each. The rule was clear; the rebuild misapplied it. A part payment was rebuilt as accepted every time, as the card says. Two planted mistakes were shown in only 1 or 2 of 20 situations, so the margin on those is thin.
