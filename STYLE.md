# STYLE.md — how to write in my Notion

Read this file before you create or edit any Notion page. These rules are the
user's taste. Follow them even when another layout or wording looks easier.

## 0. Page template: answer first

Every content page (an accounting group, a document type, an LLM call, a
code gate) has this shape, top to bottom. Sample: Accounting → Form 106.

1. **The answer**, one sentence, as a quote block (`> ...`). It says what is
   decided. A reader who reads only this line knows the rule.
2. **Four tiles** in one `<columns>` row: small callouts that answer the
   questions a reader always has. Each tile is a `<callout color="gray_bg">`
   with a `####` label in gray and one bold value under it. Default labels
   for a document page: "Needed?", "How many", "Who sends it", "Status".
   Pick other labels when the page needs them, but always four, always
   short. The "Status" tile is `yellow_bg` when the accountant has not
   confirmed the rule yet, `gray_bg` when confirmed.
3. **Tabs** (`<tabs>`), so the page never scrolls far. Fixed tab names and
   order: "Rules", then any extra topic tabs ("Where it comes from",
   "The papers"), then "Open questions", then "For developers". Each tab
   has an emoji icon. Leave out a tab that would be empty.
4. **No "For developers" toggle** at the end of the page any more: the
   developer content lives in the last tab, as cards.

### Cards separate the paragraphs

Inside a tab, every topic is one card (a `<callout>` with an emoji icon and
`gray_bg`). The card starts with a `###` title, then two or three short
sentences. Never two bare paragraphs in a row: a new topic is a new card.
Two short cards may sit side by side in `<columns>`.

### H4 is the small label

Use `####` (heading 4, gray) for a small label inside a card or a tile:
the tile label ("Needed?"), a sub-label inside a card ("Not confirmed
yet", "Example", "Exception"). Never use `####` as a section heading on the
page itself; sections are tabs, topics are `###` cards.

### Open questions are to-dos

"To confirm with the accountant" is never bold text inside a sentence. It
is one to-do line (`- [ ]`) in the "Open questions" tab, written as a full
question. The card that depends on the answer gets a gray `####` label
"Not confirmed yet" that points to the tab. When the accountant answers,
tick the to-do and write the answer under it.

## 1. Cards, not table rows

Never show a list of items as a table. Show each item as a **card**.

- One card = one item (what would have been one table row).
- A card has a **big title** and **small inner data**.
- Use a table only when the user asks for one by name.
- A plain list of one-line points (rules, steps, word meanings) stays a bullet
  list. Cards are for items that have several fields.

### How to build a card

A card is a `<callout>` block. Notion has no real "card" block in page content,
so this is the closest match.

- First line inside the callout: a heading. This is the big title. `##` on
  a hub page (cards that link to child pages), `###` inside a tab (rule 0).
- Under it: the data, as short `**Label:** value` lines in gray. Keep each
  line to a few words. No long sentences inside a card.
- Give each card an emoji icon that fits the item.
- Use a soft background color (`gray_bg` by default). Use one color for all
  cards in the same group.

```
<callout icon="🛡️" color="gray_bg">
	## Injection screen
	**Purpose:** `injection_detection_llm` {color="gray"}
	**Temperature:** 0 {color="gray"}
	**Gate:** `validate_injection_scan` {color="gray"}
</callout>
```

### How to lay cards out

- Put cards side by side with `<columns>`, two cards per row. Use three per
  row only when every card is very short.
- An odd last card sits alone in the left column.
- When a card is about a child page, make the title a link to that page
  (`<mention-page>`), so the card is clickable.

```
<columns>
	<column>
		<callout icon="🛡️" color="gray_bg">
			## Card one
			**Label:** value {color="gray"}
		</callout>
	</column>
	<column>
		<callout icon="📝" color="gray_bg">
			## Card two
			**Label:** value {color="gray"}
		</callout>
	</column>
</columns>
```

### Items that live in a Notion database

When the items are database rows, do not show the table view. Create or switch
to a **gallery view** (Notion's own card view): large title, and only a few
small properties visible on the card.

## 2. Simple English

The reader is not a native English speaker and knows basic English. Every page
must be clear to that reader.

### Sentences

- Short sentences. One idea per sentence. Aim for 15 words or less.
- Use the present tense and the active voice: "The code checks the answer",
  not "The answer is then validated".
- Say who does the action: "the model", "the code", "the client", "the
  accountant".
- No idioms, no slang, no metaphors, no jokes. Write the literal meaning.
- Prefer one simple verb over a verb with a small word after it: "remove",
  not "get rid of"; "continue", not "carry on".
- Do not use "it" or "this" when the reader could be unsure what it points
  to. Repeat the noun.

### Words

- Use common words. Examples:
  - "check" — not "validate", "verify", "assert"
  - "word for word" — not "verbatim"
  - "answer" — not "verdict", "response", "output" (in running text)
  - "proof" or "quote" — not "evidence" (in running text)
  - "block" — not "quarantine", "suppress"
  - "from outside, not trusted" — not "untrusted", "hostile"
  - "use" — not "utilize", "leverage"
  - "needed" — not "required" (in running text)
  - "item" — not "instance" (in running text)
- Use the same word for the same thing on every page. Do not change words for
  variety. Fixed terms: **LLM call**, **code gate**, **checklist**, **the
  model**, **the client**, **the accountant**.
- Name an LLM call or a code gate only by its page title, as a page link
  (`<mention-page>`), so the reader sees the full name and can click it.
  Example: "3. File classification", "verify_extraction". Never "LLM call
  3", "the classifier", "the extraction LLM", "the gate".
- When a technical word is needed, explain it in a few words the first time
  it appears on the page. Example: "schema (the fixed shape of the answer)".
- A top page of a hierarchy has a short "Words used in these pages" list.

### Code names

- Names from the code stay exactly as they are, in backticks: `evidence`,
  `not_required`, `validateInjectionScan`. Never translate or simplify a code
  name.
- When a code name is a hard word, add the simple meaning once:
  "`attestation` (the client's final confirmation)".
- Code blocks (schemas, types) stay as code. Write their comments in simple
  English too.

### Technical pointers go in the last tab

Code names, file paths, function names and the temperature never open a
page. They live in the "For developers" tab (rule 0), as cards with plain
labels ("File with the code", "Name of this call in the trace and the
logs", "Randomness (temperature)"). The top of the page starts with the
answer in plain words.

### Prompt slots (placeholders)

When a page shows a prompt with slots like `{{expected_name}}`, never list
the slot names alone. Say first what the prompt is: a fixed text in the code
with empty slots that the code fills before each call. Then one card per
slot with: the slot name, where the value comes from, what it says (with a
real example), and when the slot is filled or left empty.

### Shape of the page

- The page follows rule 0: answer, four tiles, tabs, cards.
- Inside a tab, short cards with clear `###` titles: "What it does", "When
  it runs", "Input", "Output", "Schema".
- Prefer a short bullet list over a long paragraph.
- Do not repeat the same information in two places on one page.

## 3. Diagrams

The text inside a diagram must be easy to read without zooming.

- When a page describes a decision with branches (for example: which
  documents are needed depends on a condition), add a flow chart next to
  the text. The user finds a chart simpler to understand than prose.
- A thing that is *not* accepted can appear in the chart as a red node with
  a dotted edge labelled "never replaces".

### A flow chart shows actions and decisions, nothing else

- **Every box is one action**, in time order from top to bottom. Write it
  as "who does what": "The code builds the prompt", "The model reads the
  data", "The accountant gets an email". The actor is always one of: the
  code, the model, the client, the accountant, or a page title such as
  "5. Conversation planner".
- **Never a box for a thing** (data, a file, a table, a list, an item). A
  diagram made of nouns tells the reader nothing. If a thing matters, say
  it inside the action: "The code reads the type of the item".
- **A decision is a diamond** with one plain question a human can answer:
  "All checks passed?", "Can the code check this file?". Its arrows carry
  only the answer: "Yes" / "No" (or a short answer such as "Third time").
  No other text on any arrow.
- **Every box and diamond carries the function that runs it** as its
  last line, in small monospace text under the Hebrew line: for example
  `documentTypeRules`. Only the function name goes in the shape; the file
  name goes in the chip under the chart (rule below).
- **No other internal names in the chart**: no slot names, no field names,
  no "user turn" / "system prompt". Put them in the list under the chart.
- **The chart ends in outcomes**: what happens to the document, the client
  or the accountant, in plain words ("The document is approved", "The
  accountant takes over").
- **One process per chart**, 6 to 12 boxes. A chart with more steps is two
  charts.
- **Under the chart, one line per box**, starting with the box text, with
  the detail and the links to the pages.
- **Every step line under the chart names the function that runs it**, as
  a small code chip after the detail: `verifyDocument.ts · documentTypeRules`.
  The chip reads "function: file · name". Take the names from
  `docs/pipeline.md` and check they exist in the code. A decision diamond
  names the function that answers it. The boxes themselves stay free of
  code names (rule above).
- Box text is one short sentence, up to 10 words, plus its Hebrew line.
- A process that builds an input (a prompt, a request) is also drawn as
  actions: "The code takes X", "The code adds Y", with a diamond for each
  "only when" condition. The chart ends with the model's answer.
- Every node and every branch label carries the Hebrew term too. A node
  gets the Hebrew on its last line (`<br>` inside the label), for example
  "The document is approved<br>המסמך מאושר". A branch label gets it after
  a middle dot, for example "Second hand · יד שנייה". Plain "Yes" / "No"
  stay English.
- Colors: blue box = the model, gray box = the code, green = good outcome,
  yellow = the document opens again, red = stop / accountant.
- A flow chart does not live inside the Notion page as a mermaid block:
  mermaid charts render huge and unclear there. Build the chart as a
  Claude artifact (an HTML page with an SVG chart and the numbered step
  list under it) and put a link card on the Notion page in its place: a
  `<callout>` with the artifact title as a link ("open the chart") and
  two gray lines: what the chart shows, and that the box numbers match
  the step list on the page. Before creating a new artifact, list the
  existing ones and reuse a matching one.
- The color legend lives only inside the chart artifact. Never repeat
  it as a sentence on the Notion page.
- A chart of a whole process lives on the process page ("File
  handling", "Flow diagram"), never on the page of one LLM call or one
  code gate inside it. The LLM call page gets one line, "Where it sits",
  with a link to the process page and the step number.
- The Notion page never repeats the steps of a chart as a list. The
  step-by-step list (one line per box, with the function chip) lives
  only under the chart in the artifact. On the page, next to the chart
  card, put at most one card with the facts a reader must know without
  opening the chart, for example "How it ends" with one line per
  outcome.
- Name a chart after the whole process it shows, in plain words:
  "Document Processing Flow". Never "check" or "verification": a check
  sounds like one small step, and "verification" is the name of a code
  gate. The heading above the step list on the page uses the same name:
  "Document processing, step by step", with one line that says where the
  process starts and ends.
- Make the text big. In a mermaid diagram (only outside Notion), put
  this line first:
  `%%{init: {'themeVariables': {'fontSize': '26px'}}}%%`
- Number the LLM call nodes like their pages: "1. Injection screen".
- A diagram block shows in **Preview** mode, never in Split or Code mode.
  The Notion API cannot set this mode. So after you create or replace a
  diagram, tell the user: "Set the diagram block to Preview" (block menu →
  Preview). Prefer `update_content` on the code inside an existing diagram
  block, so the block and its mode stay the same.

## 4. Where a topic lives in the hierarchy

- **Accounting rules** (which documents the office needs for a thing the
  client owns or owes, and when one document replaces another) live under
  the root page → **Accounting**. One child page per group of documents
  that depend on each other: Real estate, Funds, Bank accounts, Debts,
  Vehicles, Home contents, Business and investments, Other documents.
- Each Accounting page has the decision as a flow chart (rule 3) and links
  to the per-type pages under "4. Document extraction".
- **Model and code behavior** (prompts, schemas, gates, checks) lives under
  "LLM calls" and "Code gates". Do not put accounting rules there; link to
  the Accounting page instead.
- **An LLM call page describes the call only**: what the model reads, the
  input, the output, the schema, and the fields per type. It does not list
  the checks or what happens after the gate. It links to the gate with one
  card.
- **A code gate page describes the checks**: the general checks, the checks
  per document type (as cards that link to the type pages), and what
  happens with the result.
- When a new document type or paper is added, add it to the matching
  Accounting page, or create a new group page when the documents depend on
  each other and on no existing group.
