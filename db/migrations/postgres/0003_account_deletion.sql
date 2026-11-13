-- Self-serve cloud account deletion.
-- Apply after 0002_sync.sql. The function runs as its owner so it can remove the
-- auth user, while every public row is cascaded from auth.users.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Supabase grants EXECUTE to anon and authenticated by default, so revoke anon
-- explicitly as well as PUBLIC. The function still checks auth.uid() itself.
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
