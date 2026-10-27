-- Accountant staff (openspec `accountant-employee-access`). An accountant
-- lists the email addresses of employees who may sign in and view the
-- accountant's workspace read-only. A row exists before the employee ever
-- signs in (they get a users row on their first Google login, like anyone);
-- identity is resolved per request by the signed-in user's email. The global
-- unique email makes "one accountant per employee" a database fact.
CREATE TABLE accountant_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accountant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX accountant_staff_accountant_idx ON accountant_staff (accountant_user_id);
