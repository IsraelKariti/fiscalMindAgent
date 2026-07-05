-- Content-based analysis of received files: at ingestion, Gemini reads the
-- actual bytes (PDF/image) and records what the document really is. The
-- decision loop then judges receipt from this verdict instead of filenames.

ALTER TABLE document_files
  -- pending | done | failed | unsupported
  ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'pending',
  -- Structured verdict (document_kind, summary, tax_year, subject_name,
  -- matched_document_id, legible, confidence); null unless status is 'done'.
  ADD COLUMN analysis JSONB,
  ADD COLUMN analyzed_at TIMESTAMPTZ;
