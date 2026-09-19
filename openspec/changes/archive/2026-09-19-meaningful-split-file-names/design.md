## Context

See proposal.md for the motivation. What shapes the approach:

- A child file is created before it is classified (`storeChild` in `analyzeInboundFile.ts`), so its stored `filename` can only be `<original>-p<from>-<to>.pdf`. The meaning is known later, in `classifyAndStore`, once `validate_classification` has accepted or dropped `matched_document_id`.
- `document_files.label` already exists (migration 035, used for the per-employer Form 106 files). The documents list, the file viewer and the step details already show `label ?? filename`. The documents list already prints a second line "pages X-Y of <original>" for every child.
- The conversation view (`Timeline.tsx` `attachmentLabel`) returns `label` first, so a labelled child would lose its original name and page range there.
- The planner's prompt prints `filename` (sanitized, untrusted) plus `[pages X-Y of file id: …]` for a child; it never prints `label`.
- The planner can link a file to a list document on its own (`linkToDocument` in `plan.ts`), also to a document other than the classifier's match.

## Goals / Non-Goals

**Goals:**
- A matched child shows a meaningful name everywhere a person sees it, with the source (original name, pages) still visible.
- The name comes only from the client's document list.
- No migration, no new model call, no prompt change.

**Non-Goals:**
- Renaming files that were never split.
- Naming a child that matches nothing (owner chose option 1; the model's `kind` text stays audit-only).
- Keeping the name in step when a list document is later renamed or removed — the name is a snapshot taken at match / link time.
- Renaming the blob in storage or changing `provider_attachment_id`.

## Decisions

### 1. Use the existing `label` column, do not rewrite `filename`
`filename` of a child feeds the idempotency of `insertIfNew` only through `provider_attachment_id`, but it is also what the planner sees and what audit rows of earlier steps quote. Rewriting it would make the trail inconsistent (the split step logs one name, later steps another). `label` is already the "display name" concept of this table and every UI surface prefers it.
*Alternative considered:* rename `filename` after classification — rejected for the reasons above and because a second classification run would need to rebuild the name from the parent again.

### 2. One pure helper owns the two name formats
A new pure module (next to `splitFileRules.ts`) exports:
- `childDisplayName(documentName)` → trimmed, inline-sanitized, capped (150 chars) label, or `null` when empty;
- `childDownloadName(label, parentFilename, pageFrom, pageTo)` → `<label> (<parent base> p<from>-<to>).pdf` with characters illegal in file names (`\ / : * ? " < > |` and control characters) replaced by `-`.
Both are unit-tested; the web side needs no copy because it only concatenates `label`, the parent's label and the page range.

### 3. Set the label in `classifyAndStore`, for children only
After `setAnalysis(file.id, 'done', analysis)`: when `file.parent_file_id !== null`, compute the label from the matched list row (`requiredDocuments.find(d => d.id === analysis.matched_document_id)`) unless the gate quarantined the file; write it with a new query `documentFiles.setLabel(id, label | null)`. Writing `null` on a no-match verdict makes a second classification run remove a stale name. On the `failed` path the label is set to `null` too.
The gate has already cleared `matched_document_id` when it dropped the match, so "accepted match" is simply "id still present and not quarantined".

### 4. The label follows a planner link
In the `proposedPairs` loop of `plan.ts`, after `linkToDocument`, when the file is a child (`parent_file_id !== null`) set its label to the linked document's name through the same helper. Files fetched by the platform keep their own labels because they are never children.
*Alternative considered:* compute the display name at read time from `client_document_id` / `analysis.matched_document_id` — rejected: three UI surfaces and the download route would each need the join, while a stored label needs none.

### 5. Conversation label keeps the source
`attachmentLabel` in `Timeline.tsx`: for a file with a parent and a page range, build `<parent label> · pages X-Y` first, then prefix `label · ` when the child has one. Other files keep today's `label`-first rule.

### 6. Download name
`GET` file download in `src/api/workspace.ts`: when the row has `label`, `parent_file_id`, `page_from` and `page_to`, load the parent's `filename` and send `childDownloadName(...)` in `Content-Disposition` (already RFC 5987 encoded, so Hebrew is safe). `mediaRoute.ts` (the public media URL used for outbound WhatsApp media) is left alone: children are never sent out.

## Risks / Trade-offs

- [A list document name contains text the client dictated, e.g. a bank name] → it is already shown as the row title in the same screen and already sanitized when it enters the list; the helper sanitizes and caps it again, and the label never enters the planner prompt as a file name.
- [Two children match the same list document and get the same display name] → the page range and the original name stay next to the name in every surface, so they remain distinguishable.
- [A list document is renamed after the match] → the child keeps the old name until it is classified or linked again; accepted (Non-Goal).
- [Existing children in the database have no label] → they keep the page-range name; no backfill. Acceptable for the current data (local test clients only).

## Migration Plan

No schema change. Deploy is a normal push. Rollback = revert the commit; labels already written stay harmless because the UI has always preferred `label`.
