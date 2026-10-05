Behaviour name: "Keypad Door"

State fields others can see: locked, wrongTries, lockedOut

Actions (each answers with allowed and outcome; outcome is one of the names listed):
- enterCode(code) — outcomes: unlocked, wrong_code, wrong_code_now_locked_out, locked_out, already_open
- lockDoor() — outcomes: locked, already_locked
- resetLockout(managerCode) — outcomes: lockout_cleared, not_locked_out, wrong_manager_code

Observations (answer only):
- status(viewerId) — answer fields: viewer, locked, locked_out, tries_left

Events (event name: payload fields):
- door_unlocked: wrong_tries_before
- wrong_code: wrong_tries
- door_locked_out: wrong_tries
- door_locked: by
- lockout_cleared: by
