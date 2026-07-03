-- Per-client list of required documents. Replaces the hardcoded "Form 106"
-- goal: the agent chases every pending document and the client's goal_status
-- becomes derived (complete iff every document is collected).

CREATE TABLE client_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'collected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX client_documents_client_id_idx ON client_documents (client_id, created_at);

-- Existing clients were all implicitly collecting Form 106; materialize that
-- so their goal state carries over unchanged.
INSERT INTO client_documents (client_id, name, status)
SELECT id, 'Form 106', CASE WHEN goal_status = 'complete' THEN 'collected' ELSE 'pending' END
FROM clients;
