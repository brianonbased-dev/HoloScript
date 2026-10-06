# Back-translation check, slice 3: new behaviours, several rebuilds each

The card of names now marks every answer as accepted (things may change) or refused (nothing changes). Measured on behaviours that were not used to tune anything. Each behaviour was rebuilt several times from the same inputs.

| Behaviour | Rebuild | Mistakes shown | False alarms (of situations) | Why the false alarms |
|---|---|---|---|---|
| Bike Share Account | r1 | 6/6 (100%) | 0/20 | none |
| Bike Share Account | r2 | 6/6 (100%) | 0/20 | none |
| Bike Share Account | r3 | 6/6 (100%) | 0/20 | none |
| Car Park Barrier | r1 | 6/6 (100%) | 0/20 | none |
| Car Park Barrier | r2 | 6/6 (100%) | 5/20 | 5 b-error |
| Car Park Barrier | r3 | 6/6 (100%) | 5/20 | 5 b-error |
| Deli Counter Queue | r1 | 6/6 (100%) | 0/20 | none |
| Deli Counter Queue | r2 | 6/6 (100%) | 0/20 | none |
| Deli Counter Queue | r3 | 6/6 (100%) | 0/20 | none |
| **Total** | all | **54/54 (100%)** | **10/180** (1.1 per 20 situations) | |

## Spread across rebuilds

| Rebuild | Mistakes shown (all behaviours) | False alarms per 20 situations |
|---|---|---|
| r1 | 18/18 (100%) | 0.0 |
| r2 | 18/18 (100%) | 1.7 |
| r3 | 18/18 (100%) | 1.7 |

Mistakes shown ranged from 100% to 100% between rebuild rounds; false alarms from 0.0 to 1.7 per 20 situations.

Bar: at least 60% of mistakes shown (target 80%). False-alarm tolerance: at most 1 per 20 situations (a false alarm costs someone a look at rules that were fine; more than one in 20 and people start ignoring the check). 7 of 9 rebuilds were within it.

## Separate before/after check (not part of the score above)

- Keypad Door, rebuild r1: mistakes shown 4/6, false alarms 11/20 (11 checklist-ambiguity)
- Keypad Door, rebuild r2: mistakes shown 4/6, false alarms 11/20 (11 checklist-ambiguity)
- Keypad Door, rebuild r3: mistakes shown 5/6, false alarms 11/20 (11 b-error)

## Verdict

The catch bar is met on new behaviours: 54 of 54 planted mistakes (100%) were shown across 3 new behaviours and 3 rebuilds each, above the 60% minimum and the 80% target, and every rebuild round scored 100%. False alarms: 10 in 180 situations, which is 1.1 per 20. Proposed tolerance: at most 1 per 20 situations, because each false alarm costs someone a look at rules that were fine. Against that, 7 of 9 rebuilds were within it (0 false alarms each) and 2 were not (5 in 20 each, both on the car park, both the same rebuild slip of taking coins off twice in one announcement). Overall 1.1 per 20 is just over the tolerance, so the false-alarm side is close but not met. The spread between rebuild rounds was 0 to 1.7 false alarms per 20 situations. The card change did its job: across 9 new rebuilds and 3 door rebuilds, no answer was ever built with the wrong accepted or refused kind, which caused all 18 door alarms in slice 2. Limits to keep in mind: the same author wrote these programs and rules after learning from slice 2; rebuilds were run at temperature 0 and came out nearly identical, so three rounds understate how much rebuilds can differ; several planted mistakes were shown in only 1 or 2 of 20 situations; and one planted mistake on the bike was left out because it can never act differently. The door before/after check (not scored) shows the old misreading gone but 11 false alarms per 20 from other causes, so a door-like rule written with a word like none still trips the rebuild.
