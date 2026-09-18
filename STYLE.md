# STYLE.md — how to write in my Notion

Read this file before you create or edit any Notion page. These rules are the
user's taste. Follow them even when another layout looks easier.

## 1. Cards, not table rows

Never show a list of items as a table. Show each item as a **card**.

- One card = one item (what would have been one table row).
- A card has a **big title** and **small inner data**.
- Use a table only when the user asks for one by name.

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
