# /api/quest-proof

Headset proof capture. Every capture call needs a per-run capture token.

**To make a headset proof link:** while signed in as the founder, open
`GET /api/quest-proof/token?runId=<run>` (optional `&ttl=<seconds>`; default 4 h, max 24 h).
It returns `proofToken`, `expiresAt` and `captureQuery`. Then open the headset URL with
`?runId=<run>&proofToken=<token>` (that is, append `captureQuery`). Links without a token,
with another run's token, or with an expired token get 401. Reissue the link when it expires.
