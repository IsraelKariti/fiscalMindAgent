-- Human-facing display label for a stored file, when the filename alone is not
-- descriptive. First user: tax-fetched Form 106s, labeled with the employer
-- name exactly as the tax authority site spells it, so a multi-employer year's
-- forms are tellable apart in the workspace.
ALTER TABLE document_files ADD COLUMN label text;
