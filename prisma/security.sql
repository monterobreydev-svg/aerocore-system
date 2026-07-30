-- ---------------------------------------------------------------------------
-- Supabase data-exposure lockdown
--
-- Supabase publishes every table in the `public` schema through PostgREST at
-- https://<project>.supabase.co/rest/v1/<Table>. That API authenticates with
-- the `anon` key, which is a PUBLIC value by design — it ships in browsers.
-- So any table that (a) has RLS disabled and (b) grants privileges to `anon`
-- is readable and writable by anyone on the internet who has the project URL.
--
-- This app never uses PostgREST or the Supabase JS client. It talks to
-- Postgres directly via Prisma as the `postgres` role, which has
-- rolbypassrls = true — so enabling RLS costs the app nothing.
--
-- Two independent controls, deliberately belt-and-braces:
--   1. RLS on with no policies  -> deny-all for every non-bypass role
--   2. Grants revoked           -> the API roles can't even reach the tables
--
-- RE-RUN THIS after any `prisma db push` or `prisma migrate` that creates a
-- new table. The ALTER DEFAULT PRIVILEGES below should prevent new tables from
-- being granted, but RLS still has to be switched on per table.
--   npx tsx --env-file=.env prisma/apply-security.mts
-- ---------------------------------------------------------------------------

-- 1. Deny-all RLS on every existing table in public.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;

-- FORCE also applies RLS to the table owner. `postgres` still bypasses it via
-- rolbypassrls, so Prisma is unaffected, but it closes the owner loophole for
-- any other role that might own a table later.

-- 2. Take the PostgREST roles off the tables entirely.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 3. Stop future Prisma-created tables from inheriting Supabase's default
--    grants. Without this, the next `db push` silently re-opens the hole.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
