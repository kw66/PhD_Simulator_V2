-- Safe against production: all fixtures and writes roll back.
begin;
create temporary table achievement_start_baseline as
  select x->>'id' as id, (x->>'achievedPlayers')::bigint as achieved,
    (x->>'eligiblePlayers')::bigint as eligible
  from jsonb_array_elements(public.get_phd_simulator_v2_achievement_stats_v2()->'achievements') x;
create temporary table achievement_start_ids as select
  gen_random_uuid() as player_a, gen_random_uuid() as player_b,
  gen_random_uuid() as player_c, gen_random_uuid() as player_d,
  gen_random_uuid() as visitor_only,
  gen_random_uuid() as run_a, gen_random_uuid() as run_b,
  gen_random_uuid() as run_c, gen_random_uuid() as run_d,
  gen_random_uuid() as run_e;
grant select on achievement_start_baseline, achievement_start_ids to anon;

set local role anon;
do $$
declare ids record; stats jsonb; before_stats jsonb; rejected boolean;
begin
  select * into ids from achievement_start_ids;
  if exists (
    select 1 from (values ('anon'), ('authenticated')) as roles(id)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as privileges(id)
    where has_table_privilege(roles.id::name, 'public.phd_simulator_v2_achievement_players', privileges.id)
  ) or has_function_privilege('anon', 'public.ensure_phd_simulator_v2_achievement_player()', 'EXECUTE') then
    raise exception 'Private start membership or trigger function is publicly accessible';
  end if;
  if not has_function_privilege('anon', 'public.record_phd_simulator_v2_achievement_start(uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.record_phd_simulator_v2_achievement_start(uuid)', 'EXECUTE')
    or not has_function_privilege('anon', 'public.get_phd_simulator_v2_achievement_stats_v2()', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.get_phd_simulator_v2_achievement_stats_v2()', 'EXECUTE') then
    raise exception 'Start or version 2 statistics RPC is not accessible';
  end if;

  before_stats := public.get_phd_simulator_v2_achievement_stats_v2();
  if public.get_phd_simulator_v2_achievement_stats_v2() is distinct from before_stats then
    raise exception 'Read-only visits changed statistics';
  end if;

  perform public.record_phd_simulator_v2_achievement_start(ids.player_a);
  perform public.record_phd_simulator_v2_achievement_start(ids.player_a);
  -- Player B never finalizes; starts must already affect every denominator.
  perform public.record_phd_simulator_v2_achievement_start(ids.player_b);
  stats := public.get_phd_simulator_v2_achievement_stats_v2();
  if exists (
    select 1 from jsonb_array_elements(stats->'achievements') x
    join achievement_start_baseline b on b.id = x->>'id'
    where (x->>'eligiblePlayers')::bigint <> b.eligible + 2
      or (x->>'achievedPlayers')::bigint <> b.achieved
  ) then raise exception 'Start-only players did not affect all denominators exactly once'; end if;

  -- No explicit start: finalization must supply membership in the same transaction.
  perform public.record_phd_simulator_v2_achievement_run(ids.player_c, ids.run_c, 'genius', '{}'::text[]);
  perform public.record_phd_simulator_v2_achievement_start(ids.player_d);
  perform public.record_phd_simulator_v2_achievement_run(ids.player_a, ids.run_a, 'normal',
    array['normal:ending-master', 'normal:first-pot', 'global:breakthrough-ii']);
  perform public.record_phd_simulator_v2_achievement_run(ids.player_a, ids.run_b, 'rich',
    array['rich:ending-master', 'global:breakthrough-ii']);
  perform public.record_phd_simulator_v2_achievement_run(ids.player_d, ids.run_d, 'normal',
    array['normal:ending-phd', 'global:breakthrough-ii']);
  perform public.record_phd_simulator_v2_achievement_run(ids.player_d, ids.run_e, 'rich',
    array['rich:ending-phd', 'global:breakthrough-ii']);
  stats := public.get_phd_simulator_v2_achievement_stats_v2();
  if stats->>'version' <> '2' or jsonb_array_length(stats->'achievements') <> 184 then
    raise exception 'Missing version 2 snapshot or individual graduation records';
  end if;
  if exists (
    select 1 from jsonb_array_elements(stats->'achievements') x
    join achievement_start_baseline b on b.id = x->>'id'
    where (x->>'eligiblePlayers')::bigint <> b.eligible + 4
      or (x->>'achievedPlayers')::bigint <> b.achieved + case
        when x->>'id' = 'global:breakthrough-ii' then 2
        when x->>'id' in ('normal:first-pot', 'normal:ending-master', 'rich:ending-master',
          'normal:ending-phd', 'rich:ending-phd') then 1
        else 0 end
  ) then raise exception 'Global denominator or per-character graduation numerator is incorrect'; end if;

  before_stats := stats;
  perform public.record_phd_simulator_v2_achievement_start(ids.player_d);
  perform public.record_phd_simulator_v2_achievement_run(ids.player_d, ids.run_e, 'rich',
    array['global:breakthrough-ii', 'rich:ending-phd']);
  if public.get_phd_simulator_v2_achievement_stats_v2() is distinct from before_stats then
    raise exception 'Retry counted another start or completion';
  end if;
  rejected := false;
  begin perform public.record_phd_simulator_v2_achievement_start(null);
    exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Null player was accepted'; end if;
  rejected := false;
  begin perform public.record_phd_simulator_v2_achievement_start('00000000-0000-0000-0000-000000000000');
    exception when invalid_parameter_value then rejected := true; end;
  if not rejected then raise exception 'Non-v4 UUID was accepted'; end if;
  rejected := false;
  begin
    perform public.record_phd_simulator_v2_achievement_run(ids.visitor_only, gen_random_uuid(), 'normal', array['unknown']);
    exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected or public.get_phd_simulator_v2_achievement_stats_v2() is distinct from before_stats then
    raise exception 'Rejected payload created player membership';
  end if;
end $$;
reset role;

do $$
declare ids record;
begin
  select * into ids from achievement_start_ids;
  if (select count(*) from public.phd_simulator_v2_achievement_players
      where player_id in (ids.player_a, ids.player_b, ids.player_c, ids.player_d)) <> 4
    or exists (select 1 from public.phd_simulator_v2_achievement_players where player_id = ids.visitor_only)
    or exists (select 1 from public.phd_simulator_v2_achievement_runs where player_id = ids.player_b) then
    raise exception 'Started-player membership is missing, duplicated, or includes a visitor';
  end if;
  if (select count(*) from public.phd_simulator_v2_achievement_catalog) <> 184
    or (select count(*) from public.phd_simulator_v2_achievement_catalog
      where split_part(id, ':', 2) in ('ending-master', 'ending-phd')) <> 40 then
    raise exception 'Individual graduation reward catalog was changed';
  end if;
end $$;
rollback;
select 'passed; all-started-player achievement fixtures rolled back' as verification;
