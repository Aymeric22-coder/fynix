-- Rollback migration 008
DROP POLICY IF EXISTS "instruments_update_authenticated" ON instruments;
DROP POLICY IF EXISTS "instruments_insert_authenticated" ON instruments;
