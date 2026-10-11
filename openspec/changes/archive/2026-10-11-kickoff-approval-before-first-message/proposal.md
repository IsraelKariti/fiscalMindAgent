## Why

The accountant wants to read the agent's first message to a client before it goes out. Today the monday kickoff unpauses the client and the first message is sent on its own at the planned time; the accountant only sees it after the fact or by catching the scheduled bubble in time.

## What Changes

- The monday kickoff no longer unpauses the client. It runs the questionnaire intake as before and has the agent draft the first message **while the client stays paused**: the draft is stored with its planned time, no send is queued, and the timeline shows it the way any paused scheduled message is shown today (the text, "מושהה — מתוזמן ל־…", a Resume button).
- Resuming is the approval. When the accountant clicks Resume and the planned time is still ahead, the message is sent at that time (today's behaviour). When the planned time has passed, an in-app modal first explains that the message will be sent immediately on resume; on confirm the **same draft** is sent right away (today the agent would draft a new message instead). This applies to every resume of a client with a preserved draft, not only the first message.
- A client reply arriving while the first message is held is handled as today, except that the re-plan refreshes the held draft instead of dropping it; nothing is sent until the accountant resumes.
- Nothing changes in monday: no new status label, no board edits. The existing "בטיפול סוכן" sync and the `client.kickoff_triggered` audit stay at kickoff time.
- No new routes, buttons, badges, settings or markers. The held state is simply "paused, never contacted, draft preserved".

## Capabilities

### New Capabilities

- `first-message-approval`: a manual-kickoff client's first message is drafted on the kickoff but held while the client stays paused; the accountant's resume sends it, at the planned time or immediately (after a warning) when that time has passed.

### Modified Capabilities

- (none — `declaration-kickoff` covers identity reading at kickoff, which does not change)

## Impact

- `src/webhook/mondayKickoffRoute.ts`: the start step no longer unpauses; the startable guard also ignores a client whose first draft already exists or is being written.
- `src/orchestration/setFutureEmail.ts`, `src/orchestration/scheduleDraftEmail.ts`: a "hold" path for a paused, never-contacted manual-kickoff client — draft and mirror the planned time, do not queue the send.
- `src/orchestration/resumeFutureEmail.ts`: a preserved draft whose time has passed is sent now instead of redrafted.
- `web/src/components/Timeline.tsx`, `web/src/i18n.tsx`: the past-due warning modal on Resume (in-app, never a browser dialog).
- `docs/pipeline.md` section C and `docs/agents.md` manual-kickoff paragraph updated.
- No migration, no monday board changes.
