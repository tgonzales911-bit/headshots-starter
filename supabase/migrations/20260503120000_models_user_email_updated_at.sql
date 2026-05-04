-- Ops dashboard: denormalized email + ordering column for admin queries
ALTER TABLE public.models
  ADD COLUMN IF NOT EXISTS user_email text;

ALTER TABLE public.models
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;
