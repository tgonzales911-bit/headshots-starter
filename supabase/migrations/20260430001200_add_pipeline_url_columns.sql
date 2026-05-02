alter table public.models
add column if not exists lora_url text;

alter table public.models
add column if not exists latest_request_id text;

alter table public.models
add column if not exists result_image_url text;
