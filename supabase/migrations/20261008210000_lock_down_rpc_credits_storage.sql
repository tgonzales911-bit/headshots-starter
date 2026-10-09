-- Security hardening found in the October 2026 QA pass.
-- Safe to run more than once.

-- 1. Pipeline merge RPC: server (service role) only. It is SECURITY DEFINER,
--    so leaving EXECUTE open to anon/authenticated let anyone holding the
--    public anon key write URLs into any order they could name.
revoke execute on function public.merge_pipeline_indexed_result(bigint, uuid, text, integer, text, integer)
  from public, anon, authenticated;
grant execute on function public.merge_pipeline_indexed_result(bigint, uuid, text, integer, text, integer)
  to service_role;

-- 2. Credits: customers could UPDATE and INSERT their own credits row from the
--    browser, i.e. grant themselves credits. Read-only for customers now.
drop policy if exists "Enable update for authenticated users" on public.credits;
drop policy if exists "Enable insert for authenticated users only" on public.credits;

-- 3. Storage: this policy let anyone LIST every object in the bucket through
--    the storage API (every customer's face photos and insignia). Public
--    object URLs keep working without it because the bucket itself is public;
--    all server code uses the service role.
drop policy if exists "Public read training-datasets" on storage.objects;
