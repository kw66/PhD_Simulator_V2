begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.phd_simulator_v2_messages
  add column if not exists edit_token_hash text
    check (edit_token_hash is null or edit_token_hash ~ '^[a-f0-9]{64}$');

alter table public.phd_simulator_v2_messages
  drop constraint if exists phd_simulator_v2_messages_content_check;
alter table public.phd_simulator_v2_messages
  add constraint phd_simulator_v2_messages_content_check
  check (char_length(btrim(content, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) between 1 and 2000);

revoke all on public.phd_simulator_v2_messages from public, anon, authenticated;
revoke select (edit_token_hash), update (id, nickname, content, source, is_visible, created_at, parent_id, edit_token_hash)
  on public.phd_simulator_v2_messages from public, anon, authenticated;
grant select (id, nickname, content, source, created_at, parent_id)
  on public.phd_simulator_v2_messages to anon;
grant insert (nickname, content, source, parent_id, edit_token_hash)
  on public.phd_simulator_v2_messages to anon;

create or replace function public.edit_phd_simulator_v2_message(
  p_id bigint,
  p_edit_token text,
  p_content text,
  p_expected_content text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_content text;
  changed_count integer;
begin
  if p_edit_token is null or p_edit_token !~ '^[a-f0-9]{64}$' then
    return false;
  end if;
  normalized_content := pg_catalog.btrim(p_content, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  if normalized_content is null or pg_catalog.char_length(normalized_content) not between 1 and 2000 then
    return false;
  end if;
  update public.phd_simulator_v2_messages as message
    set content = normalized_content
    where message.id = p_id
      and message.is_visible
      and message.edit_token_hash = encode(extensions.digest(convert_to(p_edit_token, 'UTF8'), 'sha256'), 'hex')
      and message.content = p_expected_content
      and (message.parent_id is null or exists (
        select 1 from public.phd_simulator_v2_messages as parent
        where parent.id = message.parent_id and parent.is_visible
      ));
  get diagnostics changed_count = row_count;
  return changed_count = 1;
end;
$$;

revoke all on function public.edit_phd_simulator_v2_message(bigint, text, text, text)
  from public, anon, authenticated;
grant execute on function public.edit_phd_simulator_v2_message(bigint, text, text, text) to anon;

notify pgrst, 'reload schema';
commit;
