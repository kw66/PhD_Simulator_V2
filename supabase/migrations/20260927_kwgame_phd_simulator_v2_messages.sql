-- Run in the kwgame project. Each game owns a separate messages table.
create table if not exists public.phd_simulator_v2_messages (
  id bigint generated always as identity primary key,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 10),
  content text not null check (char_length(btrim(content)) between 1 and 150),
  source text not null check (source in ('board', 'feedback')),
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists phd_simulator_v2_messages_visible_latest_idx
  on public.phd_simulator_v2_messages (created_at desc, id desc)
  where is_visible;

alter table public.phd_simulator_v2_messages
  drop constraint if exists phd_simulator_v2_messages_nonblank;
alter table public.phd_simulator_v2_messages
  add constraint phd_simulator_v2_messages_nonblank
  check (
    char_length(btrim(nickname, E' \t\n\r')) > 0
    and char_length(btrim(content, E' \t\n\r')) > 0
  );

alter table public.phd_simulator_v2_messages enable row level security;
revoke all on public.phd_simulator_v2_messages from public, anon, authenticated;
grant select (id, nickname, content, source, created_at)
  on public.phd_simulator_v2_messages to anon;
grant insert (nickname, content, source)
  on public.phd_simulator_v2_messages to anon;

drop policy if exists "Anyone can read visible V2 messages" on public.phd_simulator_v2_messages;
create policy "Anyone can read visible V2 messages"
  on public.phd_simulator_v2_messages for select to anon
  using (is_visible);

drop policy if exists "Anyone can submit V2 messages" on public.phd_simulator_v2_messages;
create policy "Anyone can submit V2 messages"
  on public.phd_simulator_v2_messages for insert to anon
  with check (is_visible);
