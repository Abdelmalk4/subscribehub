-- Fix invoice-proofs bucket RLS: folder index should match auth uid.

DROP POLICY IF EXISTS "Clients can upload invoice proofs" ON storage.objects;
DROP POLICY IF EXISTS "Clients can view own invoice proofs" ON storage.objects;
DROP POLICY IF EXISTS "Clients can delete own invoice proofs" ON storage.objects;

-- Allow clients to upload their own invoice proofs
CREATE POLICY "Clients can upload invoice proofs"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'invoice-proofs'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow clients to view their own invoice proofs
CREATE POLICY "Clients can view own invoice proofs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'invoice-proofs'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow clients to delete their own invoice proofs
CREATE POLICY "Clients can delete own invoice proofs"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'invoice-proofs'
  AND (storage.foldername(name))[2] = auth.uid()::text
);