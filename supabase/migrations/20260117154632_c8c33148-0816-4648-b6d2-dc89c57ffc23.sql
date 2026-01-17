-- Create invoice-proofs storage bucket for client invoice payment proofs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice-proofs',
  'invoice-proofs',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow clients to upload their own invoice proofs
CREATE POLICY "Clients can upload invoice proofs"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'invoice-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow clients to view their own invoice proofs
CREATE POLICY "Clients can view own invoice proofs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'invoice-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow super admins to view all invoice proofs
CREATE POLICY "Admins can view all invoice proofs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'invoice-proofs'
  AND has_role(auth.uid(), 'super_admin'::app_role)
);

-- Allow clients to delete their own invoice proofs
CREATE POLICY "Clients can delete own invoice proofs"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'invoice-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);