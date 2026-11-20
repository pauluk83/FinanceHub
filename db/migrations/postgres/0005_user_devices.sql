-- Device and session list: one row per browser or desktop install per account.
-- Applied to project fzkkgbatmmgasfmgvrzp on 2026-11-20 via the SQL editor.
-- Owner-scoped by RLS; the app never holds a service-role key.
--
-- A revoke records revoked_at instead of deleting the row, so the history of a
-- device stays visible until the owner clears it. Signing out everywhere is the
-- auth service's own global sign-out, not a table write.

create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  label text not null,
  platform text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint user_devices_device_id_length check (char_length(device_id) between 8 and 64),
  constraint user_devices_label_length check (char_length(label) between 1 and 80),
  constraint user_devices_platform_length check (platform is null or char_length(platform) <= 20),
  constraint user_devices_user_device_key unique (user_id, device_id)
);

create index if not exists user_devices_user_last_seen
  on public.user_devices (user_id, last_seen_at desc);

alter table public.user_devices enable row level security;

drop policy if exists "user devices read own" on public.user_devices;
drop policy if exists "user devices insert own" on public.user_devices;
drop policy if exists "user devices update own" on public.user_devices;
drop policy if exists "user devices delete own" on public.user_devices;

create policy "user devices read own" on public.user_devices
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user devices insert own" on public.user_devices
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "user devices update own" on public.user_devices
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "user devices delete own" on public.user_devices
  for delete to authenticated
  using (user_id = (select auth.uid()));
