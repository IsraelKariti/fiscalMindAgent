-- Google sign-in matches users by email (openspec `google-sign-in`): the
-- email is the identity, google_sub is kept as information only (and as the
-- "has signed in with Google" marker). Nothing looks users up by sub any more,
-- so the unique constraint goes: with email as the key, the same Google
-- account under a renamed address must become a new row, not a crash.
--
-- The email match uses lower(email). Stop the deploy if a database already
-- holds two rows that differ only in casing — merging them silently would
-- hand one person another's account.
DO $$
DECLARE dup TEXT;
BEGIN
  SELECT lower(email) INTO dup FROM users GROUP BY lower(email) HAVING count(*) > 1 LIMIT 1;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION 'users holds several rows for email % (differing only in case); resolve before migrating', dup;
  END IF;
END $$;

ALTER TABLE users DROP CONSTRAINT users_google_sub_key;
