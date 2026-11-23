-- Web push subscriptions and one-delivery-per-alert bookkeeping.
--
-- Applied with the SQL editor (see docs/PUSH.md); not run automatically.
-- Owner-scoped by RLS: a signed-in user reads, adds and removes only its own rows.
-- The Edge Function `send-push` reads these rows with the service role after it
-- has verified the caller's JWT, and scopes every query by that user id.
--
-- `push_deliveries` is the dedupe record: the unique key is what stops the same
-- bill or target alert being pushed twice. It holds an alert id and a date only;
-- no amount, title or address is stored.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_length check (char_length(endpoint) between 16 and 2048),
  constraint push_subscriptions_p256dh_length check (char_length(p256dh) between 40 and 200),
  constraint push_subscriptions_auth_length check (char_length(auth) between 8 and 100),
  constraint push_subscriptions_user_endpoint_key unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_last_seen
  on public.push_subscriptions (user_id, last_seen_at desc);

create table if not exists public.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  alert_id text not null,
  sent_on date not null default current_date,
  created_at timestamptz not null default now(),
  constraint push_deliveries_alert_id_length check (char_length(alert_id) between 4 and 80),
  constraint push_deliveries_user_alert_key unique (user_id, alert_id)
);

create index if not exists push_deliveries_user_created
  on public.push_deliveries (user_id, created_at desc);

alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;

drop policy if exists "push subscriptions read own" on public.push_subscriptions;
drop policy if exists "push subscriptions insert own" on public.push_subscriptions;
drop policy if exists "push subscriptions update own" on public.push_subscriptions;
drop policy if exists "push subscriptions delete own" on public.push_subscriptions;
drop policy if exists "push deliveries read own" on public.push_deliveries;

create policy "push subscriptions read own" on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "push subscriptions insert own" on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "push subscriptions update own" on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "push subscriptions delete own" on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Delivery rows are written by the sender only, so the client may read its own
-- history but cannot insert, update or delete it.
create policy "push deliveries read own" on public.push_deliveries
  for select to authenticated
  using (user_id = (select auth.uid()));
