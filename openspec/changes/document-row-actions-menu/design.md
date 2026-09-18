## Context

See proposal.md for the motivation. Current state in `web/src/components/DocumentsCard.tsx`:

- `capitalRow` builds a `controls` array of inline `smallBtn` buttons per status, a `badge` that is `null` for `unresolved`, `pending` and `not_required`, and a standalone `chip-x` remove button.
- Every action goes through `setStatus(doc, status)` or `api.deleteDocument`, both wrapped by `run()`, which sets the card-wide `busy` flag and refreshes the list.
- `classicRow` is unreachable in the single-agent setup (the only agent always passes `capital`).
- `web/src/components/Dropdown.tsx` already solves the hard popover problems for this app: portal to `<body>`, fixed position from the trigger rect, flip upward, reposition on scroll/resize, close on blur and Escape, arrow-key focus.
- The UI is Hebrew-only (`i18n.tsx` exports a single `he` table) and RTL. The card also renders inside the monday custom object iframe.
- `web/` has no component test setup; verification is typecheck plus driving the running app.

## Goals / Non-Goals

**Goals:**
- Status and action are visually and verbally distinct on every row.
- One reusable menu component, behaving like the existing `Dropdown` so the app has one popover idiom.
- Zero change to action semantics, API calls or the `busy`/`run` flow.

**Non-Goals:**
- No confirmation step for "remove" (today's "×" has none; adding one is a separate behavior change).
- No change to `classicRow`, file sub-rows, group order, collapsed groups, progress badge or attestation line.
- No new statuses or transitions, no server work.

## Decisions

**1. New `ActionMenu` component, modeled on `Dropdown`, not a reuse of it.**
`Dropdown` is a value picker: `role="listbox"`, a `selected` option, a trigger that shows the current value and spans the full width. A row menu has no value, needs `role="menu"`/`menuitem`, an icon-only trigger, per-item `danger` and `title`, and a width set by its content rather than by the trigger. Forcing both into one component would add more flags than code shared. `ActionMenu` copies the proven mechanics (portal, fixed placement, upward flip, capture-phase scroll listener, blur/Escape close, arrow keys, focus back to trigger).
Props: `items: { key, label, onSelect, title?, danger? }[]`, `label` (aria-label/title of the trigger), `disabled`.
*Alternative considered:* an in-flow absolutely positioned list. Rejected: the documents list scrolls inside the panel and inside the monday iframe, so an in-flow list would be clipped or would stretch the scroll area — the same reason `Dropdown` portals.

**2. Horizontal placement is clamped to the viewport, anchored to the trigger's outer edge.**
In RTL the trigger sits at the left end of the row. The menu's left edge aligns with the trigger's left edge, then the computed `left` is clamped to `[8px, innerWidth − menuWidth − 8px]`. This is direction-agnostic, so no `dir` lookup is needed and the narrow monday iframe is covered.

**3. "Only one menu open" comes from focus, not shared state.**
Opening a second menu moves focus to it; the first closes through its blur handler, exactly as `Dropdown` does. No context or lifted state.

**4. All actions go into the menu, including today's primary ones.**
`unresolved` (mark required), `claimed` (confirm receipt) and stalled `collected` (approve manually) have a highlighted primary button today. They move into the menu too, so every row has the same shape and there is one place to look for actions. The group titles ("סופקו כבר — ממתינים לאישורך") and the badges already tell the accountant that a row needs them. In the menu, the item that was primary is listed first.
*Alternative considered:* keep primary buttons inline and put only secondary actions in the menu. Rejected for now: two action locations per row is the inconsistency this change removes. It is cheap to revisit if the extra click proves annoying (see Risks).

**5. Badge for every status, from one lookup.**
Replace the nested ternary with a small status → `{ class, label }` mapping; `collected` keeps its stalled override. New badges: `unresolved` → `badge-warning` "בבירור מול הלקוח"; `pending` → `badge-pending` "ממתין ללקוח"; `not_required` → `badge-neutral` "לא נדרש". Existing badges keep their class and text.

**6. i18n strings.**
- Changed labels: `markRequired` → "סימון כנדרש", `markNotRequired` → "סימון כלא נדרש". `approveManually`, `confirmClaimedReceipt`, `reopenDocument`, `removeDocument` are already action phrases and stay.
- New keys: `unresolvedStatus`, `awaitingClientStatus`, `notRequiredStatus`, `rowActions` ("פעולות") for the trigger's `aria-label`/`title`.
- `pendingStatus` ("ממתין") is used by `classicRow` and stays untouched.
- `confirmClaimedTitle` stays as the `title` tooltip of the confirm-receipt menu item.

**7. Trigger look.**
An icon-only button using the existing `icon-btn` class with a three-dot SVG, so it matches the view/download icons on file sub-rows and cannot be mistaken for a badge. Menu items reuse the `dropdown-option` look; the remove item adds a danger text color.

## Risks / Trade-offs

- [Actions the accountant must take (confirm receipt, approve manually) are now two clicks and less visible] → The item is first in the menu, the group title and badge flag the row. If it hurts in use, decision 4's alternative is a small follow-up.
- ["Remove" sits in a list next to harmless actions, still without confirmation] → It is last, separated by a divider and danger-colored. Same exposure as today's always-visible "×"; a confirm modal is a separate change.
- [Portaled menu inside the monday iframe] → `Dropdown` already works there the same way; verify once after `npm run build:gui`.
- [Blur-based closing can fire before an item's click on some browsers] → Reuse `Dropdown`'s `relatedTarget` containment check, which already handles the portaled list.
