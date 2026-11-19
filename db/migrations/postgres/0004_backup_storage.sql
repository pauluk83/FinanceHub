-- R17 encrypted backups: a private bucket with one folder per account.
-- Applied to project fzkkgbatmmgasfmgvrzp on 2026-11-19 via the SQL editor.
-- Path convention: <auth.uid()>/financehub-backup-<timestamp>.json
-- Uploads use the signed-in user's JWT; no service-role key is needed.

insert into storage.buckets (id, name, public)
values ('financehub-backups', 'financehub-backups', false)
on conflict (id) do update set public = false;

drop policy if exists "financehub backups read own" on storage.objects;
drop policy if exists "financehub backups insert own" on storage.objects;
drop policy if exists "financehub backups update own" on storage.objects;
drop policy if exists "financehub backups delete own" on storage.objects;

create policy "financehub backups read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'financehub-backups' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "financehub backups insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'financehub-backups' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "financehub backups update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'financehub-backups' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'financehub-backups' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "financehub backups delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'financehub-backups' and (storage.foldername(name))[1] = (select auth.uid())::text);
