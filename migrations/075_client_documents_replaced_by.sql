-- What replaced a retired row (openspec `retired-by-declaration-tab`). A row
-- the requirements ladder retired was replaced either by other documents
-- ('documents': contract -> purchase-tax assessment + Tabu, appendix retired by
-- a proven private seller) or by the client's own declaration
-- ('client_declaration': a missing contract -> the property cost declaration,
-- a missing licence or receipt -> the client's vehicle declaration). The
-- planner never says which; apply_retirements derives it from the same answer
-- (a declaration-paper item of the retired row's type added, stated or reused
-- there) and writes it here. NULL = retired before this column existed; the
-- documents card shows such rows under "replaced by other documents".
ALTER TABLE client_documents
  ADD COLUMN replaced_by text
  CHECK (replaced_by IN ('documents', 'client_declaration'));
