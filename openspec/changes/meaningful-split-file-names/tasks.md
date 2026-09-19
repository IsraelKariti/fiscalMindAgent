## 1. Name rules (pure code)

- [ ] 1.1 Add a pure module next to `splitFileRules.ts` with `childDisplayName(documentName)` and `childDownloadName(label, parentFilename, pageFrom, pageTo)` as described in design.md decision 2; verify with `npm run typecheck`
- [ ] 1.2 Add `tests/splitChildNames.test.ts` (and its entry in the `npm test` list in `package.json`) covering: plain Hebrew name, empty / whitespace name → `null`, cap at 150 characters, parent name with and without `.pdf`, illegal file-name characters replaced, the example `אישור יתרות - בנק לאומי (scan p1-2).pdf`; verify `npm test` passes

## 2. Give the name

- [ ] 2.1 Add `documentFiles.setLabel(id, label | null)` in `src/db/queries/documentFiles.ts`; verify with `npm run typecheck`
- [ ] 2.2 In `classifyAndStore` (`analyzeInboundFile.ts`) set the label of a child file after the classification gate: matched list document's name when the match survived the gate and the file is not quarantined, otherwise `null`; also `null` on the failed-analysis path; never touch a file without a parent. Verify by reading the row of a split test file in the local DB after one run (task 4.1)
- [ ] 2.3 In the `proposedPairs` loop of `plan.ts`, after `linkToDocument`, set the label of a child file to the linked document's name; verify with `npm run typecheck` and task 4.2

## 3. Show the name

- [ ] 3.1 `web/src/components/Timeline.tsx` `attachmentLabel`: a child with a label reads `<label> · <original label> · pages X-Y`; a child without a label and every other file read as today. Verify in the running GUI on the split test client
- [ ] 3.2 Check `DocumentsCard.tsx` and `FileViewModal.tsx` with a labelled child: the name is the label and the "pages X-Y of <original>" line is still shown; fix only if one of them hides the source. Verify in the running GUI
- [ ] 3.3 Download route in `src/api/workspace.ts`: send `childDownloadName(...)` for a labelled child, the stored file name otherwise; verify with an authenticated `curl -I` on a labelled child and on an ordinary file (cookie in a scratchpad file, deleted after)

## 4. Live check

- [ ] 4.1 With the user's dev stack running, send a two-document PDF to a paused test client in review mode (the scratch-script method used for `reply-after-full-turn`): both children get the names of their matched list documents; a child that matches nothing keeps `…-pX-Y.pdf`. Delete the scratch script after
- [ ] 4.2 Confirm in the same run that the planner's prompt still lists the children by stored file name (LLM call browser) and that a planner link to another document changes the label (force it by editing the label in the DB to another document's name before the planner run, then check it is corrected)

## 5. Docs and wrap-up

- [ ] 5.1 Update the file-splitting section of `docs/agents.md` with the display-name rule and the two formats; verify the text matches the delta spec
- [ ] 5.2 `npm run typecheck`, `npm test`, `npm run build:gui` all pass; commit per the repo Git workflow
