-- Allow account-level events (e.g. Stripe payment) without a model row.
ALTER TABLE public.pipeline_events
  ALTER COLUMN model_id DROP NOT NULL;
