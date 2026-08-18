# Bravura — the teaching plan for someone who has never conducted

Source: multi-agent design pass 2026-08-14, driven by the founder verdict
"its all built like an actual maestro is playing like im supposed to know all
these things" and by gaze measured on his live headset (59% of his time reading
the panel, 8.7% watching the drum). Not yet implemented — this is the spec.

## Per lesson

### hold — "Freeze the Drum — Then Let It Go"

**Goal.** You can stop the drum dead just by lifting your hand high and holding still, keep it stopped as long as you like, wipe it to silence with one fast flick, and start it again when you're ready.

**The ball shows.** The ball bounces on the drum in time with the drum you can hear, then rises well above its own bouncing and stops dead in the air — and the drum stops with it; it sits visibly frozen, snaps sideways once and the last ringing dies, the room goes silent for a second, and then it lifts slowly off the drum head and drops, and the drum starts again on the landing.

**Narration while it shows.** Watch — it stops high, and the drum stops with it.

**Path (implementable).** Frame: the existing guide-ball frame — x=0, z=-1.35, drum head at y=0.95 m, ball scale 0.05. Ball period is driven from the lesson's OWN target of 90 BPM (period 0.6667 s), NEVER from conductor.ensembleBpm — the current draw in main.ts:229 derives the period from the ensemble, which in follow mode follows the student, so a wobbling beginner would watch a wobbling model. Landings are scheduled from the same click event's audibleAt that schedules the drum sound (gate-3 rule: what you see IS what you hear). guideBpm() must be unlocked for id==='hold' — today it hard-returns null unless current==='steady' && beats<4, so this lesson has never had a demonstration. Throughout the demo: no timer, no counter, no score, learner input ignored and not graded. Critically, the demo drives the REAL mechanism — it calls the same seq.pause() / seq.stop() / bus ramp / armDownbeat() / seq.start() the learner's own gesture will call — so he is watching the actual thing, not an animation of it.

A — BOUNCING (t=0.000 to 2.667 s). x=0, z=-1.35 constant. y(t) = 0.95 + 0.42*sin(PI*phase), phase = frac(t / 0.6667). The ball touches the drum head (y=0.95) at t=0.000, 0.667, 1.333, 2.000, 2.667 — five landings, each exactly on an audible drum strike. Tops at y=1.37 midway between.

B — THE LIFT AWAY (t=2.667 to 3.333 s, one beat). From the fifth landing the ball rises and does not come back down. y = 0.95 + 0.67*sin((PI/2)*u), u = (t-2.667)/0.6667 — eases out, fast at first, arriving at rest. Ends at y=1.62, which is 0.25 m ABOVE the bounce top of 1.37 and 0.67 m above the drum head. x stays 0. The drum sounds its beat at t=3.333 at the instant the ball arrives, so the arrival lands on the pulse.

C — FROZEN (t=3.333 to 5.333 s, 2.0 s). y=1.62, x=0, z=-1.35, absolutely constant — no drift, no wobble, no idle pulse on the ball; the stillness must read as total. At t=3.783 — exactly 0.45 s after it stopped, the detector's real residency threshold — the room registers the freeze: seq.pause() fires, the ball's glow steps up to full brightness, and a soft low swell sounds once. The drum beat that was due at t=4.000 never arrives; the ring from the t=3.333 strike sustains underneath. Show this 0.45 s gap rather than faking an instant response — the half-second between stopping and the room answering is real and the learner must see it here instead of discovering it as lag.

D — THE SNAP (t=5.333 to 5.433 s, 0.10 s). One fast lateral flick: x goes 0 -> +0.45 m over 100 ms (about 4.5 m/s, far above the decisive threshold of 0.35 m/s in XR / 250 px/s desktop), with y drifting 1.62 -> 1.66. The ensemble bus ramps to zero over 80 ms starting at t=5.333, so the sustained ring dies exactly with the flick. The ball fades out over t=5.433 to 5.553. Direction is deliberately arbitrary — the room accepts any direction, so the demo flicks right and no word ever names a direction.

E — SILENCE (t=5.433 to 6.433 s, 1.0 s). No ball, no sound, empty black room. A full second, so the silence registers as a thing a hand caused.

F — THE RESTART, LIFT AND DROP (t=6.433 to 9.167 s). Ball fades in over 120 ms at x=0, y=0.95 (resting on the drum head), z=-1.35 and sits perfectly still until t=6.833 — that 0.4 s of stillness is what the detector needs before a lift can count, so it is shown, not skipped. Lift: t=6.833 to 7.500, y = 0.95 + 0.42*(1-cos(PI*u))/2 with u=(t-6.833)/0.6667 — smooth, ease-in-out, one beat long at 90, x=0. Drop: t=7.500 to 7.833, y = 1.37 - 0.42*u^2 with u=(t-7.500)/0.3333 — accelerating into the landing. The drum starts ON the landing at t=7.833 and runs at 90 from there. Two more free bounces land at t=8.500 and t=9.167 using the phase-A formula, and the ball fades out over t=8.867 to 9.167.

**Now you try.** Bounce with the drum a few times. Then lift your hand high above your bounces and stop dead.

- doing well: The drum stopped. Don't move — the room is waiting on you. Snap your hand fast, any direction, and even the ringing goes.
- struggling: Your hand stopped, but low. Lift it higher than the top of your bounces — up past where the ball went — then stop.
- stuck 20 s: Watch it once more. The hand goes UP, past the top of the bouncing, and then nothing moves at all. Your turn — I'll wait.

**Live mirror.** One live line under the prompt, refreshed every frame from the two things the sensor actually knows — the smoothed hand speed and rangeFrac, the height as a fraction of his own recent bouncing range. While he is moving: "I can see your hand bouncing." The moment his hand goes still, before any verdict exists: "Your hand is still — and it's high" (rangeFrac >= 0.6) or "Your hand is still — but it's low. Higher." (rangeFrac < 0.6). This is the whole repair. He froze four times in free play and the room graded him 10/100 while holding the exact number that explained it; now he is told he is low WHILE he can still fix it, in the same words the miss message will use. Once the freeze registers: "The drum is frozen — 1.2 s" counting up, with the invitation appearing at 0.8 s. After the snap: "Silent. Lift your hand slowly, then drop it, and it starts again." It never claims more than it measured: it never says "you didn't freeze" when all it knows is that he didn't freeze high.

**Forgiveness.** Height first: the strict 0.6 range fraction becomes 0.45 until he has registered one freeze, and the mirror line names height out loud the whole time, so the height rule can never again be something he only learns by failing. Time: the 1.5 s freeze minimum becomes 0.8 s for the first success, and the number is stated on screen rather than hidden ("stay frozen past 0.8"). Structure: the cumulative-beats bug at lessons.ts:600 must go — beats reset per try, so every try gets its own real bounce-and-establish phase instead of trials 2 and 3 firing him straight back into a freeze prompt with no music running. Ending: the lesson ends when he freezes and snaps cleanly TWICE, not after three graded trials; tries are unlimited and uncounted, and the progress line counts successes toward two, never failures toward three. The restart never costs him anything — if no lift-and-drop comes within 8 seconds the room restarts the drum itself and says so plainly ("I started it again for you — the lift is Lesson 7's move, we'll come back to it"), because he scored 15 on that lesson and it must not be silently re-tested inside this one. No number is ever shown for a motion he has not produced once: until the first clean freeze the verdicts are only "not yet", "almost", "that's it". No dead end exists — every timeout, every recovery, every phase change says a plain sentence, and no path can leave him watching an unchanged screen wondering whether the room saw him.

**It worked when.** His hand stops in the air — and the drum, which has been hitting under his hand for ten seconds straight, just stops with it. Mid-air. The last ring hangs in the black room and nothing else moves. He didn't press anything and nobody told him a number. Then he flicks his hand once and even the ring is gone, and the room is completely silent — a silence he made. Nobody has to explain that it worked; he will do it again immediately, and the second time is the lesson. Only afterwards, on the card, does the room hand him the words for what he already did: that freeze he just held has a name — a fermata — and the flick that wiped it silent is called a cutoff.

---

### onbeat — "Bounce With the Drum"

**Goal.** He can bounce his hand so it reaches the bottom at the same instant the drum sounds — so the drum stops feeling like something he is chasing and starts feeling like something he is landing with.

**The ball shows.** The glowing ball bounces on the drum head so its touch and the drum's sound are visibly one event, then carries that exact bounce across the room to float in front of the learner's own hand, and finally lights up its fall — bright, with a hairline of light shrinking toward the landing spot — so he can see the hand is already travelling down while the room is still quiet.

**Narration while it shows.** Watch the ball fall while it's quiet. It lands the moment the drum hits.

**Path (implementable).** FRAME: metres, room space. Drum head centre (0, 0.95, -1.35). The ball is the existing 0.05-radius guide sphere (main.ts meshes.guide, material GUIDE). The drum leads at a fixed 90 hits per minute for this whole lesson; period P = 0.6667 s.

CLOCK — this is load-bearing. Drive the ball from the drum's own click schedule, NEVER from conductor.ensembleBpm (main.ts:229 does that today, which makes the ball a mirror of the student; here it must be a model). Use the SAME timestamp that schedules the strike sound and the strike flash — the click's audibleAt, not a separate clock. phase = frac((now - lastClick.audibleAt) / P); y = bottom + amp * sin(PI * phase). Phase 0 is therefore the touch AND the audible hit, one event; phase 0.5 is the top of the arc. At lesson start, start the transport fresh and anchor the tempo so the first click IS the ball's first landing — never drop the learner into a pulse that is already mid-phase.

STAGE W1 — ON THE DRUM (clicks 1-4, t = 0.00-2.67 s). Anchor (x, z) = (0, -1.35). bottom = 0.95, amp = 0.42, so the top of the arc is y = 1.37. The ball touches the head on every click, at the same instant as the existing strike flash and the drum sound. Nothing else on screen: no counter, no timer, no score. The learner's hand is ignored and ungraded — anything he does here costs him nothing.

STAGE W2 — IT COMES TO YOU (clicks 5-8, t = 2.67-5.33 s). The bounce never breaks or changes speed. Across these 2.67 s, ease-in-out interpolate the anchor from (0, -1.35) to (0, -0.55) — 0.80 m toward the learner — while bottom goes 0.95 -> 1.05 and amp goes 0.42 -> 0.22. Every touch still coincides exactly with a drum hit, and on every touch a soft ring of light still opens on the drum head at (0, 0.95, -1.35), so the link between 'ball reaches the bottom' and 'drum speaks' survives the move.
PERSONALISATION (use when the room already holds 4 or more of his own bounces from the previous lesson, otherwise use the defaults above): bottom = his recent low, amp = 0.8 * (his recent high - his recent low), anchor x = his recent median hand x. Clamp bottom to [0.75, 1.35], amp to [0.12, 0.45], x to [-0.35, 0.35]. The point is that he copies at his own height and his own size, not across the room at someone else's.

STAGE W3 — THE FALL IS THE POINT (clicks 9-12, t = 5.33-8.00 s). Ball holds the near anchor. Two additions, both keyed to phase:
(a) GLOW. Emissive ramps 0.45 -> 1.40 across the descent (phase 0.5 -> 1.0) and back 1.40 -> 0.45 across the rise (phase 0.0 -> 0.5). The falling half is the bright half.
(b) DROP-LINE. While the ball is descending, and only then (phase in [0.5, 1.0)), draw a hairline of light — the existing thin cylinder mesh at radius 0.004 — from the underside of the ball straight down to its landing point at the anchor's bottom height. Its length is exactly the distance still to fall, so it shrinks to nothing at the instant of the sound, and it is absent on the way up. This is the entire lesson as a picture: the hand is already on its way down while the room is silent, and the two arrive together.

Total watch = 12 clicks = 8.00 s, no clock and no counter anywhere in it.

AFTER THE WATCH — the ball does not leave. It keeps bouncing at the near anchor at the same speed while the learner joins in (the 'now you try' line appears, still no clock and still no score). Each time his hand reaches the bottom within 120 ms of a drum hit, the ball flashes white for 120 ms and a ring opens on the drum head under his hand — acknowledgement in the world, in the same instant, not in text. After three of those, the ball drops to a faint ghost (emissive 0.25, no drop-line, still moving, still exactly correct) and only then does the graded window begin.

**Now you try.** Now you — bounce along with the ball. Touch the bottom when the drum hits.

- doing well: That's it — you and the drum are landing together.
- struggling: You're landing just after the drum. Start down while it's still quiet.
- stuck 20 s: I can't see your hand yet. Big slow bounces — whole arm, down, up.

**Live mirror.** One line under the prompt, updating live, never a score and never a countdown. It reads exactly two things and claims nothing more: whether a hand is being fed to the detector right now, and how many of his bounces have reached the bottom within 120 ms of a drum hit since the lesson began. No hand: "I can't see a hand yet." Hand, nothing together yet: "I can see your hand." Hand, with landings: "I can see your hand · together 3 times" — and that count only ever goes up, never down, never resets. If his last four landings all sat on the same side of the drum's hit, one clause is appended and nothing else changes: "· just after it" when late, "· just before it" when early. It never shows milliseconds, never shows a miss count, and never uses the word beat.

**Forgiveness.** Everything here bends toward "he cannot get stuck and cannot be graded on something he has not already done once."\n\nTHRESHOLDS. "Together" is 120 ms, not 45 — the room's own detector reads about 34 ms late on a perfect stroke, and a first-timer's spread is wide. For a first run the full-marks band opens to a 130 ms median and the good band to 200 ms; the old 45 ms band is what a returning player is measured against, never a beginner.\n\nORDER. Grading starts only in the graded window, and that window only opens after he has landed together three times with the ball still visibly bouncing beside him. He is never scored on a motion he has not already produced with help.\n\nMISSES. Drum hits with no hand landing cost nothing during the watch and joining stages — the whole 12-click demonstration and the entire joining phase are free. Only the graded window counts them, the penalty is capped at 20 points total, and it can never pull him below the score he earned for landing together at all. Reading the instruction can never cost him points.\n\nTIME. No countdown appears anywhere until the graded window opens. The graded window is 20 seconds, and it ends early and happily the moment he lands together twice in a row.\n\nSTALL. Six seconds with no landing sends it straight back to the joining stage: ball at full brightness, bigger, and the drum slowed to 66 — announced plainly, "Slowing the drum down for you." Unlimited, unconditional, every time. There is no state from which help is unavailable.\n\nNO DEAD END. Every exit says something plain. If he never lands together at all, the card says what the room watched and the one thing to change, in the same words the ball's narration used — "You were landing just after the drum. Next time start down while it's still quiet" — and it shows no number, because a number for a motion that does not exist yet tells him only that he is bad. The card waits for him; it does not expire, and it offers "Again" beside "Next."

**It worked when.** The chasing stops. He is not answering the drum any more — his hand arrives and the drum speaks underneath it in the same instant, and it starts to feel like his arm is what makes the sound rather than something running after it. He knows it without reading anything, because the room answers in the same breath every time it happens: the ball flashes white, a ring of light opens on the drum head under his hand, and the count beside "I can see your hand" ticks up one. Three or four of those in a row and the room stops feeling like it is testing him and starts feeling like it is playing with him.

---

### steady — "Bounce With the Ball"

**Goal.** "You can keep your hand bouncing at one even speed on your own — and hear the room stay smooth underneath it — after the ball stops helping."

**The ball shows.** A glowing ball bounces in the air right where the learner's own hand should be — arm's reach in front of him, not across the room — touching down onto a small lit pad at the exact instant the drum hits, so the motion, the landing spot, and the sound arrive as one single thing before a word is asked of him.

**Narration while it shows.** Watch the bottom. The ball lands when the drum hits.

**Path (implementable).** PLACEMENT. Move the ball out of the drum and into the learner's own working space. Keep the existing vertical constants — bottom y = 0.95 m (the drum head's own height, so the landing visually shares the drum's plane), top y = 1.37 m, 0.42 m of travel, ball scale 0.05 on the unit sphere (10 cm across). Change only depth and side: z = -0.75 m (arm's reach, between the learner and the drum) instead of z = -1.35 m, and x = +0.25 m for a right-hand podium, mirrored to x = -0.25 m when the room is listening to the left wrist (follow the same sticky podium-hand choice the wrist glow uses; if the podium hand changes mid-lesson the ball slides to the new side over 0.3 s). x is CONSTANT for this entire lesson — no lateral travel at all; sideways movement belongs to the shape lessons and moving here would pollute the lateral stats.

THE PAD. Draw a thin lit puck at the landing point: cylinder(rBottom 0.09, rTop 0.09, height 0.005), centred at x = ball x, y = 0.95, z = -0.75, material colour [1.0, 0.84, 0.5], emissive 0.25 at rest. This makes 'the bottom' a place in the room rather than an idea in a sentence.

MOTION LAW. Keep y = 0.95 + 0.42 · sin(pi · phase) — its speed peaks exactly at the landing, which is what makes the landing read as a strike rather than a drift. phase 0 = on the pad, phase 0.5 = top (1.37 m), phase 1 = next landing. CRITICAL CHANGE: the period must come from the LESSON, not from conductor.ensembleBpm. Today main.ts:229 derives it from ensembleBpm, which in follow mode is following the learner — so a wobbling beginner watches a wobbling ball and is corrected by nothing. Fix the period at P = 0.75 s (80 landings per minute — one landing every three quarters of a second, slower than the current 90 because a first-timer needs room to copy). During this phase the drum is in LEAD mode at the same 80, so the ball's landing and the drum's hit are literally the same scheduled event: phase = (((t - lastClick.scheduledAt) / P) % 1 + 1) % 1, and the ball's landing frame is scheduled off the same audibleAt that schedules the sound (the gate-3 one-clock rule) — never a second timer.

TIMELINE, exact.
t = 0.00 s — silence. The ball sits motionless ON the pad at y = 0.95. Nothing else on screen: no counter, no clock, no score, and input is ignored entirely. The one narration line appears now. Holding still for a moment is what turns the pad into a starting place.
t = 0.75 s — the ball lifts with no drum yet, riding phase 0.5 -> 1.0 of the same law: y climbs 0.95 -> 1.37 over 0.375 s, then falls 1.37 -> 0.95 over 0.375 s. This free rise exists so the FIRST landing coincides with the first drum hit rather than following it.
t = 1.125 s — first landing and first drum hit together. From here the ball runs continuously at P = 0.75 s.
Landings at t = 1.125, 1.875, 2.625, 3.375, 4.125, 4.875 s — six of them.
ON EVERY LANDING — the pad's emissive jumps 0.25 -> 1.0 and decays back over 120 ms, and the ball squashes to 0.8 vertical scale for 90 ms then springs back. Both are scheduled from the click's audibleAt, same as the sound. This is what makes the bottom unmissable without a sentence explaining it.

AFTER THE DEMO — the ball does NOT stop, pause, or blink out at the phase change. It keeps bouncing at the identical speed and size while the narration swaps to the 'now you' line, and now his own landings are acknowledged in the world: each bounce the detector registers flashes the pad white-warm for 120 ms and ticks the count. The ball only fades — to a dim ghost at 30% emissive, still bouncing, still correct — once he has landed 8 bounces of his own alongside it. Grading begins at that fade and nowhere earlier. When it fades, the drum switches from leading to following his hand, and that switch is said out loud in the same breath ('Now the drum follows you.'), never silently.

STALL. Any 6 seconds with no bounce from him, at any point and any number of times, returns the ball to full brightness and drops back to bouncing-together — and each successive return makes it BIGGER and SLOWER: top y 1.37 -> 1.47 -> 1.55, P 0.75 -> 0.85 -> 0.95 s (the drum returning to lead at the matching speed each time). Help is never spent.

**Now you try.** Now you. Bounce your hand with the ball — down when it lands.

- doing well: That's it. Every bounce the same. Keep it going.
- struggling: Long, short, long. Slow down — make every bounce the same.
- stuck 20 s: No bounce yet. Go big and slow — down to the pad, then back up.

**Live mirror.** "It reads exactly two things the room genuinely has, and claims nothing more. (1) Whether a hand is currently feeding the detector — the same signal that lights the warm wrist glow. (2) The running count of bottom-of-bounce events since the lesson started. It shows, on its own line under the instruction, one of: 'I can't see your hand yet' — no source is feeding; 'I can see your hand · no bounces yet' — a hand is feeding but no bottom has been detected; 'I can see your hand · 5 bounces' — the live count, ticking up in the moment each one lands, with the pad flashing at the same instant so he can answer 'did that count?' without reading anything. It never says good, bad, close, or steady — those are the lesson's job. It only reports what is arriving. When the podium hand switches it says so plainly: 'Now I'm watching your other hand.'"

**Forgiveness.** "The ball never leaves for good. Six seconds with no bounce brings it back at full brightness, bigger and slower, unconditionally and unlimited times — this deletes the current trap at lessons.ts:245 where six lucky bounces (`beats < 6 && now - this.t0 > 25`) permanently disqualify him from every coaching line for the rest of the lesson. Nothing is measured that he has not already done once with help: grading starts only when the ball fades, and the ball only fades after he has landed 8 bounces alongside it (today the opposite happens — the ball vanishes at bounce 4 and scoreSteady grades intervals.slice(-16), i.e. only the stretch after the teacher left). He is judged on his best 4 bounces IN A ROW, not the last 16, so one flub cannot sink the run. First-run bands are wide: 4 in a row within 15% of each other is 'got it'; the old 4.5%/9% bands are for someone who has already got it once. No clock and no counter exist until the ball has faded — nothing shrinks at him while he is still working out what is wanted. The ball mirrors to whichever wrist the room is listening to, so a left-handed learner is never copying the wrong side. And the floor is not a number: if he never lands 4 even ones, the card says what the room actually saw ('I saw your hand, and I counted 9 bounces') plus the one motion to change, and offers Again and Next — a 5 / 100 is never shown to a first attempt. The lesson has no fixed length and cannot time out into a score; it ends when he does it twice or when he chooses to move on."

**It worked when.** "He lands four bounces the same length in a row and three things happen at once, none of them a number: the pad under his hand stops flashing and stays lit; the drum — now following him — stops lurching and settles right under his hand so every hit arrives exactly where he put it; and the room goes quiet-smooth, like it is waiting on him rather than dragging him. He knows it worked because the SOUND changed, not because a score did. The plain line that lands with it: 'That's it — the drum is going where you put it.' The number, if it ever appears, comes later and means how consistent, never whether he can do it at all."

---

### tempo — "Faster & Slower"

**Goal.** You make the drum speed up and slow back down just by changing how fast your hand bounces — and you feel it obey you.

**The ball shows.** The ball bounces on the drum head in a wide, slow bounce with the drum sounding on every landing, then — on one landing, with no pause and no warning creep — leaves twice as fast in a tighter bounce and the drum doubles with it on that same hit, then drops back to the wide slow bounce the same way.

**Narration while it shows.** Just watch — slow bounces, then twice as fast, then slow again.

**Path (implementable).** The ball stays at x = 0.00 and z = -1.35 for the entire lesson. No sideways travel at all: sideways belongs to the later shape lessons and adding it here would pre-teach them. Only y moves.

y(t) = 0.95 + A * sin(pi * p), where p is the position inside the current bounce, p = 0 at a landing and p = 1 at the next landing. So y sits at its minimum 0.95 (the drum head) exactly at every landing, and at its maximum at the halfway point.

Two arcs only. WIDE-SLOW: A = 0.42, top y = 1.37 — the identical arc Lesson 1 already showed, so the shape is already familiar. TIGHT-FAST: A = 0.30, top y = 1.25. Both arcs meet at y = 0.95, so switching between them at a landing produces no jump in position — only the rise afterward differs.

Timing of one full demonstration, t measured from the first landing. Every landing IS one of the drum's own scheduled clicks: the ball's y-minimum must fall on that click's audibleAt sample, not on a render frame — phase it off conductor.lastClick.scheduledAt exactly as the Lesson 1 guide ball already does, so what he sees is what he hears.
  t = 0.000, 0.789, 1.579, 2.368 — four WIDE-SLOW landings, gap 0.789 s (76 per minute), A = 0.42.
  t = 3.158 — THE PIVOT. The ball falls into this landing at the slow rate and leaves it at the fast rate; A switches to 0.30 on the rise. The drum's period changes on this same click. The ball brightens about 1.6x for 120 ms on this landing only, to pull the eye to the moment.
  t = 3.553, 3.947, 4.342, 4.737, 5.132, 5.526, 5.921 — TIGHT-FAST landings, gap 0.395 s (152 per minute, exactly double), A = 0.30.
  t = 6.316 — SECOND PIVOT. Falls in fast, leaves slow; A back to 0.42; the drum's period doubles back on this click; same 120 ms brighten.
  t = 7.105, 7.895, 8.684, 9.474 — WIDE-SLOW landings again, gap 0.789 s, A = 0.42. The demonstration ends on the landing at 9.474.

The change always happens in the LIFT after a landing, never in the drop into one. That is the entire mechanism this lesson exists to show, and it is why both pivots are placed exactly on a landing.

Drive the ball from these two fixed rates, NOT from conductor.ensembleBpm. In follow mode that value is following the student, so the existing guide-ball code (main.ts:229) makes the ball mirror a wobbling beginner back at himself instead of modelling anything. During the watch and copy stretches the conductor is in 'lead' mode and the demonstration owns the clock; it switches to 'follow' only when the ball fades for the graded stretch.

The demo drum strikes at one constant strength the whole way through. The arc tightening must not also be heard as getting quieter, or he reads the size change as the lesson instead of the rate change.

The ball is drawn where his own hand should be working, not out across the room — x = 0, z = -1.35, height band 0.95 to 1.37 is already in front of him at working height, so he is copying a motion at his own scale rather than translating one from a distance.

**Now you try.** Now you — bounce with the ball. Jump to fast when it does.

- doing well: You're faster and the drum is catching up. Keep bouncing right there.
- struggling: Your bounce is nearly the same speed. Go much faster — about twice.
- stuck 20 s: No change yet. Watch the ball again — then copy its jump.

**Live mirror.** Reads two things and shows them as one line split by a dot. Left half is his hand: the spacing of his last three bounces compared against the four bounces before the ask, expressed as a ratio and spoken in words, never as a number on screen. Right half is the drum: whether the drum's own hits have settled to within a hair of that spacing. Live strings, in order of what happens: "I can't see your hand yet" before anything lands; then "Your bounce · the drum is with you"; the instant he changes, "A bit faster · the drum is catching up" or "Twice as fast · the drum is catching up" (and "Slower · the drum is catching up" on the way back down); and when the drum settles, "Twice as fast · the drum is with you now". The left half is always his hand and the right half is always the drum, so he can watch the room reacting to him without reading anything else — which is the direct answer to "doesnt even seem to go off of my hand gestures".

**Forgiveness.** Loosen the ask, never the sensing. The room asks for twice as fast, which is about six times bigger than the smallest change the drum can actually hear, so anyone who genuinely tries clears it by a mile. No clock appears anywhere until he has already produced one change — the shrinking 12-second number goes entirely, because a countdown beside an instruction he hasn't decoded is pressure, not information. No stretch may end in silence: today the faster half simply times out with no message, and the line he then sees differs from the success line by the single word "Good", which is why he could not tell whether it had worked. Every ending is spoken. And there is a floor underneath the graded measurement: if he creeps up gradually instead of jumping — the normal, musical thing a beginner does, and something the step detector cannot see at all — the room compares the spacing of his first four bounces after the ask against his last four, and if that has moved by even a seventh it counts as a real change, is named back to him in his own words, and is graded. So "I never heard a change" can only ever be said to someone who truly never changed. He gets each direction as many times as he wants, in any order, and the lesson ends when he has done each one once rather than after a fixed number of tries. If he only ever manages the faster half, the card says exactly that and offers the slower half again, instead of averaging his one real success down into a low number.

**It worked when.** He jumps to twice as fast, and for a moment the drum is scrambling behind him — he can hear it not quite with him — and then it drops in underneath him and they are moving together at the speed he picked. He never touched a control. His arm sped up a room.

---

### downbeat — "Starting the Music"

**Goal.** You can walk into a silent room and start the music with one move of your hand — and it comes in at the speed your hand just showed it.

**The ball shows.** The ball sits dead still on a silent drum, leaps up once, falls back onto the drum head — and the drum sounds at the exact instant it lands, then keeps bouncing on every hit at the speed that one trip just set.

**Narration while it shows.** Up first — then down. The drum starts when it lands.

**Path (implementable).** Frame: the existing guide-ball frame. x = 0, z = -1.35 is the centre of the drum head; y is metres; ball radius 0.05. Rest height y = 0.95 (ball touching the head). Top of trip y = 1.37 (the existing 0.42 m amplitude). One trip = 0.667 s, which is exactly what the room grades: it measures the time from the start of the lift to the landing, and 0.667 s means 90. The ball is literally the answer key — full marks is a trip of 0.617-0.725 s.

Drive the ball from the lesson's own 90, NOT from conductor.ensembleBpm (main.ts:229 currently derives the period from the ensemble, which in follow mode is following the learner — a wobbling learner would watch a wobbling model and get no correction). Land it on the sequencer's scheduled click times, the same event that flashes the drum head, so what he sees IS what he hears.

TIMELINE, t in audio-clock seconds from the start of the demo:

t 0.000 - 1.000  REST. Ball motionless at (0, 0.95, -1.35). The room is genuinely silent — sequencer stopped, no clicks. Glow steady at about 60%. Nothing else on screen moves; no clock, no counter, no score. This full second of stillness is load-bearing, not padding: the room will not register a lift at all unless the hand has been still for 0.35 s first, so the pause is being taught here without being named.

t 1.000 - 1.333  THE LIFT (0.333 s). y(u) = 0.95 + 0.42 * sin(pi/2 * u), where u = (t - 1.000) / 0.333. This is fast off the drum and eases to a stop at the top: about 1.98 m/s in the first frames, 0 m/s at the peak. Ramp only the first 60 ms (multiply the curve's velocity by min(1, (t - 1.000) / 0.06)) so it launches hard without an infinite-acceleration pop. The front-loaded speed is REQUIRED, not styling: the room only counts a lift if the hand reaches 0.35 m/s (VR) / 250 px/s (desktop) within 120 ms of leaving stillness. A ball that drifts gently upward would be teaching a motion the room cannot see — this is precisely the failure that produced 'strike without a breath' three times. The demo leaps with about 5.7x margin over the threshold.

t 1.333 - 1.667  THE DROP (0.333 s). y(u) = 0.95 + 0.42 * cos(pi/2 * u), u = (t - 1.333) / 0.333. Mirror image: slow off the top, accelerating to about 1.98 m/s downward into the head. The acceleration into the landing is what makes the landing instant unmistakable.

LATERAL, across the whole trip: x(tau) = 0.10 * sin(pi * tau) where tau = (t - 1.000) / 0.667. x leaves 0, bulges to +0.10 m at the top, and returns to exactly 0 at the landing. z stays -1.35 throughout. This turns the trip into a narrow visible loop instead of a line, so the lift and the drop read as two different halves rather than one blur. Mirror the bulge to whichever side the room's sticky podium hand is on (default +0.10, learner's right). x is NOT measured in this lesson — it is purely for legibility, and a left-handed learner mirroring it costs nothing.

t = 1.667  THE LANDING. Exactly here, in one frame: the drum's first hit sounds (schedule the click's audibleAt at this instant, the same event that drives the head flash — gate 3's one-source rule), the head flashes, and the ball squashes to 80% height for 60 ms. This single frame is the entire lesson: the room was silent, the ball landed, the sound now exists.

t 1.667 - 4.333  FOUR MORE BOUNCES at 90 (period 0.667 s). Same curves repeated, landing on the drum's hits at t = 2.333, 3.000, 3.667, 4.333, each landing sample-exact with an audible hit and a head flash. Same 0.10 lateral bulge each bounce. This is what teaches that the ONE trip set the speed of everything after it — the rule is shown by continuation instead of stated in a sentence.

t 4.333 - 4.600  The drum stops. The ball settles back to rest at (0, 0.95, -1.35) and the room is silent again — returning to the exact picture the demo opened with, which is the picture the learner is now standing in.

This REPLACES the current demo phase entirely (lessons.ts:476-489), which plays 2.8 s of drum labelled 'LISTEN — this is the speed you will start them at' and never shows the gesture at all — it demonstrates the speed while withholding the motion.

NAMED FALLBACK, if in-headset review shows copying a ball 1.35 m away is too far or too small: add a second, dimmer ball at z = -0.55 at the learner's own resting hand height, running the identical curve in perfect sync at his scale. Do not move the primary ball off the drum — its landing has to be seen CAUSING the sound, and that only reads on the drum head.

**Now you try.** Hold your hand still. Then one quick lift up — and drop it. The drum starts the moment your hand lands.

- doing well: Yes — the drum came in right under your hand. Once more and this one's yours.
- struggling: I didn't see your hand lift. Hold it dead still first — then a quick lift up, and drop.
- stuck 20 s: Watch the ball once more — bigger and slower this time. Let your hand stop dead, then go up when the ball goes up.

**Live mirror.** One live line under the words, reading only what the sensor has this instant, in this order: 'Your hand is moving' -> 'Your hand is still ✓' the moment it has been quiet the 0.35 s the room needs -> '· lift seen ✓' the instant the upward move registers -> '· started ✓' on the landing, as the drum comes in. Ticks stay lit until the try ends. This is the whole fix for 'doesnt even seem to go off of my hand gestures': he can watch being-still count, and watch his lift count, before the drop has even happened. If the lift tick never lights, that IS the diagnosis — live, physical, and before any verdict. It is also the ONLY thing in the lesson permitted to claim a lift was missed, because it is the only thing that actually measured one.

**Forgiveness.** Nothing is graded until he has landed one start with the ball still bouncing beside him. The ball never leaves on a count — it fades only after two landings the room saw a lift on, and it comes straight back after six seconds of nothing, every time, unconditionally. Speed is not judged on the first two successes: any landing with a lift seen is 'got it', and how close he came to the ball's trip only starts counting after that. Re-lifting costs nothing — the current 10-points-per-hesitation deduction (lessons.ts:751), which is invisible in the run and appears only in raw JSON, is off for a first run; the room says 'take your time — settle, and go again' instead, because re-settling the arm is the definitive beginner behaviour, not an error. A try where no lift was seen is not a failed try at all: it replays the ball bigger and slower and he goes again, uncounted. The 10-second shrinking timer (lessons.ts:529) is gone entirely from the un-succeeded state — there is no clock on screen until he has started the music once; a number counting down beside an instruction he has not yet decoded is pressure, not information. The lesson ends on two starts in a row, not on three graded attempts, and retries are untimed and unlimited. Three no-lifts in a row drops back to the ball bouncing with him rather than scoring and moving on. There is no exit from this lesson that is a number he cannot act on, and no path where the room goes quiet without saying what it saw.

**It worked when.** The room is completely silent. He holds his hand still, lifts, drops — and the drum comes in underneath his hand at the exact instant it lands, then keeps going at the speed his one trip just set. He needs to read nothing to know it worked: the silence broke on his hand. Then the card, which stays until he chooses 'Again' or 'Next' rather than expiring in five seconds, adds the only music word in the whole lesson, and only because he has already done the thing: 'That lift-and-drop you just did is called a downbeat.'

---

### pattern4 — "Middle, Left, Right, Middle"

**Goal.** He can drop his hand in a spot he chose — middle, then left, then right, then middle — four times running, and watch the drum light up exactly where he put it.

**The ball shows.** The glowing ball bounces four times on the drum head — middle, left edge, right edge, middle — landing exactly on the drum's own hit each time, while the spot it is about to hit glows brighter and brighter until it gets there.

**Narration while it shows.** Watch where it lands: middle, left, right, middle.

**Path (implementable).** FRAME AND UNITS. Room metres, +x to the learner's right, +y up, learner faces −z. Drum centre x=0, z=−1.35; domed head top y≈0.912, head radius 0.376. Guide ball is the existing `meshes.guide` sphere drawn as translation(x,y,z)·scaling(0.05,0.05,0.05) with material GUIDE — identical mesh, size and colour to Lesson 1, because it must read as the SAME ball he already met.

THREE LANDING SPOTS (ball-centre positions, all on the head plane, all z=−1.35, all y=0.95 — the ball's underside then kisses the head at 0.912, exactly as in Lesson 1):
  MIDDLE  x =  0.00
  LEFT    x = −0.30
  RIGHT   x = +0.30
x=±0.30 keeps the whole 0.05-radius ball over the 0.376 head, so it lands ON the drum at every spot — never off the edge.

CLOCK. This lesson the drum LEADS at 66 BPM (conductor.followMode='lead', seq.setTempoAnchored(66)) for its whole length. Period P = 60/66 = 0.9091 s. Slow and external on purpose: the graded thing here is sideways placement, and keeping time is the separate skill he has not got yet — the drum keeps it for him. Do NOT derive the ball's period from conductor.ensembleBpm (today's Lesson 1 bug: in follow mode the ball follows the student, so a wobbling beginner watches a wobbling model). Drive it from the lesson's own 66.

The ball is welded to the drum's own count, never to a free-running timer:
  leg      = (clickIndex − anchorClickIndex) mod 4      // anchorClickIndex = the click of the first landing
  u        = clamp((now − lastClick.scheduledAt) / P, 0, 1)   // u=0 is the landing that just happened, u=1 the next one
So every landing coincides with an audible drum hit to within one frame, in both desktop and VR, and the ball can never drift out of phase with the sound.

LEG TABLE — leg n travels from the count that just landed to the count it is going to.
  leg 0: MIDDLE (0.00) → LEFT  (−0.30),  apex height H = 0.25   (apex y 1.20)
  leg 1: LEFT  (−0.30) → RIGHT (+0.30),  apex height H = 0.23   (apex y 1.18)
  leg 2: RIGHT (+0.30) → MIDDLE (0.00),  apex height H = 0.42   (apex y 1.37)
  leg 3: MIDDLE (0.00) → MIDDLE (0.00),  apex height H = 0.35   (apex y 1.30)

MOTION WITHIN A LEG (x0,x1 from the table):
  x(u) = x0 + (x1 − x0) · (0.5 − 0.5·cos(π·u))
  y(u) = 0.95 + H · sin(π · u^0.85)      for legs 0, 1, 2
  y(u) = 0.95 + H · sin(π · u)           for leg 3
  z(u) = −1.35 constant
The cosine ease on x makes the ball leave and arrive with zero sideways speed, so it visibly SETTLES into each spot instead of skidding past it. The u^0.85 on y puts the top of each arc at u≈0.44 — it snaps up off the landing, floats across, then drops into the next one, which is what a real hand does. Leg 2 is the tallest arc (1.37, the same height his Lesson 1 ball reached), so count 4 visibly floats up before coming home; leg 3 is a plain straight-up-straight-down bounce at centre — literally the Lesson 1 motion, which is how the group loops back to its start and links this lesson to the one thing he has already done.

LEAD-IN. For one full beat before the first landing the ball hovers still at (0.00, 1.10, −1.35), then drops onto MIDDLE on the next click. The first thing he ever sees is a LANDING, not a ball already in flight.

LEFT-HANDED. The room already knows which hand holds the podium (inputSource 'hand-left' vs 'hand-right'). If it is the left hand, negate every x in the leg table and swap the lit sequence — LEFT and RIGHT trade places. The scoring template mirrors with it (['C','R','L','C']). Today a correct left-handed conductor scores near zero and is told nothing; this fixes it in the one place that matters.

THE THREE MARKS (this is what replaces the static numbered diagram). Three thin discs, radius 0.075, thickness 0.004, at (x, 0.916, −1.35) for x ∈ {−0.30, 0.00, +0.30}, GUIDE colour. Resting emissive 0.10. The mark the ball is travelling TOWARD ramps emissive = 0.10 + 0.55·u across the leg, so the target brightens as the ball approaches. At the instant of landing it flashes to 1.0 and decays back to 0.10 over 180 ms. Counts 1 and 4 share the MIDDLE mark, so the middle one flashes twice a group — that is the truth and he can watch it happen. The marks are the WHEN as well as the WHERE, which the static panel diagram never was.

HIS OWN MIRROR — the drum lights where HE landed. On each detected bounce, map his beat x onto the head using his own running spread: xHead = 0.30 · clamp((xBeat − mid) / (0.5 · spread), −1, +1). Light a 0.06-radius patch at (xHead, 0.918, −1.35) for 200 ms — warm white if it matched the currently-lit mark, dim grey if it did not. He can see, without reading anything, where the room thinks his hand went. When four in a row match, all three marks pulse together once and the chimes ring a single tone out of the dark.

PHASES OF THE BALL.
  WATCH   — ball full brightness (emissive 0.9), scale 0.05, his input ignored, no counter, no clock, no score. Two complete groups.
  WITH ME — identical ball, unchanged; he joins in; still nothing counted, still no clock. No time limit; it ends when he lands 4 in a row on the lit marks.
  YOURS   — same path, ball dimmed to emissive 0.25 and scale 0.035 (a ghost in the corner of his eye). Counting starts here, as not-yet / almost / got-it, never a number.
  ALONE   — ball not drawn at all. THE THREE MARKS STAY LIT IN SEQUENCE — they are the count and the target; removing them would remove the referent the grading is measured against.

STALL — help is never spent. If 6 s pass with no bounce at all, or a whole group ends with fewer than 2 of 4 matching, the ball comes back at full brightness and the room drops to the two-spot version: ball alternates LEFT ↔ RIGHT, one landing per click, H = 0.28, apex at u = 0.5, and only the two side marks light. Four correct alternations returns it to the four-spot version at WITH ME. This floor is always passable and it teaches exactly the missing thing — that the hand may travel sideways between bounces, which four lessons of pure up-and-down never mentioned.

TWO CODE NOTES so this needs no follow-up questions. (1) `guideBpm()` must become a general per-lesson guide — return {x, y, z, scale, emissive} or null — instead of hard-returning null unless `current === 'steady' && beats < 4`. Today the room's one show-don't-name capability is spent on four beats of one lesson out of nine. (2) Drop `pattern: cfg.glyph` from this lesson's LessonUi. With the diagram gone the sub-line gets the full 544 px instead of 340 px, which also removes the four-line wrap that currently collides with the progress line at y=282.

**Now you try.** Now you. Bounce with the ball — land where it lands.

- doing well: That's it. Middle, left, right, middle.
- struggling: Your bounces all land in one place. Move your hand sideways between them.
- stuck 20 s: Forget the count. Bounce far LEFT, then far RIGHT. Just those two.

**Live mirror.** Reads the sideways position of each detected bounce (the same `beatXs` the score uses) and the mark that was lit at that instant, so it can only ever claim what the sensor actually measured. Live line, two short lines on the HUD: "I can see your hand · that one landed LEFT" and, on the row under it, either "— the lit one" or "— the lit one was the MIDDLE". Alongside it in the world, the drum head itself lights under the spot he hit — warm white when it matched, dim grey when it did not — so he can keep his eyes on his own hand and still know whether the room saw him. Before his first bounce it reads "I can see your hand · waiting for a bounce", never silence. If tracking drops it says "I lost your hand for a moment" rather than pretending, and it never says he landed nowhere when what it really knows is that he landed somewhere else.

**Forgiveness.** The drum keeps time for him at a slow 66 the whole lesson, so he is never graded on two things at once — the only thing being watched is where each bounce lands sideways. Each bounce is judged against the mark that is LIT at that instant, not against its position in a fixed group of four counted from lesson start: a missed or an extra bounce costs one bounce and nothing else, instead of rotating the whole template and scoring a flawless run near zero. The middle band is generous — anything inside the middle third of his own sideways range counts as middle, and it stays that wide for the first two groups before tightening. A group counts as good at 3 of 4, not 4 of 4. There is no attempt limit and no failure counter: the line counts good groups toward 2 and never counts misses at him. If he barely moves sideways, the lesson does NOT hand him 15 points and move on the way it does today — it drops to the two-spot floor (just far left, far right, alternating), which is strictly easier than what he was already doing and teaches the exact missing motion. The ball returns at full brightness on every stall, unconditionally, forever. No clock appears on screen until he has already landed a correct group. If he never gets one, the card shows no number at all — only what his hand did and the one thing to change — and Again is the button sitting under his thumb.

**It worked when.** The drum answers from the side he pointed at. He bounces left and the left of the drum head lights up under his hand; he bounces right and the light jumps across with him. He is not reading anything — he is watching a light follow his hand around. Then four in a row match, all three spots pulse together, and a single chime rings out of the black room, which nothing has done for him before. He knows it worked because the room moved when he did.

---

### dynamics — "Big Bounce, Small Bounce"

**Goal.** You will be able to make the drum thunder or go quiet whenever you want, just by changing how far your hand travels.

**The ball shows.** The ball bounces on the drum head — three tall bounces while the drum thunders, then three tiny hops while the drum goes quiet, twice through, leaving a faint mark hanging at the tall bounce's ceiling so the tiny one is seen against it.

**Narration while it shows.** Just watch. The farther the ball travels, the louder the drum.

**Path (implementable).** SETUP. The lesson owns a fixed clock: sequencer playing, setTempoAnchored(80), so one beat P = 0.75 s. followMode = 'lead' for the whole lesson (WATCH, COPY and ALONE) — this is what makes the ball a MODEL and not a mirror: today main.ts:229 derives the ball's period from conductor.ensembleBpm, which in follow mode is following the student, so a wobbling beginner watches a wobbling ball. Here the ball and the drum ride the same fixed 80 grid and never move. Two additive fields on Conductor are required and are the only shared-code changes: (1) `demoVelocity: number | null` — when non-null the click scheduler (conductor.ts:320-324) uses it in place of pendingVelocity, which is how the demo drum can be loud or quiet with the learner's hand completely still; (2) `velocityFromStroke: boolean` — conductor.ts:252 currently forces pendingVelocity to 1 whenever followMode === 'lead', which would make the learner's hand size do NOTHING in this lesson; the flag lets stroke size drive the gain while the drum still leads. Both default to the existing behaviour, so the probe path is untouched.

POSITION. x = 0.00 and z = -1.35 for every frame of this lesson. There is deliberately NO lateral movement: height of travel is the one thing being taught and the one thing the room measures, so it must be the only thing that changes on screen. The ball's own diameter also never changes — scale stays 0.05 throughout (a bigger ball for a 'bigger' bounce would add a second variable the room does not sense).

VERTICAL PATH. Phase is taken from the drum's own scheduled click, exactly as the existing code does it: phase = (((ac.currentTime - lastClick.scheduledAt) / P) mod 1 + 1) mod 1. Then y = 0.95 + A * sin(PI * phase). So the ball is TOUCHING the drum head (y = 0.95) at phase 0 — the instant the click is audible — and is at its top at phase 0.5, exactly halfway between two drum hits. It lands ON the beat, not after it. A is re-read only at phase 0, never mid-flight, so the ball never jumps or interpolates: the size change is instantaneous at the bottom and reads as a change rather than a fade.
  A = 0.42 m on a LOUD beat (top y = 1.37).
  A = 0.14 m on a QUIET beat (top y = 1.09).
That 0.14 / 0.42 = one third is not decorative — it is the ratio the grader needs. It is also what the words must ask for.

WATCH — 12 beats, 9.0 s, no clock on screen, no counter, no score, input ignored.
  beats 1-3   A = 0.42, conductor.demoVelocity = 1.15 (loud)
  beats 4-6   A = 0.14, demoVelocity = 0.40 (quiet)
  beats 7-9   A = 0.42, demoVelocity = 1.15 — at phase 0.5 of beat 7, drop a dim ceiling mark: draw the same guide mesh at (0, 1.37, -1.35) at scale 0.03 with the existing MARKER material, and leave it there for the rest of the lesson
  beats 10-12 A = 0.14, demoVelocity = 0.40 — the mark still hanging at 1.37, so the tiny hop is seen against the tall bounce's ceiling

COPY — the ball does not stop. The same 12-beat sequence loops, demoVelocity is set back to null, and velocityFromStroke goes true, so from this moment the drum's loudness comes from the learner's own hand while the ball keeps showing the target. Still no clock, still no score. Every bounce he lands makes the ball flash white for 80 ms on his beat and makes the drum's existing strike glow scale with the gain — he can answer 'did that count?' without reading anything. COPY ends when he has produced one bounce at or above 60% of his own biggest recent travel AND one at or below 45% of it — i.e. he has been visibly big once and visibly small once. It has no time limit.

ALONE — ball fades out over 0.5 s at a bottom, grading starts here and only here, drum still leading at 80. 16 beats in four stretches of four: loud, quiet, loud, quiet. The switch is never silent and never a surprise: on the LAST beat of each stretch the ball reappears for exactly one beat at the NEXT stretch's amplitude and then vanishes again, so he sees the coming size one beat early. Grading drops the first bounce after each switch (his reaction beat) and scores the remaining 12 — 6 big, 6 small — labelled by the timestamp of each stroke against the lesson's own 80 grid, never by array index (velocities only push when stroke > 0, so index and beat drift apart in the current code).

STALL — at any point in COPY or ALONE, six seconds with no bounce brings the ball back at full brightness, at 60 BPM and A = 0.50, and drops the phase back to COPY. Unconditional, unlimited, no penalty, every time.

MIRROR-THE-ERROR — if he reaches the card with big and small the same size, the card does not just say so: the ball replays HIS last bounce as a dim sphere at (-0.30, his own travel, -1.35) beside a bright one doing 0.42 at (+0.30, ..., -1.35), both bouncing together on the beat. This is the only place in the lesson where lateral offset is used, and it is used to put two heights side by side, not to teach a sideways motion.

**Now you try.** Now you — bounce with the ball. Copy how far it goes.

- doing well: In the loud stretch: "Big — and the drum is loud. Keep it that big." In the quiet stretch: "Small — and the drum went quiet. Keep it that small." The line names which size he just made, so the praise is also a measurement he can check.
- struggling: All your bounces are the same size. On the quiet ones, barely move — a couple of inches.
- stuck 20 s: The ball comes back at full brightness, bigger and slower (60 beats a minute, top a little higher), and the line changes to something more physical and never the same sentence twice: "Nothing yet. Lift your hand up to your chin, then drop it straight down." If it stalls a second time: "The drum hits at the BOTTOM of your bounce. Go down all the way, then all the way back up."

**Live mirror.** {"where": "The HUD progress line (hud.ts:139, 46 px, y=282) — the slot that currently holds '7 / 16 beats'. It carries no counter and no timer until grading starts.", "signal_it_reads": "Two things only, both of which the room genuinely has: (a) whether a bounce has landed at all — a new entry in detector.beatTimes; (b) the raw travel of that bounce (the `stroke` value, peak minus trough, already passed to onBeat but currently thrown away — store it alongside velocities), compared against the biggest travel in his last 8 bounces.", "what_it_says": "One of four lines, updated the instant a bounce lands: \"I can see your hand · that one was BIG\" (travel >= 60% of his recent biggest) · \"I can see your hand · that one was small\" (<= 45%) · \"I can see your hand · that one was in between\" (between the two) · \"I can't see your hand moving yet\" (no bounce for 3 seconds). During ALONE it becomes a count of successes, never of failures: \"bounce 6 of 12\".", "why_the_in_between_line_exists": "The sensor knows travel, not intent. Reporting 'in between' is the honest reading and it is also the coaching: it is the room telling him the two sizes have not separated yet, while he can still do something about it.", "acknowledgment_in_the_world_not_only_in_text": "His big bounce already makes the drum's strike glow brighter and hit harder (gate 4 wired strike glow to velocity). Add the ball flashing white for 80 ms on his beat during COPY. He must be able to answer 'did that count?' without reading the panel — he is looking at his hand, not the panel."}

**Forgiveness.** {"time": "Nothing in this lesson is timed. WATCH has no clock. COPY has no length — it ends when his hand has been big once and small once, however long that takes. ALONE ends after 12 counted bounces, not after N seconds, so a beginner whose big bounces are slow is never charged for it. The current rule that hands out 10 points and 'not enough strokes to judge' below 12 strokes is deleted outright: it punished the direct physical consequence of obeying 'make it bigger'.", "thresholds": "Score the raw travel the room actually senses, not the derived gain. Contrast = median(big-stretch stroke) / median(small-stretch stroke) in his own units. Full marks at 2.2x, 'you've got it' at 1.6x, and only below 1.6x is it 'not yet'. This replaces the current 1.9 on the normalised velocity, which is not a travel ratio at all: because the gain is divided by a rolling median of his last 12 strokes, the last two bounces of a run flip the median and silently report a small bounce as full-sized. Joseph's 35 is exactly what that artifact produces from a run that may have had real contrast.", "always_passable_floor": "No number appears until he has produced one clearly big and one clearly small bounce at least once. Until then the verdict is words only — 'not yet, and here is the one thing' — because a 0-100 on a motion he has never made measures nothing but its absence. Once he has made both, the lowest possible card still names one action he can take with his arm.", "never_a_dead_end": "Six seconds of no bounce anywhere in the lesson brings the ball back at full brightness and drops the phase to COPY — unconditional, unlimited, uncounted, no score change. Help is never permanently spent. There is no equivalent of the current trap where six lucky beats disqualify a learner from all further coaching. The card does not expire after five seconds and does not auto-advance: it holds until he presses Again or Next, and Again re-runs this same lesson from WATCH.", "the_switch_is_never_a_surprise": "The prompt never flips silently mid-motion. One beat before every change the ball reappears at the coming size and the line reads 'Next: quiet' or 'Next: loud', and the first bounce after each switch is not graded at all."}

**It worked when.** He shortens his bounce and the drum goes quiet under him — and he knows he did not hit anything softer, did not try harder, did not press a button. He just moved less far, and the whole room got smaller with him. The other half of it is the moment he goes back to a full bounce and the thunder comes back on the very next hit. Cause and effect, in his own arm, with no number involved.

---

### cue — "Point, and They Play"

**Goal.** You can make the tall metal tubes start ringing whenever you want, by holding your free hand out at them a moment before you want the sound.

**The ball shows.** The glowing ball plays your free hand: it waits at rest while the drum counts on its own, reaches sideways to the tall tubes one full beat before they should sound, stops dead there and waits — and the tubes ring on the very next 1.

**Narration while it shows.** Watch — the ball gets there early, then waits.

**Path (implementable).** All coordinates are the room's world space, the same frame Lesson 1's ball already uses (drum head centre (0, 0.95, -1.35); the Lesson-1 ball peaked at y 1.37). The drum leads at 90 BPM in this lesson, so one beat P = 0.667 s and one count of four = 2.667 s. Let T0 be the AUDIBLE time of a drum hit landing on 1 (sequencer beatInBar 0) — take it from the same scheduledAt + outputLatency the timpani flash uses. One clock. Never a frame counter, never a wall clock.

REST POINT (the free hand at ease): (-0.55, 1.10, -1.15) — chest high, an arm's length in front of the learner, on the side AWAY from the tubes. Mirror to (+0.55, 1.10, -1.15) when the room's beat hand is the left hand (inputSource === 'hand-left'), so the ball is always on the learner's own free side. Desktop uses the unmirrored point.

POINT-AT POINT (where a pointing hand ends up): (1.25, 1.08, -1.50). That is 0.22 m out from the chimes' centre (1.35, 1.05, -1.70) along the tube frame's front face (frame yaw -0.5 rad, so the front normal is (-0.479, 0, 0.878)) — the ball hovers clear in front of the tubes instead of inside them.

Ball radius 0.05 m (the Lesson-1 guide scale), GUIDE material.

TIMELINE — one pass = 12 beats = 8.0 s:

T0+0P to T0+6P (six beats: a whole count of four, then 1 and 2 of the next). The ball sits at REST POINT and does nothing but breathe: y += 0.008 * sin(2*pi*0.5*t). It NEVER bounces, in this lesson, ever. The drum plays and flashes on its own beats; the drum's flash is the pulse, and the ball only ever means the free hand. Two different things, two different visuals, no overlap.

T0+6P to T0+7P — THE REACH, exactly one beat long, from the audible hit of 3 to the audible hit of 4. u = (t - (T0+6P))/P; s = 1 - (1-u)^3 (ease-out: launches fast, settles). pos = lerp(REST_POINT, POINT_AT_POINT, s), plus a lift of +0.14 * sin(pi*s) added to y so it arcs up and comes DOWN onto the target rather than sliding across. Net lateral travel is 1.80 m in x (-0.55 to +1.25) — this is the first gesture in the whole game that goes sideways to a place, and it must read as one clean reach.

T0+7P exactly — ARRIVAL, on the audible click of 4, one full beat (0.667 s) BEFORE the sound it causes. The ball stops dead. Nothing about it moves for the next 0.667 s — no breathing, no drift, no wobble. On this same frame its radius grows 0.05 -> 0.065, and the room calls the real chimes.cue() (the same call the learner's own point will make), so the tubes take the real pending-join breathing glow. What he watches is produced by the exact mechanism he is about to use.

T0+7P to T0+8P — THE WAIT. Ball parked, still, bright; tubes breathing. This visible stillness is 0.667 s where the sensor only needs 0.25 s: it shows more hold than is required, on purpose, so a learner who copies it cannot fail the sustain test.

T0+8P exactly — THE SOUND. The chimes ring: the real quantised entrance out of chimes.onBeat, not a demo sample. On that same audible instant the ball flashes to radius 0.09 for 0.12 s then eases back to 0.05 over 0.2 s, and the big count number lights on 1. Cause (his reach, one beat ago) and effect (the sound, now) sit one visible beat apart.

T0+8P to T0+10P — THE RETURN. POINT_AT_POINT back to REST_POINT over two beats, straight line, smoothstep, no arc, dimming to emissive 0.55 on the way so the return reads as 'not the lesson'. The tubes ring on through it.

T0+10P to T0+12P — resting at REST_POINT, breathing again. Next pass starts at T0' = T0 + 12P.

Two implementation facts that are load-bearing, not polish: (1) every ball position is derived from the sequencer's own beat clock, so the arrival is sample-exact against the audible click — a ball that lands a frame late teaches the wrong instant; (2) the demo drives the real chimes through the real cue path, so the glow and the ring he watches are the same events his own hand will produce.

**Now you try.** Now you. When the big number says 3, reach your free hand out at the tubes and hold it there.

- doing well: They can see you — hold it there. They start on the next 1.
- struggling: Sooner — reach out while the number still says 3. Don't wait to hear them.
- stuck 20 s: Watch the ball again. Arm straight out at the tall tubes on your right — like pointing something out to a friend.

**Live mirror.** Two things sit side by side where the old progress line was. First, one huge number stepping 1 2 3 4 on every drum hit, with the 1 drawn twice the size and lit gold — that is the count, shown, never named. Second, one plain line reading the exact same pointing test the cue itself uses (VR: the free hand's index ray within 20 degrees of the tubes, beat hand excluded; desktop: cursor within 95 px of their projected centre), sampled every frame. It says one of four things and nothing else: "I don't see you pointing yet" — or, the instant the ray lands, "I can see you pointing" — or, the moment the point actually registers as a cue, "Got it. They start on the next 1." — or, if VR drops that hand mid-point, "I lost that hand for a second." The tubes themselves brighten on the same frame the line changes, so "did that count?" is answered in the world and not only in text. Nothing here is a countdown and nothing here is a score.

**Forgiveness.** Every bend below exists because the mechanism was already looser than the grader admitted, or because the tool lied about him.

WINDOW. Full marks for a point landing anywhere from two beats early up to the moment itself. That is not generosity: entrances are quantised to the 1, so any cue inside the preceding count brings them in on exactly the right beat. Late is the only real miss. The old grader had it backwards — it docked a musically correct early point to 75, and a full count early to 45 with "entrance lost", while the room would have brought them in perfectly.

LATENCY. Date the cue from when he STARTED pointing (the tracker's episodeStart), not from the 0.25 s later instant it fires. At this speed that hidden quarter-second is 0.375 of a beat: a learner pointing exactly on time was recorded late by the instrument, not by his hand. Fix the measurement; do not widen the band to cover it.

NEVER SILENT. If his point lands in the preceding count, they enter and he hears the reward. If it lands earlier than that, they enter early and the room says so plainly — "They started a count too soon. That was you. Wait for 3." If nothing lands at all, the room starts them itself on the next 1 and says "I started them that time. Your turn again." The old lesson reset to the same sentence in silence, three times.

ALWAYS PASSABLE. Tries are unlimited and uncounted. The lesson ends when he does it right twice, not after three failures; the line counts successes up to two and never counts failures at him. No clock appears on screen until he has succeeded once.

NO NUMBER UNTIL THE MOTION EXISTS. Until one of his points has actually started them, the card says "not yet" / "almost" / "that's it" — never 0 to 100. A score on a gesture he has never made measures only its absence, and that is what handed him 38.

BOTH HANDS ARE NOT REQUIRED. The drum leads itself here, so he never has to keep it going and point at the same time. Say it in the opening line: "The drum keeps itself going. You only point." On desktop this also makes the single cursor legitimate — the wording becomes "rest the pointer on the tubes" and the demo is otherwise identical.

TRACKING HONESTY. If VR loses the free hand mid-point, the room says so and the try does not count against him. A dropped joint is the room's failure, not his.

**It worked when.** The tubes brighten under his hand before there is any sound at all — and then, on the very next 1, they ring out over the drum. Something that was not in the room a second ago is there because he reached for it, and it arrived exactly where he put it. He does not need to read anything: he asked, and an instrument answered. Only on the card afterwards, and only once it has worked, does the room hand him the word — "That reach you just made is called a cue."

---

### pattern3 — "Middle, Side, Middle"

**Goal.** You can keep a rolling three-bounce loop going — middle, out to the side, middle — without counting anything, because where your hand is tells you where you are.

**The ball shows.** The glowing ball drops onto the drum three times in a rolling loop — down in the middle, out onto a glowing spot at the drum's right edge, back down in the middle — landing on a real drum hit every single time, then lifting high and starting the loop over.

**Narration while it shows.** Watch where it lands — middle, out to the side, middle. Then again.

**Path (implementable).** ROOM FRAME (all world metres, existing geometry, nothing new to model). The drum head is a disc of radius 0.376 m centred at (0, 0.906, -1.35); its top surface is y ~ 0.912. The ball is the existing `meshes.guide` unit sphere at scale 0.05 with material GUIDE. Every landing sits in the drum's plane, z = -1.35, so each touch coincides with a real audible timpani strike — the 'what you see IS what you hear' seam the room already owns from Lesson 1.

TWO TARGET SPOTS, DRAWN FOR THE WHOLE LESSON (before the ball moves, during, and after it leaves). MIDDLE at (0.00, 0.914, -1.35). SIDE at (+0.30, 0.914, -1.35) — 30 cm to the learner's right, 7.6 cm inside the rim, unmistakably ON the head. Draw each as `meshes.guide` scaled (0.085, 0.0015, 0.085) with GUIDE emissive dropped to 0.25. On the frame a landing occurs in a spot, ramp that spot's emissive to 0.95 and decay to 0.25 over 0.25 s. These spots are the target and they never leave — the ball is the teacher, the spots are the place.

TEMPO IS LESSON-OWNED. PATTERN3_BPM = 80, period P = 0.75 s. Set `followMode = 'lead'`, `seq.setTempoAnchored(80)`, `seq.start()`, and drive the ball from PATTERN3_BPM — NOT from `conductor.ensembleBpm`. (main.ts:229 currently derives the Lesson-1 ball's period from ensembleBpm, which in follow mode is following the student: a wobbling beginner watches a wobbling ball and gets no correction. The ball must be a MODEL, never a mirror.) For the whole lesson call `setClickBuffers(lo, lo)` so the engine's fixed four-beat accent (conductor.ts:322, hi on beatInBar 0) cannot mark a wandering false group against a group of three; restore `(hi, lo)` when the lesson ends.

ANCHOR. `demoT0` = the `scheduledAt` of the first click after the demo begins. Before that instant the ball sits motionless in MIDDLE at (0, 0.95, -1.35), dim-pulsing scale 0.05 -> 0.056 -> 0.05 at 1 Hz for 1.0 s. This is the home position the nine lessons have never had.

PER-FRAME PATH, with t = ac.currentTime - demoT0:
  n  = floor(t / P)                 // which arc
  ph = t / P - n                    // 0..1 inside the arc; ph = 0 IS the landing
  k  = ((n % 3) + 3) % 3            // 0: MIDDLE->SIDE   1: SIDE->MIDDLE   2: MIDDLE->MIDDLE
  A  = [0.20, 0.27, 0.42][k]        // arc height above the landing plane
  x0 = [0.00, 0.30, 0.00][k]
  x1 = [0.30, 0.00, 0.00][k]
  s  = ph*ph*(3 - 2*ph)             // smoothstep: at rest at both ends
  gx = x0 + (x1 - x0) * s
  gy = 0.95 + A * Math.sin(Math.PI * ph)
  draw(meshes.guide, multiply(translation(gx, gy, -1.35), scaling(0.05,0.05,0.05)), GUIDE)
The half-sine vertical is the exact easing Lesson 1 already uses. The smoothstep lateral matters: it puts the sideways travel in mid-air and brings x to rest before touchdown, so each landing is a clean spot rather than a smear.

THE THREE ARC HEIGHTS ARE THE GRAMMAR, NOT DECORATION. The hop out to the side is the LOWEST (A 0.20, apex y 1.15). The trip back in is medium (A 0.27, apex 1.22). The arc from the third landing to the next first landing is the TALLEST (A 0.42, apex 1.37, x stays 0.00 — straight up and straight back down). That tall lift is the ONLY visible difference between the two consecutive middle landings that close one loop and open the next; without it a learner cannot see where the loop restarts and has to count, which is the thing this lesson exists to remove. 0.42 / apex 1.37 is deliberately the identical apex Lesson 1's ball used, so a learner who did Lesson 1 reads the big bounce as 'and again'.

FLARE. On the frame the ball lands in SIDE (the transition into k = 1) scale it to 0.085 and ease back to 0.05 over 0.18 s. ONLY the side landing flares. The middle landings do not — the side is the one the learner has to go and get.

TIMING AGAINST THE SOUND. ph = 0 is the landing and it falls exactly on the drum's scheduled click, so the ball touches the head ON the sound, never near it. The room's existing head-strike flash already fires from that same click event, so head, ball and drum hit land on one instant.

WATCH (nothing measured, no clock, no counter, input ignored): 0.5 s fade-in, 1.0 s resting home pulse in MIDDLE, then 3 complete loops = 9 arcs = 6.75 s, then the ball settles into MIDDLE and holds dead still for 0.75 s. Total 9.0 s.

COPY (still nothing scored, still no clock): the ball keeps running the identical loop with GUIDE emissive dropped 0.9 -> 0.35, and the learner joins. Every one of the learner's own landings lights the spot it actually fell in, immediately, in the world — so 'did that count?' is answerable without reading anything.

ALONE (grading starts here and only here): the ball fades out over one loop, 2.25 s. The two glowing spots STAY.

RESCUE (stall path, ungraded, always achievable): the ball returns at full brightness and drops to a TWO-landing loop — MIDDLE, SIDE, MIDDLE, SIDE — at P = 1.0 s (60 BPM), both arc heights A = 0.20, same smoothstep lateral. After four clean alternations by the learner the third landing is added back and P returns to 0.75 s.

MIRRORED (left-handed): if the learner's first three side landings sit consistently on the negative-x side of their own middle, move SIDE to (-0.30, 0.914, -1.35) and mirror the ball's path with it, and say so in the mirror line. Decide once per run; never flip again mid-run.

DESKTOP: the ball is a world object so its screen path follows from the existing camera (eye [0.55, 1.55, 1.55] -> [0.55, 0.8, -1.5]) automatically, and the cursor feed already agrees in sense (`x: e.clientX`, +x to the right). Nothing extra to author.

**Now you try.** Now you — bounce along with the ball. Land where it lands.

- doing well: That's it — middle, side, middle. Keep the loop rolling.
- struggling: Your bounces are all landing in one place. Send the second one out to the glowing spot on your right.
- stuck 20 s: Slowing down — watch again. Just two now: bounce in the middle, then out to the side.

**Live mirror.** Reads `detector.beatXs` — the sideways position at the bottom of each bounce — classified live against the learner's own running middle and spread using the SAME classifier that scores, so what he watches is exactly what he is graded on. One plain line under the words, updated the instant each bounce lands. Building a loop: "I can see your hand · landed: middle · side · —". Loop complete: "I can see your hand · middle · side · middle ✓ · 2 loops in a row". The three slots fill left to right, the slot that just landed is lit, and the strip resets each loop. Before any sideways travel exists the line refuses to guess rather than printing three "middle"s it cannot actually tell apart: "I can see your hand — but every bounce is landing in the same place, so I can't tell them apart yet." Mirrored learner: "I can see your hand — you're sending yours out to the LEFT, so that's the side I'm watching." No hand at all: "I can't see a hand yet — bounce once and I'll show you where it landed."

**Forgiveness.** Nothing is graded until the ball has run three loops AND the learner has copied one with the ball still on screen — a number can only measure consistency of a motion that demonstrably exists, never its existence. There is no clock and no beat count: the lesson ends on two clean loops in a row, retries are unlimited and uncounted, and the progress line counts loops earned, never bounces failed. A loop counts as clean when the second landing is clearly out to the side and the first and third are not — the side landing IS the skill so it is required, while the two middles are judged with a wide band (a landing reads as middle at anything under 0.35 of the learner's own side excursion, against the current scorer's 0.25). The loop is anchored to the learner's OWN first side landing rather than to lesson start, so a correct loop that begins on a different bounce scores correct instead of near-zero — the side landing is unambiguous, so the phase can be recovered from the data instead of assumed. A learner whose side landings sit consistently on their left is doing the same skill mirrored and gets full marks: the room moves its target spot to match them and says so out loud. Random scatter still fails, so the check keeps its teeth. Small conducting is never rejected — instead of today's hard "spread below floor → score 15 and a card", the room says live that it cannot tell the landings apart and keeps coaching. After 20 seconds without a clean loop the ball returns bigger and slower and the task drops to two landings (middle, side, middle, side) which is ungraded and always achievable; the lesson may end there with "you can put your hand in two different places on the beat, and that IS the trick" — never with a low number and a five-second auto-advance. The card waits for Again or Next; it does not expire. And because the four-landing lesson just built the opposite habit — he scored 30 then 20, the signature of interference, not of difficulty — these two never run back to back: free play sits between them, and here the ball shows one extra full loop before any words appear at all. Two current strings must die outright: the failure line "sweep clearly to the left and right corners" instructs a motion this loop does not contain (there is no left in it) and would break a learner who obeyed it, and "hit the corners harder" asks for force where the room measures distance — the same force Lesson 3 taught controls volume, so obeying it makes the drum loud and changes nothing on the score.

**It worked when.** The drum starts rolling under his hand instead of just answering it — and he catches himself already heading out to the side spot before he has thought about going there. He stops looking at the panel. He knows where he is in the loop from where his hand is, not from counting, and the tall lift arrives as a feeling of "and again" rather than as a number.

---

