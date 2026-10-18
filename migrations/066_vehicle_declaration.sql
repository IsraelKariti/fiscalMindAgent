-- Vehicle declaration (openspec `vehicle-license-optional` / capability
-- `vehicle-declaration`): the vehicle "cost declaration" paper becomes the
-- client's declaration about the vehicle — one item per vehicle that carries
-- make, model, production year, plate and/or purchase cost, stated from the chat
-- (possibly over several messages). Existing rows move to the new paper, keep
-- their name under the new prefix, and their stated cost is carried into the new
-- evidence shape:
--   {source:'chat_vehicle', statements:[{message_id, quote}], facts:{purchase_cost, currency}}
UPDATE client_documents
   SET resolution_evidence = jsonb_build_object(
         'source', 'chat_vehicle',
         'statements', jsonb_build_array(jsonb_build_object(
           'message_id', resolution_evidence->>'message_id',
           'quote', resolution_evidence->>'quote')),
         'facts', jsonb_build_object(
           'purchase_cost', (resolution_evidence->>'amount')::numeric,
           'currency', COALESCE(resolution_evidence->>'currency', 'ILS')))
 WHERE paper_key = 'vehicle_cost_declaration'
   AND resolution_evidence->>'source' = 'chat';

UPDATE client_documents
   SET name = 'הצהרת הלקוח על הרכב' || substr(name, length('הצהרת עלות') + 1)
 WHERE paper_key = 'vehicle_cost_declaration' AND name LIKE 'הצהרת עלות%';

UPDATE client_documents SET paper_key = 'vehicle_declaration' WHERE paper_key = 'vehicle_cost_declaration';
