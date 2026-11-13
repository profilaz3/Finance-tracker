-- ============================================
-- STORAGE POLICIES (event-photos bucket)
-- ============================================

-- Drop existing event photo policies to avoid conflicts.
DROP POLICY IF EXISTS "Allow public uploads to event-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to event-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates to event-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from event-photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload event photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view event photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload own event photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update own event photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete own event photos" ON storage.objects;

CREATE POLICY "Authenticated users can upload own event photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Anyone can view event photos"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'event-photos');

CREATE POLICY "Authenticated users can update own event photos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'event-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Authenticated users can delete own event photos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
