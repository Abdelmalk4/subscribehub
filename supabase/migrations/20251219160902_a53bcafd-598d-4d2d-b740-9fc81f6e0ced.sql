-- Create payment-proofs storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow project owners to upload payment proofs for their subscribers
CREATE POLICY "Project owners can upload payment proofs"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM projects
    WHERE projects.user_id = auth.uid()
    AND projects.id::text = (storage.foldername(name))[1]
  )
);

-- Allow project owners to view payment proofs for their projects
CREATE POLICY "Project owners can view payment proofs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM projects
    WHERE projects.user_id = auth.uid()
    AND projects.id::text = (storage.foldername(name))[1]
  )
);

-- Allow super admins to view all payment proofs
CREATE POLICY "Super admins can view all payment proofs"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'payment-proofs'
  AND has_role(auth.uid(), 'super_admin'::app_role)
);

-- Allow project owners to delete payment proofs for their projects
CREATE POLICY "Project owners can delete payment proofs"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM projects
    WHERE projects.user_id = auth.uid()
    AND projects.id::text = (storage.foldername(name))[1]
  )
);