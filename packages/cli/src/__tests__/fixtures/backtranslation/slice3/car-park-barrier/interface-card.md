Behaviour name: "Car Park Barrier"

State fields others can see: carInside, minutes, paid, ticketsIssued

Actions (each answers with allowed and outcome; outcome is one of the names listed):
Each outcome is marked with its kind:
- accepted: the answer has allowed = true. The action may change state and announce events.
- refused: the answer has allowed = false. The action changes nothing and announces nothing.

- arrive() — outcomes: ticket_issued (accepted), car_already_inside (refused)
- wait(minutes) — outcomes: time_passed (accepted), no_car (refused), bad_minutes (refused)
- pay(coins) — outcomes: paid_in_full (accepted), part_paid (accepted), no_car (refused), nothing_due (refused), no_coins (refused)
- leave() — outcomes: barrier_opened (accepted), no_car (refused), payment_due (refused)

Observations (answer only):
- display(viewerId) — answer fields: viewer, car_inside, minutes, owed

Events (event name: payload fields):
- ticket_issued: ticket
- paid_in_full: change
- part_paid: still_owed
- barrier_opened: minutes_parked, paid
