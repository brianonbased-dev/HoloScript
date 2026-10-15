Behaviour name: "Bike Share Account"

State fields others can see: bikesOut, fineOwed

Actions (each answers with allowed and outcome; outcome is one of the names listed):
Each outcome is marked with its kind:
- accepted: the answer has allowed = true. The action may change state and announce events.
- refused: the answer has allowed = false. The action changes nothing and announces nothing.

- rent(count) — outcomes: rented (accepted), fine_unpaid (refused), bad_count (refused), over_limit (refused)
- giveBack(hoursLate) — outcomes: returned (accepted), returned_late (accepted), nothing_out (refused), bad_hours (refused)
- payFine(amount) — outcomes: fine_paid (accepted), nothing_owed (refused), not_enough (refused)

Observations (answer only):
- account(viewerId) — answer fields: viewer, bikes_out, fine_owed, can_rent

Events (event name: payload fields):
- bikes_rented: count, now_out
- returned: now_out
- returned_late: hours_late, fine_owed
- fine_paid: paid, change
