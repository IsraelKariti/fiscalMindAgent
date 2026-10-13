# Proposal: discarded-drafts-in-trace

## Why

When an admin presses "regenerate" (in the workspace timeline or in the review queue), the agent re-plans and the previous draft vanishes from the workspace timeline together with the LLM call that wrote it. The admin then cannot compare the new draft with the old one, or see why the old draft was wrong. The rows still exist in the database (the conversation endpoint already flags them `discarded`); the timeline just hides them.

## What Changes

- The workspace timeline (admin impersonation) shows a replan's discarded drafts as muted "discarded draft" bubbles while the **LLM calls** toggle is on. With the toggle off, nothing changes: the timeline looks exactly as today.
- While the **LLM calls** toggle is on, the `generate_message` call that wrote a discarded draft is no longer dropped from the trace; it shows beside its draft like any other call.
- While both toggles are on, the `send_reply` step of a discarded draft shows too. With only **code steps** on, it stays hidden as today (a step of a draft the viewer cannot see is noise).
- Discarded drafts never count in the "N messages" header, never carry action buttons (approve, send now, regenerate), and never affect the accountant's view: accountants have no trace toggle and still never see them.
- No server change: the admin conversation endpoint already returns every outbound row with a `discarded` flag.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `conversation-trace`: new requirement — discarded drafts (and their call / step rows) are part of the trace shown under the LLM calls toggle.

## Impact

- `web/src/components/Timeline.tsx`: `mergeTrace` gains a row kind for discarded drafts and stops dropping their call / step rows while the calls toggle is on; a small muted bubble renders the discarded draft.
- `web/src/i18n.tsx`: badge text for the discarded draft bubble (the admin viewer's "טיוטה שנזנחה" can be reused).
- `web/src/styles.css` (or wherever bubble styles live): a muted style for the discarded bubble.
- `src/api/llmAdmin.ts`: unchanged (flags already computed). `AgentConversationsCard` (admin viewer) already shows discarded drafts with a badge and is unchanged.
