-- FinanceHub Phase 5 sync migration (Postgres 0002). Apply after 0001_initial.sql.
-- Server time and server-assigned sequence values are authoritative; device
-- clocks are never used as the pull cursor.

create table if not exists sync_clock (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seq bigint not null default 0
);

create table if not exists sync_ops (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  op_id uuid not null,
  applied_at timestamptz not null default now(),
  primary key (user_id, op_id)
);

alter table sync_clock enable row level security;
alter table sync_ops enable row level security;
drop policy if exists sync_clock_owner on sync_clock;
create policy sync_clock_owner on sync_clock for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists sync_ops_owner on sync_ops;
create policy sync_ops_owner on sync_ops for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table settings add column if not exists sync_seq bigint not null default 0;
alter table settings add column if not exists state_json jsonb;
alter table accounts add column if not exists sync_seq bigint not null default 0;
alter table people add column if not exists sync_seq bigint not null default 0;
alter table cards add column if not exists sync_seq bigint not null default 0;
alter table bills add column if not exists sync_seq bigint not null default 0;
alter table bill_changes add column if not exists sync_seq bigint not null default 0;
alter table income_schedules add column if not exists sync_seq bigint not null default 0;
alter table transactions add column if not exists sync_seq bigint not null default 0;
alter table month_locks add column if not exists sync_seq bigint not null default 0;
alter table holidays add column if not exists sync_seq bigint not null default 0;
alter table changelog add column if not exists sync_seq bigint not null default 0;
alter table provider_entries add column if not exists sync_seq bigint not null default 0;
alter table credential_vault add column if not exists sync_seq bigint not null default 0;
alter table audit_log add column if not exists sync_seq bigint not null default 0;

-- Tables that were append-only or snapshot-only need mutable sync metadata too.
alter table month_locks add column if not exists updated_at timestamptz not null default now();
alter table month_locks add column if not exists rev bigint not null default 1;
alter table changelog add column if not exists updated_at timestamptz not null default now();
alter table changelog add column if not exists rev bigint not null default 1;
alter table audit_log add column if not exists updated_at timestamptz not null default now();
alter table audit_log add column if not exists rev bigint not null default 1;

create or replace function financehub_next_sync_seq(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_seq bigint;
begin
  insert into sync_clock (user_id, seq)
  values (p_user_id, 1)
  on conflict (user_id) do update set seq = sync_clock.seq + 1
  returning seq into next_seq;
  return next_seq;
end;
$$;

revoke all on function financehub_next_sync_seq(uuid) from public;

create or replace function financehub_prepare_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.rev := coalesce(old.rev, 0) + 1;
  else
    new.rev := 1;
  end if;
  new.updated_at := now();
  new.sync_seq := financehub_next_sync_seq(new.user_id);
  return new;
end;
$$;

revoke all on function financehub_prepare_sync() from public;

do $$
declare
  t text;
begin
  foreach t in array array[
    'settings', 'accounts', 'people', 'cards', 'bills', 'bill_changes',
    'income_schedules', 'transactions', 'month_locks', 'holidays', 'changelog',
    'provider_entries', 'credential_vault', 'audit_log'
  ]
  loop
    execute format('drop trigger if exists %I_sync on %I', t, t);
    execute format(
      'create trigger %I_sync before insert or update on %I for each row execute function financehub_prepare_sync()',
      t, t
    );
  end loop;
end $$;

-- Push the whole settings document with an expected revision. The server row is
-- locked, the base revision is checked, and the operation id makes retries safe.
create or replace function financehub_push_state(
  p_base_rev bigint,
  p_state jsonb,
  p_device_id text,
  p_op_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row settings%rowtype;
  v_found boolean := false;
  v_target_year int;
  v_start_month int;
  v_months_in_year int;
  v_currency text;
  v_as_of date;
  v_lock_cutoff date;
  v_anchor date;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'State must be a JSON object' using errcode = '22023';
  end if;
  if p_device_id is null or btrim(p_device_id) = '' then
    raise exception 'Device id required' using errcode = '22023';
  end if;

  select * into v_row from settings s where s.user_id = v_user for update;
  v_found := found;

  if exists (select 1 from sync_ops o where o.user_id = v_user and o.op_id = p_op_id) then
    if v_found then
      return jsonb_build_object(
        'status', 'duplicate', 'rev', v_row.rev, 'sync_seq', v_row.sync_seq,
        'updated_at', v_row.updated_at, 'state', v_row.state_json
      );
    end if;
    return jsonb_build_object('status', 'duplicate', 'rev', 0, 'sync_seq', 0, 'updated_at', null, 'state', null);
  end if;

  -- A row created by the older normalised schema has no document yet. Its first
  -- document push is allowed to adopt that row instead of conflicting forever.
  if v_found and v_row.rev <> p_base_rev and not (v_row.state_json is null and p_base_rev = 0) then
    return jsonb_build_object(
      'status', 'conflict', 'rev', v_row.rev, 'sync_seq', v_row.sync_seq,
      'updated_at', v_row.updated_at, 'state', v_row.state_json
    );
  end if;
  if not v_found and p_base_rev <> 0 then
    return jsonb_build_object('status', 'conflict', 'rev', 0, 'sync_seq', 0, 'updated_at', null, 'state', null);
  end if;

  v_target_year := coalesce(nullif(p_state #>> '{dataset,settings,targetYear}', '')::int, extract(year from current_date)::int);
  v_start_month := coalesce(nullif(p_state #>> '{dataset,settings,startMonth}', '')::int, 1);
  v_months_in_year := coalesce(nullif(p_state #>> '{dataset,settings,monthsInYear}', '')::int, 12);
  v_currency := coalesce(nullif(p_state #>> '{dataset,settings,currency}', ''), '£');
  v_as_of := coalesce(nullif(p_state #>> '{dataset,settings,asOfDate}', '')::date, current_date);
  v_lock_cutoff := coalesce(nullif(p_state #>> '{dataset,settings,lockCutoff}', '')::date, v_as_of);
  v_anchor := coalesce(nullif(p_state #>> '{dataset,settings,anchorDate}', '')::date, v_as_of);

  if v_found then
    update settings
      set target_year = v_target_year,
          start_month = v_start_month,
          months_in_year = v_months_in_year,
          currency = v_currency,
          as_of_date = v_as_of,
          lock_cutoff = v_lock_cutoff,
          anchor_date = v_anchor,
          state_json = p_state
      where user_id = v_user
      returning * into v_row;
  else
    insert into settings (
      user_id, target_year, start_month, months_in_year, currency,
      as_of_date, lock_cutoff, anchor_date, state_json
    ) values (
      v_user, v_target_year, v_start_month, v_months_in_year, v_currency,
      v_as_of, v_lock_cutoff, v_anchor, p_state
    )
    returning * into v_row;
  end if;

  insert into sync_ops (user_id, device_id, op_id)
  values (v_user, p_device_id, p_op_id)
  on conflict (user_id, op_id) do nothing;

  return jsonb_build_object(
    'status', 'applied', 'rev', v_row.rev, 'sync_seq', v_row.sync_seq,
    'updated_at', v_row.updated_at, 'state', v_row.state_json
  );
end;
$$;

revoke all on function financehub_push_state(bigint, jsonb, text, uuid) from public;
grant execute on function financehub_push_state(bigint, jsonb, text, uuid) to authenticated;

-- Pull every changed row after a cursor. RLS remains active because this is
-- SECURITY INVOKER and every branch is scoped to auth.uid().
create or replace function financehub_pull_changes(p_cursor bigint)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'settings', coalesce((select jsonb_agg(to_jsonb(t) order by t.sync_seq) from settings t where t.user_id = auth.uid() and t.sync_seq > p_cursor), '[]'::jsonb),
    'accounts', coalesce((select jsonb_agg(to_jsonb(t) order by t.sync_seq) from accounts t where t.user_id = auth.uid() and t.sync_seq > p_cursor), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(to_jsonb(t) order by t.sync_seq) from people t where t.user_id = auth.uid() and t.sync_seq > p_cursor), '[]'::jsonb),
    'cards', coalesce((select jsonb_agg(to_jsonb(t) order by t.sync_seq) from cards t where t.user_id = auth.uid() and t.sync_seq > p_cursor), '[]'::jsonb),
    'bills', coalesce((select jsonb_agg(to_jsonb(t) order by t.sync_seq) from bills t where t.user_id = auth.uid() and t.sync_seq > p_cursor), '[]'::jsonb),
    'bill_changes', coalesce((select jsonb_agg(to_jsonb(t) order by t.sync_seq) from bill_changes t where t.user_id = auth.uid() and t.sync_seq > p_cursor), '[]'::jsonb),
    'income_schedules', coalesce((select jsonb_agg(to_jsonb(t) order by t.sync_seq) from income_schedules t where t.user_id = auth.uid() and t.sync_seq > p_cursor), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(to_jsonb(t) order by t.sync_seq) from transactions t where t.user_id = auth.uid() and t.sync_seq > p_cursor), '[]'::jsonb),
    'month_locks', coalesce((select jsonb_agg(to_jsonb(t) order by t.sync_seq) from month_locks t where t.user_id = auth.uid() and t.sync_seq > p_cursor), '[]'::jsonb),
    'holidays', coalesce((select jsonb_agg(to_jsonb(t) order by t.sync_seq) from holidays t where t.user_id = auth.uid() and t.sync_seq > p_cursor), '[]'::jsonb),
    'changelog', coalesce((select jsonb_agg(to_jsonb(t) order by t.sync_seq) from changelog t where t.user_id = auth.uid() and t.sync_seq > p_cursor), '[]'::jsonb),
    'provider_entries', coalesce((select jsonb_agg(to_jsonb(t) order by t.sync_seq) from provider_entries t where t.user_id = auth.uid() and t.sync_seq > p_cursor), '[]'::jsonb),
    'credential_vault', coalesce((select jsonb_agg(to_jsonb(t) order by t.sync_seq) from credential_vault t where t.user_id = auth.uid() and t.sync_seq > p_cursor), '[]'::jsonb),
    'audit_log', coalesce((select jsonb_agg(to_jsonb(t) order by t.sync_seq) from audit_log t where t.user_id = auth.uid() and t.sync_seq > p_cursor), '[]'::jsonb)
  );
$$;

grant execute on function financehub_pull_changes(bigint) to authenticated;

