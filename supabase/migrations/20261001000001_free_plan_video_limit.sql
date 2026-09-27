-- Supabase's free plan rejects any upload over 50 MB, so the bucket limit follows it.
-- On a paid plan: raise this to 104857600 (100 MB) and set NEXT_PUBLIC_VIDEO_MAX_MB=100.
update storage.buckets set file_size_limit = 52428800 where id = 'uploads';
