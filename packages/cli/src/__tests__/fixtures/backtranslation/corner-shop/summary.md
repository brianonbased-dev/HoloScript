# Back-translation check: Corner Shop

## What was checked

An author agent (Claude (Anthropic), seat claude7, session 670fb727) wrote the program and a list of its rules in plain words. A second agent from a different company (xai, grok-4.3) rebuilt the program from the rules and a list of names only. It never saw the program.

The rules it worked from:

1. The shop starts with 5 items on the shelf and no money in the till.
2. Items cost 4 each. Buying 3 or more at once makes them 3 each instead.
3. Buying less than one item is refused.
4. Buying more items than are on the shelf is refused.
5. Buying is refused when the money handed over is less than the price.
6. Otherwise the items leave the shelf, the price goes into the till, the sale is announced with how many items and the price, and the answer tells the customer their change.
7. Restocking less than one item is refused.
8. The shelf holds at most 12 items. Restocking that would go over 12 is refused; filling it to exactly 12 is fine.
9. Otherwise the items go on the shelf and the restock is announced with how many were added.
10. Checking the inventory tells who asked, how many items are on the shelf, and how much money is in the till. Checking changes nothing.
11. When more than one reason to refuse applies, the first one in this list is the answer.

The rebuild passed the checker after 2 tries.
A first recording checked with the language checker alone is kept in first-attempt-validate-only/. That checker let through code the headless runner refuses, which is why the checker now also asks the runner.

## Would a mistake in the program be shown?

6 small mistakes were planted in copies of the correct program. A mistake counts as shown when the rebuild and the faulty program act differently in a situation where the rebuild and the correct program agree. Shown: 6 of 6 (100%).

- SHOWN: comparison "<" changed to ">=" (20 of 20 situations)
- SHOWN: number 1 changed to 2 (13 of 20 situations)
- SHOWN: refusal removed: if (quantity < 1) { ... } (12 of 20 situations)
- SHOWN: false changed to true (12 of 20 situations)
- SHOWN: arithmetic "*" changed to "/" (11 of 20 situations)
- SHOWN: statement removed: state.stock -= quantity (18 of 20 situations)

## False alarms on the correct program

None. The rebuild and the correct program acted the same in all 20 situations.

## Verdict

Passes. The rebuild acted the same as the author program in all 20 situations and showed all 6 planted mistakes, each in the same situations where the mistake really changes something. It needed one repair round because its first try used a private working value the runner does not allow.
