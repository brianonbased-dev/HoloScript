# WISDOM.md - Lines of Wisdom

Short, plain principles learned the hard way. Every agent and human reads this before working, so we understand faster and guess less.

- **How to use it:** read it once before you start, and come back when you're unsure. If a line and a rule in AGENTS.md disagree, AGENTS.md wins until someone fixes this file.
- **It grows:** every mistake, correction or near miss should leave a line behind.
- **How to add a line:** one sentence (two at most), plain words, plus a short *learned from* cite (PR, date, card or rule source). Put it in the right group and don't repeat a line that's already here.

## Purpose and people

- **Measure by impact on people's lives.** A feature counts when it makes someone's day better, easier or transformative, not when it's clever. *(Joseph, 2026-10-22)*
- **Hide complexity, never meaning.** Remove the machinery, not the agency: people still decide what they want, who it's for, and what is shared or stored. *(Hololand rule, 2026-10-05)*
- **Technology stays legible and refusable.** If a person can't understand what it does or say no to it, it isn't done. *(HoloScript ethic, 2026-10-05)*
- **No one should need to read code to challenge behavior.** Explain what happened in words the affected person can question. *(Ethic commitment 4, 2026-10-05)*
- **We are customer zero.** If HoloScript can't run our own projects, it isn't ready for anyone else's. *(Joseph, 2026-10-22 customer-zero plan)*
- **Adding HoloScript should improve what people already do.** Never make a newcomer start over to get value. *(Joseph, 2026-10-22)*
- **Most people start from something, not a blank slate.** Analyze what they already have first, and ask only where there's no reference. *(Joseph, 2026-10-22)*
- **Training on the whole internet doesn't fix what breaks live; the value is in the nuances and caveats learned from running real systems.** *(Joseph, 2026-10-22; shared graph slot, Windows-only test failures found only by running)*
- **Consent gates likeness.** A face, voice or body renders only through a grant the checker can see; without one, show the generic avatar. *(Consent rule, 2026-10-14)*

## Language

- **Readability is a floor, not a ceiling.** Plain enough to read is the minimum, not the goal. *(Joseph standing rule)*
- **Name the rung.** "Native" or "sovereign" must say what is actually owned: code, kernels, weights or hardware. *(NORTH_STAR.md)*
- **Generating someone else's code is bridge evidence, not ownership.** Emitting C++ or TypeScript doesn't mean HoloScript owns that layer yet. *(NORTH_STAR.md, language identity)*
- **Matching an outside tool is parity, not better.** "Better" needs a capability nobody else has shown or a real benchmark that shows the edge. *(NORTH_STAR.md, Prove better)*
- **Rules that matter live where the checker can see them.** A rule hidden in an unchecked body isn't enforced, it's hoped for. *(Consent grant gap, .hsplus bodies, 2026-10-14)*
- **Say what's implemented and name the gap.** An honest gap beats a confident overclaim every time. *(NORTH_STAR.md)*

## Money and trust

- **Every route names its payer.** If you can't say who pays for a call, it's a free path. *(Free-path cards 1-7, Oct 2026)*
- **No free paths.** A paid capability reached without the caller paying is a bug, even if it looks like a convenience. *(Joseph standing rule; #617, #620, #625)*
- **A service key alone pays for no one.** Calls must carry the user's identity, or they bill the house. *(card-callmcptool-no-headers, 2026-10-22)*
- **Forwarding identity isn't charging.** A header that names the user only matters if the server that receives it actually deducts. *(#625 review, absorb_extract_knowledge has no billing)*
- **Retries must not double-charge.** A charge needs a server-side id so a reload after a dropped response is recognized. *(#620 review N1, #623)*
- **Knowledge is only sellable if it's owned, isolated and paid for per call.** *(Joseph, 2026-10-22; agent knowledge market goal; #617-#630 absorb stack)*
- **Deduct atomically or not at all.** Check-then-charge in two steps lets two requests spend the same credit. *(card-freepath-7 holodaemon atomic deduct)*
- **A fix can break the paying path.** Before shipping a refusal, check which legitimate button stops working. *(#617/#623 release prep, 2026-10-22)*

## Security

- **Refuse before you fetch.** Check who's asking and what they're asking for before any network call or paid work runs. *(#625, #627)*
- **Nothing is shared unless it's named shared.** Anything kept in memory between requests has to belong to one owner. *(#626, shared activeGraph)*
- **One uniform refusal.** Every ownership failure returns the same answer, so refusals don't leak what exists. *(workspaceOwner.ts, #620)*
- **Realpath both sides.** Resolve the root and the target before comparing paths, or a symlink walks you out. *(#620, HoloHeal runner tests)*
- **A user-supplied URL is an attack until proven otherwise.** Check every resolved IP, pin it, and re-check every redirect hop. *(#625 safeFetchPage)*
- **Keep one copy of the guard.** Two SSRF checks drift apart; route every fetch through the one that was reviewed. *(#626 refused url instead of duplicating)*
- **Fix the class, not the instance.** When you find one hole, search for every other caller of the same pattern. *(#627, N3 ingestObservedPage callers)*
- **Secrets go in masked boxes, never in chat.** Nobody pastes a key into a conversation, a log or a commit. *(GitHub App setup, 2026-10-05)*
- **Least power by default.** A token or app gets only the scopes its job needs. *(holoscript-release-gate app, statuses only)*
- **Nothing consequential acts beyond its declared power.** If it wasn't declared, it isn't allowed. *(Ethic commitment 3, 2026-10-05)*

## Evidence and review

- **Nothing claims more than it proves.** Every status word needs evidence you can point to. *(Ethic commitment 2, 2026-10-05)*
- **Never trust a test you didn't watch run.** "Passed locally" is a claim; a pass recorded on that exact commit is evidence. *(#626, #627, no CI on head)*
- **A fix that changes the head starts a fresh review.** Approval belongs to one exact commit, not to the PR. *(Merge rules, 2026-10-05; #620 rework)*
- **"Done" expires.** Rerun the evidence before you repeat a completion label. *(AGENTS.md, DONE Claim Revalidation)*
- **A dispatch with no seal never counts.** Only a sealed HoloCI run on the exact head is "green." *(Release fast lane rule, 2026-10-05)*
- **Check the platform before blaming the code.** Run a failing test on a second OS before calling it a hole. *(HoloHeal symlink tests, Windows-only, 2026-10-22)*
- **Say what you didn't check.** A review that names its gaps is worth more than one that sounds complete. *(Mapping review notes, #625-#627)*
- **Stale PR bodies lie.** Update the description whenever the diff changes. *(#621 stale trailing-slash note)*
- **Nothing silently disappears.** Removing behavior gets a note, a test or a refusal message, never a quiet gap. *(Ethic commitment 1, 2026-10-05)*
- **Know which copy you're reading.** Confirm the machine, path and commit before quoting a file. *(Paper 5 abstract, Work laptop copy, 2026-10-22)*

## Shipping

- **No lock-in, even to our own agents.** Our own scripted pipeline is the main path; an agent is a second reviewer, and nothing ships only because an agent ran it. *(Joseph, 2026-10-16)*
- **Fast lane for docs and tests, slow lane for power.** Auth, money, file access, config, CI, dependencies and publishing always get a second seat. *(Merge rules, 2026-10-05)*
- **Merge order is part of the fix.** Write down what must land first and why, in the PR body. *(#617 -> #623 -> #620)*
- **A rebase onto changed code is a rewrite.** Treat it as new work with a new review. *(#620 onto #617)*
- **Two PRs touching the same line need a hand merge and a fresh seat.** *(#618/#621 conflict)*
- **Label the bridge.** Shipping on an outside tool is allowed only with a label and a removal condition written the same day. *(NORTH_STAR.md)*
- **Push means deploy.** Validate before you push anything Railway watches. *(AGENTS.md git workflow)*

## Hardware and cost

- **Own hardware first.** HoloCI, laptops, Jetson and our fleet come first; anything else is a labeled fallback. *(Standing rule, 2026-10-06)*
- **The shared box is not a build farm.** Heavy builds and reviews go to user hardware; the box hit load ~1,600 when we forgot. *(2026-10-16 overload)*
- **Check disk before big work.** A full C: drive stops every check and merge behind it. *(Work laptop full, 2026-09-27)*
- **A health check that hangs is a failure, not a pending.** Give probes a timeout that fits the thing being probed. *(Laptop probe /health, 2026-08-24)*
- **Never hang.** A task either finishes or moves on with a plain reason. *(Jetson stall bar, 2026-10-05)*
- **Paid models are a choice, not a default.** Use free or owned compute unless someone says otherwise. *(Standing rule)*

## Working as agents

- **Find out what's already there before you ask.** Read what's on record first, and only ask when there's no reference. *(Joseph, 2026-10-22)*
- **Don't give the human homework.** Build the list from evidence yourself, then bring back the answer. *(Joseph, 2026-10-22)*
- **Missing docs make agents guess.** When you had to guess or ask, write the doc that would have answered it. *(Customer-zero gap map, 2026-10-22)*
- **Expand the vision, don't take it literally.** Read what the person is reaching for, not just the words. *(CoS standing rule, 2026-10-16)*
- **Stage explicit paths only.** In a shared tree, `git add -A` takes someone else's work. *(AGENTS.md git rules)*
- **Draft, then ask.** Anything that sends, posts, merges or deletes waits for an explicit yes. *(Standing approval rule)*
- **A blocked action is an answer.** Don't route around a refusal; report it. *(Agent safety rule)*
- **Scratch goes in /.scratch/.** Durable evidence gets promoted to a tracked home. *(AGENTS.md scratch output)*
- **Leave a card when you stop short.** An unfinished finding written down beats one remembered. *(grok-cards, Oct 2026)*
- **The system learns humility as it grows.** When you're wrong, say so plainly and add a line here. *(Ethic commitment 5, 2026-10-05)*
