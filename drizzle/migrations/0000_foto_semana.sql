ALTER TABLE public.registro_semanas ADD COLUMN IF NOT EXISTS foto_path text;
CREATE POLICY "Auth read bitacoras" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'bitacoras');
CREATE POLICY "Editors upload bitacoras" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'bitacoras' AND public.can_write_records(auth.uid()));