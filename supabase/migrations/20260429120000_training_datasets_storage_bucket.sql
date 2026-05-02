-- Public bucket for training ZIPs uploaded by the app (Fal.ai must fetch images_data_url).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-datasets',
  'training-datasets',
  true,
  52428800,
  ARRAY['application/zip', 'application/x-zip-compressed']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Allow anyone to read objects (required for Fal to download the ZIP via public URL).
DROP POLICY IF EXISTS "Public read training-datasets" ON storage.objects;
CREATE POLICY "Public read training-datasets"
ON storage.objects FOR SELECT
USING (bucket_id = 'training-datasets');
