-- FinanceHub cloud schema (Postgres 0001). Apply first in the Supabase SQL editor.
-- Mirrors the local schema in db/migrations/ with per-record sync metadata, tombstones and RLS.
create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_year int not null,
  start_month int not null,
  currency text not null,
  months_in_year int not null,
  as_of_date date not null,
  lock_cutoff date not null,
  anchor_date date not null,
  updated_at timestamptz not null default now(),
  rev bigint not null default 1
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_pence bigint not null default 0,
  opening_pence bigint not null default 0,
  sort_order int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev bigint not null default 1,
  device_id text
);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  short_name text not null,
  full_name text not null,
  opening_pence bigint not null default 0,
  sort_order int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev bigint not null default 1,
  device_id text
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  limit_pence bigint not null default 0,
  opening_pence bigint not null default 0,
  sort_order int not null default 0,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev bigint not null default 1,
  device_id text
);

create table if not exists bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount_pence bigint not null default 0,
  due_day int not null default 1,
  linked_sheet text,
  frequency text,
  latest_balance_pence bigint not null default 0,
  latest_payment_pence bigint not null default 0,
  sort_order int not null default 0,
  active boolean not null default true,
  effective_from date,
  payment_method text,
  base_amount_pence bigint not null default 0,
  base_due_day int not null default 1,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev bigint not null default 1,
  device_id text
);

create table if not exists bill_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bill_id uuid not null references bills(id) on delete cascade,
  applies_from date,
  applies_to date,
  amount_override_pence bigint,
  due_date_override date,
  change_type text,
  note text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev bigint not null default 1,
  device_id text
);

create table if not exists income_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('PIP', 'UC')),
  month_label text not null,
  year int not null,
  pay_date date,
  amount_pence bigint not null default 0,
  updated_at timestamptz not null default now(),
  rev bigint not null default 1
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tx_date date not null,
  account text not null,
  type text not null check (type in ('Income', 'Expense')),
  amount_pence bigint not null,
  comments text,
  status text,
  budget_treatment text check (budget_treatment in ('', 'Transfer', 'Refund', 'Ambiguous')),
  source_row int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev bigint not null default 1,
  device_id text
);
create index if not exists tx_user_date on transactions(user_id, tx_date);
create index if not exists tx_user_account_date on transactions(user_id, account, tx_date);

create table if not exists month_locks (
  user_id uuid not null references auth.users(id) on delete cascade,
  year int not null,
  month int not null,
  balanced boolean not null,
  locked_at timestamptz,
  snapshot_income_pence bigint,
  snapshot_expenses_pence bigint,
  snapshot_net_pence bigint,
  snapshot_owed_pence bigint,
  source text not null default 'workbook',
  primary key (user_id, year, month)
);

create table if not exists holidays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  year int not null,
  event text not null,
  start_date date,
  end_date date,
  nights int,
  ref text,
  status text,
  notes text,
  paid text,
  total_pence bigint,
  total_text text,
  address text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev bigint not null default 1
);

create table if not exists changelog (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  sheet_cell text,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists provider_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  entry_date date,
  month_label text,
  description text,
  ref text,
  amount_pence bigint not null default 0,
  payment_pence bigint not null default 0,
  balance_pence bigint,
  meta_json jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rev bigint not null default 1
);

-- Ciphertext only. Data keys are wrapped per device; the server never sees plaintext.
create table if not exists credential_vault (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  username text,
  ciphertext bytea not null,
  nonce bytea not null,
  kdf text not null default 'argon2id',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rev bigint not null default 1
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  severity text not null check (severity in ('info', 'warning', 'error')),
  detail text not null,
  created_at timestamptz not null default now()
);

create table if not exists sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity text not null,
  record_id uuid not null,
  local_json jsonb not null,
  remote_json jsonb not null,
  local_rev bigint not null,
  remote_rev bigint not null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text
);

create table if not exists devices (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('windows', 'ios')),
  name text,
  push_token text,
  last_seen_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table settings enable row level security;
alter table accounts enable row level security;
alter table people enable row level security;
alter table cards enable row level security;
alter table bills enable row level security;
alter table bill_changes enable row level security;
alter table income_schedules enable row level security;
alter table transactions enable row level security;
alter table month_locks enable row level security;
alter table holidays enable row level security;
alter table changelog enable row level security;
alter table provider_entries enable row level security;
alter table credential_vault enable row level security;
alter table audit_log enable row level security;
alter table sync_conflicts enable row level security;
alter table devices enable row level security;

drop policy if exists profiles_owner on profiles;
create policy profiles_owner on profiles for all using (id = auth.uid()) with check (id = auth.uid());

-- One policy shape for every table: a user can only touch their own rows.
do $$
declare t text;
begin
  foreach t in array array['settings','accounts','people','cards','bills','bill_changes',
    'income_schedules','transactions','month_locks','holidays','changelog',
    'provider_entries','credential_vault','audit_log','sync_conflicts','devices']
  loop
    execute format('drop policy if exists %I_owner on %I', t, t);
    execute format('create policy %I_owner on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
  end loop;
end $$;

-- Realtime: transactions and settings stream to both devices.
alter publication supabase_realtime add table transactions, settings, bills, people, accounts, cards, month_locks;
