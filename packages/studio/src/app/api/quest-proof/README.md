# /api/quest-proof

Headset proof capture. Every capture call needs a per-run capture token.

**To make a headset proof link:** while signed in as the founder, open
`GET /api/quest-proof/token?runId=<run>` (optional `&ttl=<seconds>`; default 4 h, max 24 h).
It returns `proofToken`, `expiresAt` and `captureQuery`. Then open the headset URL with
`?runId=<run>&proofToken=<token>` (that is, append `captureQuery`). Links without a token,
with another run's token, or with an expired token get 401. Reissue the link when it expires.

## Recording rules (Release gate F1/F3, key)

- Receipts are recorded by `POST /api/quest-proof?runId=<run>` only, with the token in the
  `x-quest-proof-token` header. `GET ?record=1` is refused (405) and writes nothing.
- POST needs an `Origin` that is the page's own origin (this covers HoloTunnel `/t/<id>/` and
  `/live/` links) or one on the Studio CORS allowlist. No Origin: 403.
- The token is checked before the body is read; the body is streamed and cut off at 16 KB (413),
  whatever Content-Length says.
- The token key is HKDF-SHA256 of `NEXTAUTH_SECRET` (info `quest-proof-capture-v1`). There is no
  separate capture variable; without `NEXTAUTH_SECRET`, minting and capture are refused.
- `/task` answers with `{ ok, taskId, title, exitCode }` only; script output and error details are
  logged server-side.

## Token transport and Founder Console readers (#607 follow-up)

- The API reads the capture token ONLY from the `x-quest-proof-token` header, for POST and for
  read-back GET. A `?proofToken=` query is ignored (401). The headset link still carries
  `?proofToken=` so the page can bootstrap; the page keeps it in sessionStorage and strips it
  from the address bar with `history.replaceState`.
- "Own origin" for the Origin check is the configured Studio URL (`NEXTAUTH_URL`, else
  `NEXT_PUBLIC_STUDIO_URL`), never the Host or X-Forwarded-Host headers.
- The HKDF salt is a fixed public constant (`QUEST_PROOF_HKDF_SALT`).
- `inbox`, `next-actions` (GET and POST), `board` and `decide` are founder-only
  (401/403 before the team key is read, no upstream call) and are off the public paths list.
  Their only caller is the same-origin Founder Console.
