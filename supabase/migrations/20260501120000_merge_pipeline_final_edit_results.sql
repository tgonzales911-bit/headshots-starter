-- Allow final_edit_results key for Gemini parallel webhooks (same merge semantics).

CREATE OR REPLACE FUNCTION public.merge_pipeline_indexed_result(
  p_model_id bigint,
  p_user_id uuid,
  p_results_key text,
  p_slot int,
  p_url text,
  p_expected int DEFAULT 4
)
RETURNS TABLE (
  filled_count int,
  results jsonb,
  became_complete boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opts jsonb;
  v_old jsonb;
  v_new jsonb;
  v_filled int := 0;
  v_prev_filled int := 0;
  v_elem jsonb;
BEGIN
  IF p_results_key NOT IN (
    'patch_results',
    'brass_results',
    'background_results',
    'final_edit_results'
  ) THEN
    RAISE EXCEPTION 'invalid results key';
  END IF;
  IF p_slot < 0 OR p_slot >= p_expected THEN
    RAISE EXCEPTION 'invalid slot';
  END IF;

  SELECT prompt_options INTO v_opts
  FROM public.models
  WHERE id = p_model_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'model not found';
  END IF;

  v_opts := coalesce(v_opts, '{}'::jsonb);
  v_old := v_opts->p_results_key;

  IF v_old IS NOT NULL AND jsonb_typeof(v_old) = 'array' THEN
    FOR v_elem IN SELECT jsonb_array_elements(v_old) AS elem
    LOOP
      IF v_elem IS NOT NULL AND jsonb_typeof(v_elem) = 'string' AND length(v_elem #>> '{}') > 0 THEN
        v_prev_filled := v_prev_filled + 1;
      END IF;
    END LOOP;
  END IF;

  SELECT jsonb_agg(elem ORDER BY ord)
  INTO v_new
  FROM (
    SELECT
      gs.ord,
      CASE
        WHEN gs.ord = p_slot THEN to_jsonb(p_url)
        WHEN v_old IS NOT NULL
          AND jsonb_typeof(v_old) = 'array'
          AND gs.ord < jsonb_array_length(v_old)
          AND jsonb_typeof(v_old -> gs.ord) = 'string'
          AND length(coalesce(v_old ->> gs.ord, '')) > 0
        THEN v_old -> gs.ord
        ELSE 'null'::jsonb
      END AS elem
    FROM generate_series(0, p_expected - 1) AS gs(ord)
  ) slots;

  IF v_new IS NULL THEN
    v_new := jsonb_build_array(null::jsonb, null::jsonb, null::jsonb, null::jsonb);
  END IF;

  v_opts := jsonb_set(v_opts, ARRAY[p_results_key], v_new, true);

  UPDATE public.models
  SET prompt_options = v_opts
  WHERE id = p_model_id AND user_id = p_user_id;

  FOR v_elem IN SELECT jsonb_array_elements(v_new) AS elem
  LOOP
    IF v_elem IS NOT NULL AND jsonb_typeof(v_elem) = 'string' AND length(v_elem #>> '{}') > 0 THEN
      v_filled := v_filled + 1;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT
    v_filled,
    v_new,
    (v_filled = p_expected AND v_prev_filled < p_expected);
END;
$$;

REVOKE ALL ON FUNCTION public.merge_pipeline_indexed_result(bigint, uuid, text, int, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_pipeline_indexed_result(bigint, uuid, text, int, text, int) TO service_role;
