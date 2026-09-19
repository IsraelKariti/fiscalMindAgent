-- One inbound PDF can hold several documents. The file_splitting stage cuts
-- such a file into one child file per document; every child is an ordinary
-- document_files row that points to the file it was cut from and records its
-- 1-based, inclusive page range. The parent row is kept untouched.
ALTER TABLE document_files ADD COLUMN parent_file_id UUID REFERENCES document_files(id) ON DELETE CASCADE;
ALTER TABLE document_files ADD COLUMN page_from INT;
ALTER TABLE document_files ADD COLUMN page_to INT;
CREATE INDEX document_files_parent_file_id_idx ON document_files (parent_file_id);
-- document_files.analysis_status gains the value 'split' (TEXT, no CHECK): the
-- parent of an accepted split — never classified, never evidence, never linked.
