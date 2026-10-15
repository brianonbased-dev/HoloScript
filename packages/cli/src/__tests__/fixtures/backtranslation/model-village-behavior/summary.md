# Back-translation proof: model-village/behavior

## What was checked

One agent (Claude (Anthropic), seat claude7, session 670fb727) wrote down, in plain words, what this behaviour does. A second agent from a different company (xai, grok-4.3) rebuilt the behaviour from that list alone. It never saw the original.

The list it worked from:

1. The behaviour is called "Model Village Deterministic Behavior".
2. The village keeps a count of shared water, labelled "water". It starts at 2.
3. The village also keeps one private note, labelled "privateAdapter", holding the text "fixture-private-adapter". Nothing a resident sees may ever contain this text.
4. There are exactly three things the village can be asked to do, named "observe", "contribute" and "reject".
5. "observe" takes one input, labelled "residentId": the resident who is looking.
6. "observe" answers with exactly four labelled parts and nothing else: "resident_id" is the residentId given, unchanged; "location" is the text "commons"; "visible_event_ids" is an empty list; "bounded_memory_hash" is the text "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945".
7. "observe" changes nothing and announces nothing. The answer is the same no matter how much water there is.
8. "contribute" takes one input, labelled "amount": a number.
9. "contribute" adds the amount to the water. It always does this; there is no limit and no check.
10. "contribute" then announces one event named "water_added", carrying one labelled part, "amount", equal to the amount given.
11. "contribute" answers with two labelled parts: "allowed" is yes (true) and "outcome" is the text "water_added".
12. "reject" takes no input. It changes nothing and announces nothing.
13. "reject" answers with two labelled parts: "allowed" is no (false) and "outcome" is the text "blocked_without_world_mutation".

The rebuild passed the language checker after 1 try.

## Did the rebuild act the same?

Both versions were run in 20 made-up village situations (different residents, different amounts of water, refusals mixed in).
They acted the same in every one.

Sanity check: the original run against itself never differed.

## Can the test catch a real mistake?

5 small mistakes were planted in copies of the original. The test caught 5 of 5.

- CAUGHT: arithmetic "+" changed to "-" (19 of 20 situations showed it)
- CAUGHT: number 2 changed to 3 (20 of 20 situations showed it)
- CAUGHT: true changed to false (20 of 20 situations showed it)
- CAUGHT: statement removed: state.water = state.water + amount (19 of 20 situations showed it)
- CAUGHT: event name "water_added" changed to "water_added_renamed" (20 of 20 situations showed it)

## Verdict

Slice 1 works end to end and supports going on to 10 behaviours, with one honest limit. The test is not blind: the original matched itself and a comment-only copy in all 20 situations, and all 5 planted mistakes were caught (two of them were missed in 1 of 20 situations, where no water was actually added, so situation variety matters). Grok rebuilt the behaviour on the first try from the checklist alone and acted the same as the original in all 20 situations. That means zero false alarms, but also that this behaviour was too small to test false alarms: the checklist had to name every label, number and fixed text exactly, so the rebuild was close to copying a dictated list. The next behaviours must include real decisions (an if, a limit, a refusal that depends on state) before the false-alarm rate means anything.

Weakest link: The checklist, not the machinery. For the rebuild to plug into the same runner, the checklist must carry exact action names, input labels, answer labels and fixed texts (like the memory fingerprint). For a tiny behaviour that turns plain language into dictation, so agreement proves little. Second: the situation maker is written for this one village plan; each new behaviour needs its own, or a generic one derived from the behaviour's actions.
