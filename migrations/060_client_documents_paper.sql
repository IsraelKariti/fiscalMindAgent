-- Document papers (openspec `document-papers`): a catalog type may declare a
-- closed list of papers (a property: purchase contract, payments appendix, land
-- registry extract, …). A checklist item of such a type carries the paper it
-- stands for; the classifier names the paper of every file; code refuses a
-- match or a tie between different papers. NULL = the item carries no paper
-- (a type without papers, an ad-hoc row, or a row created before this change)
-- and is handled exactly as before.
ALTER TABLE client_documents ADD COLUMN paper_key TEXT;

-- One-time backfill: real_estate items are named "<paper> — <property>" by the
-- questionnaire mapping and the planner, so the name prefix identifies the paper.
UPDATE client_documents SET paper_key = 'purchase_contract'       WHERE type_key = 'real_estate' AND paper_key IS NULL AND name LIKE 'חוזה רכישה%';
UPDATE client_documents SET paper_key = 'payments_appendix'       WHERE type_key = 'real_estate' AND paper_key IS NULL AND name LIKE 'נספח תשלומים%';
UPDATE client_documents SET paper_key = 'tabu_extract'            WHERE type_key = 'real_estate' AND paper_key IS NULL AND name LIKE 'נסח טאבו%';
UPDATE client_documents SET paper_key = 'purchase_tax_assessment' WHERE type_key = 'real_estate' AND paper_key IS NULL AND name LIKE 'שומת מס רכישה%';
UPDATE client_documents SET paper_key = 'cost_declaration'        WHERE type_key = 'real_estate' AND paper_key IS NULL AND name LIKE 'הצהרת עלות%';
UPDATE client_documents SET paper_key = 'inheritance_order'       WHERE type_key = 'real_estate' AND paper_key IS NULL AND name LIKE 'צו ירושה%';
UPDATE client_documents SET paper_key = 'builder_payments_report' WHERE type_key = 'real_estate' AND paper_key IS NULL AND name LIKE 'דוח מצבת תשלומים%';
