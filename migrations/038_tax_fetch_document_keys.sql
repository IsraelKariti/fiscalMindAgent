-- Multi-document fetch in one login: a single fetch session may now cover more
-- than one document type from the same provider (Altshuler: pension AND/OR study
-- fund, whichever the client agreed to). document_keys holds the agreed,
-- in-scope document-type keys for the session (providers.ts FetchDocumentType.key).
-- NULL means "the provider's default type(s)" — back-compat for the tax authority
-- (a single 106 type) and any pre-existing rows.
ALTER TABLE tax_fetch_sessions ADD COLUMN document_keys TEXT[];
