# STYLE.md — how to write in my Notion

Read this file before you create or edit any Notion page. These rules are the
user's taste. Follow them even when another layout or wording looks easier.

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

- First line inside the callout: a `##` heading. This is the big title.
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

### Shape of the page

- Short sections with clear headings: "What it does", "When it runs",
  "Input", "Output", "Schema", "Rules".
- Prefer a short bullet list over a long paragraph.
- Do not repeat the same information in two places on one page.

## 3. Diagrams

The text inside a diagram must be easy to read without zooming.

- At most **3 words** in each node. Edge labels are short too.
- Make the text big. In a mermaid diagram, put this line first:
  `%%{init: {'themeVariables': {'fontSize': '26px'}}}%%`
- Do not put code names or details inside a node. Put them in a short list
  under the diagram.
- Number the LLM call nodes like their pages: "1. Injection screen".
- A diagram block shows in **Preview** mode, never in Split or Code mode.
  The Notion API cannot set this mode. So after you create or replace a
  diagram, tell the user: "Set the diagram block to Preview" (block menu →
  Preview). Prefer `update_content` on the code inside an existing diagram
  block, so the block and its mode stay the same.
