alter table public.phd_simulator_v2_messages
  add column if not exists parent_id bigint
  references public.phd_simulator_v2_messages (id) on delete cascade;

create index if not exists phd_simulator_v2_messages_visible_replies_idx
  on public.phd_simulator_v2_messages (parent_id, created_at, id)
  where parent_id is not null and is_visible;

grant select (parent_id) on public.phd_simulator_v2_messages to anon;
grant insert (parent_id) on public.phd_simulator_v2_messages to anon;

create or replace function public.check_phd_simulator_v2_reply_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.phd_simulator_v2_messages as parent
    where parent.id = new.parent_id
      and parent.parent_id is null
      and parent.is_visible
  ) then
    raise exception 'Reply target must be a visible top-level message'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.check_phd_simulator_v2_reply_parent()
  from public, anon, authenticated;

drop trigger if exists check_phd_simulator_v2_reply_parent
  on public.phd_simulator_v2_messages;
create trigger check_phd_simulator_v2_reply_parent
  before insert on public.phd_simulator_v2_messages
  for each row execute function public.check_phd_simulator_v2_reply_parent();
