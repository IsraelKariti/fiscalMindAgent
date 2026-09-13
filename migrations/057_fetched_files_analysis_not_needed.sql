-- Files the platform fetched itself (tax authority / Altshuler / Harel) are
-- linked to their document by the delivery code and checked by verification;
-- the inbound content analyzer never runs on them. They sat at the column
-- default 'pending' forever, which the workspace showed as "not yet analyzed".
-- document_files.analysis_status gains the value 'not_needed' (TEXT, no CHECK);
-- delivery now writes it at insert time. Backfill the rows already delivered.
UPDATE document_files
   SET analysis_status = 'not_needed'
 WHERE analysis_status = 'pending'
   AND provider_attachment_id LIKE 'taxfetch-%';
