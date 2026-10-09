# Back-translation check: Deli Counter Queue

## What was checked

An author agent (Claude (Anthropic), seat claude7, session 670fb727) wrote the program and a list of its rules in plain words. A second agent from a different company (xai) rebuilt the program from the rules and a card of names only, 3 separate times with the same inputs. It never saw the program. The card says, for every answer, whether it is accepted (things may change) or refused (nothing changes).

The rules it worked from:

1. The queue starts open for joining, with nobody waiting. Tickets are numbered from 1.
2. Joining after joining has been closed is refused.
3. Joining as anything other than "normal" or "priority" is refused.
4. The queue holds 5 people. When 5 are already waiting, a normal customer joining is refused, and so is a priority customer if everyone waiting is priority.
5. When 5 are waiting and at least one of them is normal, a priority customer still gets in: one normal customer is bumped out of the queue, which is announced, and then the priority customer joins as in the next rule.
6. Joining adds the customer to the waiting count for their kind and announces the ticket number and kind. The next ticket number then goes up by one.
7. Serving when nobody is waiting is refused.
8. Priority customers are served before normal ones. But count how many priority customers have been served in a row since the last normal customer was served (or since the start). Once that count is 2 or more and a normal customer is waiting, the next one served is normal instead. Serving announces the kind of customer now being served.
9. Giving up as anything other than "normal" or "priority" is refused. Giving up when nobody of that kind is waiting is refused. Otherwise one customer of that kind leaves the queue, and it is announced with the kind.
10. Closing joining when it is already closed is refused. Otherwise joining closes, which is announced with how many are still waiting. People already waiting can still be served.
11. Looking at the board tells who asked, how many normal and how many priority customers are waiting, whether joining is open, and the next ticket number. Looking changes nothing.
12. When more than one reason to refuse applies, the first one in this list is the answer.

Every rebuild was run in the same 20 made-up situations (5 of them pushed to the exact limits). 6 small mistakes were planted in copies of the correct program. A mistake counts as shown when the rebuild and the faulty program act differently in a situation where the rebuild and the correct program agree. A false alarm is a situation where the rebuild and the correct program act differently.

| Rebuild | Checker tries | Mistakes shown | False alarms (of situations) | Why the false alarms |
|---|---|---|---|---|
| r1 | 2 | 6/6 (100%) | 0/20 | none |
| r2 | 2 | 6/6 (100%) | 0/20 | none |
| r3 | 2 | 6/6 (100%) | 0/20 | none |

Spread across rebuilds: mistakes shown 100% to 100%; false alarms 0 to 0 of 20 situations (tolerance: at most 1 per 20).

### Rebuild r1

- SHOWN: comparison "!=" changed to "==" (16 of 20 situations)
- SHOWN: number 5 changed to 6 (1 of 20 situations)
- SHOWN: refusal removed: if (!state.open) { ... } (4 of 20 situations)
- SHOWN: true changed to false (20 of 20 situations)
- SHOWN: arithmetic "+" changed to "-" (1 of 20 situations)
- SHOWN: statement removed: state.waitingNormal -= 1 (1 of 20 situations)

### Rebuild r2

- SHOWN: comparison "!=" changed to "==" (16 of 20 situations)
- SHOWN: number 5 changed to 6 (1 of 20 situations)
- SHOWN: refusal removed: if (!state.open) { ... } (4 of 20 situations)
- SHOWN: true changed to false (20 of 20 situations)
- SHOWN: arithmetic "+" changed to "-" (1 of 20 situations)
- SHOWN: statement removed: state.waitingNormal -= 1 (1 of 20 situations)

### Rebuild r3

- SHOWN: comparison "!=" changed to "==" (16 of 20 situations)
- SHOWN: number 5 changed to 6 (1 of 20 situations)
- SHOWN: refusal removed: if (!state.open) { ... } (4 of 20 situations)
- SHOWN: true changed to false (20 of 20 situations)
- SHOWN: arithmetic "+" changed to "-" (1 of 20 situations)
- SHOWN: statement removed: state.waitingNormal -= 1 (1 of 20 situations)

## Verdict

Passes both bars. All three rebuilds showed all 6 planted mistakes and raised no false alarms in 20 situations, including the fairness rule (no more than two priority customers in a row while a normal one waits) and a priority customer bumping a normal one from a full queue, which the card marks as accepted. Three of the planted mistakes were shown in only 1 of 20 situations each, so the margin is thin: fewer or different situations could have missed them.
