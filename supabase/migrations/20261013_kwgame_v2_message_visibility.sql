begin;

-- RLS cannot query the same table directly without recursing. This helper only
-- reveals whether a top-level message is public; it never returns private data.
create or replace function public.phd_simulator_v2_message_parent_is_public(p_parent_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.phd_simulator_v2_messages as parent
    where parent.id = p_parent_id
      and parent.parent_id is null
      and parent.is_visible
  );
$$;

revoke all on function public.phd_simulator_v2_message_parent_is_public(bigint)
  from public, anon, authenticated;
grant execute on function public.phd_simulator_v2_message_parent_is_public(bigint) to anon;

drop policy if exists "Anyone can read visible V2 messages" on public.phd_simulator_v2_messages;
create policy "Anyone can read visible V2 messages"
  on public.phd_simulator_v2_messages for select to anon
  using (
    is_visible
    and (parent_id is null or public.phd_simulator_v2_message_parent_is_public(parent_id))
  );

-- Apply the same rule to the public view and direct table reads. A soft-deleted
-- root remains a visible placeholder with its existing replies; a hidden root
-- hides the whole thread without rewriting its children.
create or replace view public.phd_simulator_v2_public_messages
with (security_barrier = true)
as
select id, nickname, content, source, created_at, parent_id, is_deleted
from public.phd_simulator_v2_messages
where is_visible
  and (parent_id is null or public.phd_simulator_v2_message_parent_is_public(parent_id));

revoke all on public.phd_simulator_v2_public_messages from public, anon, authenticated;
grant select on public.phd_simulator_v2_public_messages to anon;

create or replace function public.check_phd_simulator_v2_reply_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    -- SHARE (not KEY SHARE) conflicts with visibility/deletion updates. Whichever
    -- transaction locks the parent first determines whether this reply predates
    -- deletion. A waiting insert rechecks the parent's latest committed state.
    perform 1 from public.phd_simulator_v2_messages as parent
      where parent.id = new.parent_id
        and parent.parent_id is null
        and parent.is_visible
        and not parent.is_deleted
      for share;
    if not found then
      raise exception 'Reply target must be a visible, non-deleted top-level message'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.check_phd_simulator_v2_reply_parent()
  from public, anon, authenticated;

drop trigger if exists check_phd_simulator_v2_reply_parent on public.phd_simulator_v2_messages;
create trigger check_phd_simulator_v2_reply_parent
  before insert or update of parent_id on public.phd_simulator_v2_messages
  for each row execute function public.check_phd_simulator_v2_reply_parent();

notify pgrst, 'reload schema';
commit;
