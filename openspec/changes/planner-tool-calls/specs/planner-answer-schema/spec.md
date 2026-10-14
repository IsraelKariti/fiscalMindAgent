## REMOVED Requirements

### Requirement: A follow-up answer carries one WhatsApp message and no channel choice
**Reason**: The planner no longer answers with one form; the same rule is restated for tool calls in `planner-answer-tools` ("A follow-up answer carries one WhatsApp message and no channel choice").
**Migration**: None at runtime. The gate keeps rejecting an answer with both or neither message; the fields `whatsapp_text`/`whatsapp_template` become the tools `send_whatsapp_text`/`send_whatsapp_template`.

### Requirement: The request schema lists only the groups this client can use
**Reason**: There is no single request schema. The per-call selection moves to the tool set ("Only the tools this call can use are offered" in `planner-answer-tools`).
**Migration**: The pruned field groups map one-to-one to tool groups; no data changes.

### Requirement: The WhatsApp-only form stays under the Anthropic budget
**Reason**: The budget of "value or null" places guarded one deep form. Tools are flat and have no nullable or optional parameter at all; the new guard is the per-tool shape test and the live acceptance check ("Every tool stays flat and every provider accepts the set" in `planner-answer-tools`).
**Migration**: `tests/decisionSchemaBudget.test.ts` is replaced by the tool shape test.
