# Back-translation check: Greenhouse Thermostat

## What was checked

An author agent (Claude (Anthropic), seat claude7, session 670fb727) wrote the program and a list of its rules in plain words. A second agent from a different company (xai, grok-4.3) rebuilt the program from the rules and a list of names only. It never saw the program.

The rules it worked from:

1. The heater starts off. The target is 20 degrees, and the last reading is 20.
2. Every new reading is accepted and remembered as the last reading.
3. If the heater is on and the reading is 2 or more degrees above the target, the heater turns off, and this is announced with the reading.
4. If the heater is off and the reading is 2 or more degrees below the target, the heater turns on, and this is announced with the reading.
5. Any other reading leaves the heater as it was. This gap stops the heater flicking on and off.
6. After a reading, the answer says heating if the heater is now on, and idle if it is now off.
7. A new target below 10 or above 30 degrees is refused. 10 and 30 themselves are fine.
8. Setting the target to what it already is, is refused.
9. Otherwise the target changes, and this is announced with the new target. Changing the target does not switch the heater by itself; the next reading decides.
10. Asking for the status tells who asked, whether the heater is on, the target, and the last reading. Asking changes nothing.
11. When more than one reason to refuse applies, the first one in this list is the answer.

The rebuild passed the checker after 1 try.
A first recording checked with the language checker alone is kept in first-attempt-validate-only/. That checker let through code the headless runner refuses, which is why the checker now also asks the runner.

## Would a mistake in the program be shown?

6 small mistakes were planted in copies of the correct program. A mistake counts as shown when the rebuild and the faulty program act differently in a situation where the rebuild and the correct program agree. Shown: 6 of 6 (100%).

- SHOWN: comparison ">=" changed to "<" (18 of 20 situations)
- SHOWN: number 2 changed to 3 (8 of 20 situations)
- SHOWN: refusal removed: if (target < 10 || target > 30) { ... } (9 of 20 situations)
- SHOWN: false changed to true (20 of 20 situations)
- SHOWN: arithmetic "+" changed to "-" (13 of 20 situations)
- SHOWN: statement removed: state.lastReading = degrees (20 of 20 situations)

## False alarms on the correct program

None. The rebuild and the correct program acted the same in all 20 situations.

## Verdict

Passes. The rebuild acted the same as the author program in all 20 situations on the first try and showed all 6 planted mistakes, including the change to the 2-degree gap that stops the heater flicking on and off.
