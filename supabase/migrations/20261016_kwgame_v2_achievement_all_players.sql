-- Global achievement rates use all distinct players who started a game.
-- Preserve the existing v1 RPC for clients that have not refreshed yet.
begin;

create table public.phd_simulator_v2_achievement_players (
  player_id uuid primary key,
  first_recorded_at timestamptz not null default now()
);
alter table public.phd_simulator_v2_achievement_players enable row level security;
revoke all on public.phd_simulator_v2_achievement_players from public, anon, authenticated;

-- A finalized run proves a start. Historical anonymous aggregate counters do
-- not identify players and cannot be used to invent additional unique IDs.
insert into public.phd_simulator_v2_achievement_players (player_id, first_recorded_at)
  select player_id, min(finalized_at)
  from public.phd_simulator_v2_achievement_runs group by player_id;

create function public.record_phd_simulator_v2_achievement_start(p_player_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_player_id is null
    or p_player_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Invalid achievement player' using errcode = '22023';
  end if;
  insert into public.phd_simulator_v2_achievement_players (player_id)
    values (p_player_id) on conflict (player_id) do nothing;
  return true;
end;
$$;

-- Keep numerator membership valid even when a finalization upload arrives
-- before the independent start upload, or from an older client.
create function public.ensure_phd_simulator_v2_achievement_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.record_phd_simulator_v2_achievement_start(new.player_id);
  return new;
end;
$$;
create trigger phd_simulator_v2_achievement_run_player
  after insert on public.phd_simulator_v2_achievement_runs
  for each row execute function public.ensure_phd_simulator_v2_achievement_player();

create function public.get_phd_simulator_v2_achievement_stats_v2()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with started as (
    select count(*) as players from public.phd_simulator_v2_achievement_players
  ), valid_completions as (
    select a.player_id, a.achievement_id
    from public.phd_simulator_v2_achievement_completions a
    join public.phd_simulator_v2_achievement_catalog c on c.id = a.achievement_id
      and a.role_id = any(c.eligible_role_ids)
  ), achieved as (
    select achievement_id, count(distinct player_id) as players
    from valid_completions group by achievement_id
  ), display_rows as (
    select c.id, coalesce(a.players, 0) as players
    from public.phd_simulator_v2_achievement_catalog c
    left join achieved a on a.achievement_id = c.id
  )
  select pg_catalog.jsonb_build_object('version', 2, 'achievements',
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', d.id, 'achievedPlayers', d.players, 'eligiblePlayers', s.players
    ) order by d.id), '[]'::jsonb))
  from display_rows d cross join started s;
$$;

revoke all on function public.record_phd_simulator_v2_achievement_start(uuid)
  from public, anon, authenticated;
revoke all on function public.ensure_phd_simulator_v2_achievement_player()
  from public, anon, authenticated;
revoke all on function public.get_phd_simulator_v2_achievement_stats_v2()
  from public, anon, authenticated;
grant execute on function public.record_phd_simulator_v2_achievement_start(uuid)
  to anon, authenticated;
grant execute on function public.get_phd_simulator_v2_achievement_stats_v2()
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
