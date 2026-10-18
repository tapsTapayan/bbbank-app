-- Private receipt bucket + RLS for BBBank Phase 2
-- Run in the Supabase SQL editor (or via CLI) after creating the project.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  524288, -- 512 KB hard cap (client targets <250 KB WebP)
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: {cycleId}/{userId}/{timestamp}-{reference}.webp
-- Members may upload only into their own userId folder segment.

create policy "Members can upload own receipts"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[2] = (select auth.jwt() ->> 'sub')
);

create policy "Members can read own receipts"
on storage.objects for select
to authenticated
using (
  bucket_id = 'payment-receipts'
  and (storage.foldername(name))[2] = (select auth.jwt() ->> 'sub')
);

-- Staff SELECT is typically via service-role signed URLs from the Next.js server
-- after Prisma role checks. Optionally allow staff JWT roles to read directly:

create policy "Staff can read receipts via app_metadata.role"
on storage.objects for select
to authenticated
using (
  bucket_id = 'payment-receipts'
  and (auth.jwt() -> 'app_metadata' ->> 'role') in ('TREASURER', 'AUDITOR', 'ADMIN')
);
