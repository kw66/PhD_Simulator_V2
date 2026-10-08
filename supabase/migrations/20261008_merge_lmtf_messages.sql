begin;

create schema if not exists community_maintenance;
revoke all on schema community_maintenance from public, anon, authenticated;

create table if not exists community_maintenance.message_merge_backups (
  operation text primary key,
  backed_up_at timestamptz not null default now(),
  messages jsonb not null
);
revoke all on community_maintenance.message_merge_backups from public, anon, authenticated;

do $merge$
declare
  merged_content text;
  expected_hashes text[] := array[
    'a68f22762f1cefc50ce1b1a10e09cda3', 'bec9f5214f7442636ecf0a09f2369b54',
    'c48aa6494bb091cd528a59bf151c1f8f', '1ebd6b9e73230fc9fde0a3b047875d19',
    'cb13f62c3231d1183537c21622868263', 'e6c0b5290ca79ff99a2830930e6e27d3',
    '811b05992ad0aa561e424d91b4905630', '59f6fafcef4efbcca4c68b078927bfef',
    'dbb89c20ba81091311687e16760ca296', '4f1a991ee1d3e04315e1c7736c0ccd09',
    'c81049a4d1b78fcb4c184722b98d624a'
  ];
begin
  lock table public.phd_simulator_v2_messages in share row exclusive mode;

  if exists (
    select 1 from community_maintenance.message_merge_backups
    where operation = '20261008-lmtf-19-29'
  ) then
    return;
  end if;

  if (
    select count(*) from public.phd_simulator_v2_messages
    where id between 19 and 29 and nickname = 'Lmtf'
      and parent_id is null and is_visible and source = 'board'
      and md5(content) = expected_hashes[(id - 18)::integer]
  ) <> 11 then
    raise exception 'Lmtf source messages differ from the reviewed snapshot; merge cancelled';
  end if;

  select string_agg(case when id = 20 then E'\n\n' else '' end || content, '' order by id)
    into merged_content
    from public.phd_simulator_v2_messages
    where id between 19 and 29 and parent_id is null;

  if char_length(merged_content) > 2000 then
    raise exception 'Merged message exceeds 2000 characters';
  end if;

  insert into community_maintenance.message_merge_backups(operation, messages)
  select '20261008-lmtf-19-29', jsonb_agg(to_jsonb(message) order by message.id)
  from public.phd_simulator_v2_messages as message
  where message.id between 19 and 29 or message.parent_id between 19 and 29;

  update public.phd_simulator_v2_messages set content = merged_content where id = 19;
  update public.phd_simulator_v2_messages set parent_id = 19 where parent_id between 20 and 29;
  update public.phd_simulator_v2_messages set is_visible = false where id between 20 and 29;
end;
$merge$;

commit;
