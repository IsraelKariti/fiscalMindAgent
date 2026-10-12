-- Chat-stated cost (openspec `chat-stated-cost`): a cost-declaration item (the
-- property paper cost_declaration, the vehicle paper vehicle_cost_declaration)
-- may be closed by the client's own WhatsApp message instead of a file. Such a
-- row gets the status 'stated' — settled like 'approved' for the goal and the
-- progress count, but visibly without a paper — and keeps the evidence on
-- resolution_evidence: {source:'chat', message_id, quote, amount, currency}.
-- Set only by the planner's apply_stated_costs step after validate_message
-- checked the item, the quote and the amount; the accountant can return the
-- row to pending from the documents card.
ALTER TABLE client_documents DROP CONSTRAINT client_documents_status_check;
ALTER TABLE client_documents
  ADD CONSTRAINT client_documents_status_check
  CHECK (status IN ('unresolved', 'not_required', 'pending', 'claimed', 'collected', 'approved', 'stated', 'retired'));

-- Vehicle items now carry papers (vehicle_license, vehicle_purchase_document,
-- vehicle_cost_declaration), so code can tell the cost declaration from the
-- licence and the receipt by key. One-time backfill by the conventional name
-- prefixes the planner used; a row named otherwise keeps NULL (no paper) and
-- is handled as before.
UPDATE client_documents SET paper_key = 'vehicle_license'           WHERE type_key = 'vehicle' AND paper_key IS NULL AND (name LIKE 'רישיון רכב%' OR name LIKE 'העתק רישיון רכב%');
UPDATE client_documents SET paper_key = 'vehicle_purchase_document' WHERE type_key = 'vehicle' AND paper_key IS NULL AND name LIKE 'מסמך רכישה%';
UPDATE client_documents SET paper_key = 'vehicle_cost_declaration'  WHERE type_key = 'vehicle' AND paper_key IS NULL AND name LIKE 'הצהרת עלות%';
