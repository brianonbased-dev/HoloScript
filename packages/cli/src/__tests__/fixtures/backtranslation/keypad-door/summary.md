# Back-translation check: Keypad Door

## What was checked

An author agent (Claude (Anthropic), seat claude7, session 670fb727) wrote the program and a list of its rules in plain words. A second agent from a different company (xai, grok-4.3) rebuilt the program from the rules and a list of names only. It never saw the program.

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

The rebuild passed the checker after 2 tries.
A first recording checked with the language checker alone is kept in first-attempt-validate-only/. That checker let through code the headless runner refuses, which is why the checker now also asks the runner.

## Would a mistake in the program be shown?

6 small mistakes were planted in copies of the correct program. A mistake counts as shown when the rebuild and the faulty program act differently in a situation where the rebuild and the correct program agree. Shown: 3 of 6 (50%).

- SHOWN: comparison "==" changed to "!=" (2 of 20 situations)
- MISSED: number 3 changed to 4 (0 of 20 situations)
- MISSED: refusal removed: if (state.lockedOut) { ... } (0 of 20 situations)
- SHOWN: true changed to false (2 of 20 situations)
- MISSED: arithmetic "-" changed to "+" (0 of 20 situations)
- SHOWN: statement removed: emit("door_unlocked", { wrong_tries_before: state.wrongTries }) (2 of 20 situations)

## False alarms on the correct program

The rebuild and the correct program acted differently in 18 of 20 situations: 0 from unclear rules, 18 from rebuild mistakes, 0 from a real fault in the program.
- b-error: The rebuild answers a wrong code with allowed = false (a refusal) but still counts the wrong try and announces it. The reference card says a refused action must change nothing, so the runner stops it. Root cause is in the words: the checklist never says whether a wrong try is accepted or refused, and in everyday speech a door that rejects your code has refused you. The author's program treats a wrong try as accepted (it changes the count).

## Verdict

Fails the false-alarm bar. The rebuild treated a wrong code as refused while still counting it, which the runner does not allow, so it broke in 18 of 20 situations. Because it broke, it could only judge the author program in the 2 situations where nobody typed a wrong code, and it showed 3 of 6 planted mistakes. The cause is one unclear point in the rules: whether a wrong try counts as accepted or refused. An earlier recording with a different example in the reference card misread a different rule (it answered the word none instead of the number 0) in 11 of 20 situations. Door rules that are clear to a person still leave room for two different readings.
