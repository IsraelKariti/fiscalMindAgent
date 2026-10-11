## Why

When a client is active in the conversation, the agent's reply should reach them while they are still at the phone. Today the planner must pick a wall-clock `send_at` ("YYYY-MM-DD HH:MM") for every follow-up, so even a reply to a client who wrote a minute ago is pushed to the next whole minute at best, and in practice the model often picks 5–15 minutes ahead. The prompt's momentum rule ("reply within minutes") is advice the model follows unevenly, and there is no way for it to say "send this as soon as you can".

A blind code rule ("client wrote in the last 15 minutes → send now") is not wanted: the model reads the conversation and knows when an immediate reply is wrong (the client said "I'm looking for the document now, I'll answer soon"; the client asked for time; the message is a reminder, not an answer). The decision stays with the model; the platform only gains a way to express it.

## What Changes

- The planner's follow-up answer may set `send_at` to the literal value `asap` instead of a wall-clock time. The code then picks the time itself: now plus one second. From there the draft is scheduled exactly like any other time, so it goes out as soon as the planning cycle finishes and the existing send-time gates pass (admin review approval, held first message, WhatsApp 24h-window check at send time).
- The planner prompt gains explicit rules for when to answer `asap` and when to keep choosing a time: `asap` only for a reply to a client who is active right now and is waiting for the answer (including the reply written after file verification); a time whenever the client signalled they need a moment, when the message is a reminder or a proactive message, when the client has been silent for a while, or when waiting for a verification code.
- The decision gate accepts `asap` only on `follow_up`; `collect` and `goal_complete` still require `send_at` null. The blocked-day guard (weekend/chag roll-forward) ignores `asap`.
- The trace step `send_reply` and the planner log record both the request (`asap`) and the time the code picked; the timeline shows that picked time like any other.
- Evals: the planner stage accepts `asap` as a valid future send time, cases may pin `send_asap` true/false, and two new cases cover "client is waiting → asap" and "client said they'll be back soon → timed".

## Capabilities

### New Capabilities
- `reply-timing`: when the agent's follow-up message leaves — the model chooses between an immediate send and a scheduled time, under stated conditions, and the platform honours an immediate send through the same gates as a scheduled one.

### Modified Capabilities
- (none — `inbound-turn`, `verification-reply` and `admin-message-review` requirements are unchanged; the immediate send flows through their existing gates.)

## Impact

- `src/agents/declarationOfCapital/prompt.md` (send_at rules, momentum section), `prompt.ts` (keep-alive contract line), `decisionSchema.ts` (accept `asap`, corrected-answer hint), `plan.ts` (`scheduleReply` delay), `src/agents/shared/sendAtGuard.ts` (pass-through), `evals/stages.ts` + `evals/cases/generate_message.json`, tests (`decisionKeepalive`, `collectDecision`, `sendAtGuard`), `docs/pipeline.md`, `docs/agents.md`.
- No migration, no API change, no UI change (the timeline already shows whatever send time the scheduler computed).
