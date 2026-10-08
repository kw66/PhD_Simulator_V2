begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.phd_simulator_v2_messages
  add column if not exists edit_token_hash text;

alter table public.phd_simulator_v2_messages
  add column if not exists is_deleted boolean not null default false;

revoke all on public.phd_simulator_v2_messages from public, anon, authenticated;
grant select (id, nickname, content, source, created_at, parent_id, is_deleted)
  on public.phd_simulator_v2_messages to anon;
grant insert (nickname, content, source, parent_id, edit_token_hash)
  on public.phd_simulator_v2_messages to anon;

create or replace function public.delete_phd_simulator_v2_message(
  p_id bigint,
  p_edit_token text,
  p_expected_content text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  if p_edit_token is null or p_edit_token !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  update public.phd_simulator_v2_messages as message
    set content = '该留言已删除',
        is_deleted = true,
        edit_token_hash = null
    where message.id = p_id
      and message.is_visible
      and not message.is_deleted
      and message.edit_token_hash = encode(extensions.digest(convert_to(p_edit_token, 'UTF8'), 'sha256'), 'hex')
      and message.content = p_expected_content;
  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

revoke all on function public.delete_phd_simulator_v2_message(bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.delete_phd_simulator_v2_message(bigint, text, text) to anon;

notify pgrst, 'reload schema';
commit;
