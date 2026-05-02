-- Optional JSON for UI-driven prompt variants (background, uniform) used by the Fal pipeline.
ALTER TABLE public.models
ADD COLUMN IF NOT EXISTS prompt_options jsonb;
