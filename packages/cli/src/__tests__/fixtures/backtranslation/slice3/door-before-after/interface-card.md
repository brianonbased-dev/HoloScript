Behaviour name: "Keypad Door"

State fields others can see: locked, wrongTries, lockedOut

Actions (each answers with allowed and outcome; outcome is one of the names listed):
Each outcome is marked with its kind:
- accepted: the answer has allowed = true. The action may change state and announce events.
- refused: the answer has allowed = false. The action changes nothing and announces nothing.

- enterCode(code) — outcomes: unlocked (accepted), wrong_code (accepted), wrong_code_now_locked_out (accepted), locked_out (refused), already_open (refused)
- lockDoor() — outcomes: locked (accepted), already_locked (refused)
- resetLockout(managerCode) — outcomes: lockout_cleared (accepted), not_locked_out (refused), wrong_manager_code (refused)

Observations (answer only):
- status(viewerId) — answer fields: viewer, locked, locked_out, tries_left

Events (event name: payload fields):
- door_unlocked: wrong_tries_before
- wrong_code: wrong_tries
- door_locked_out: wrong_tries
- door_locked: by
- lockout_cleared: by
