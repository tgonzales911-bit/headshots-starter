-- Drop the legacy overload of merge_pipeline_indexed_result. It had a
-- different parameter order (p_expected first), so the 20260802090000
-- CREATE OR REPLACE created a second overload instead of replacing it;
-- PostgREST then failed all merge RPC calls with
-- "Could not choose the best candidate function".
DROP FUNCTION IF EXISTS public.merge_pipeline_indexed_result(
  p_expected integer,
  p_model_id bigint,
  p_results_key text,
  p_slot integer,
  p_url text,
  p_user_id uuid
);
