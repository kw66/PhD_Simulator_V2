-- Run after 20261020_kwgame_v2_role_level_stats.sql; every assertion rolls back.
begin;

do $test$
declare
  first_player uuid := '71000000-0000-4000-8000-000000000001';
  second_player uuid := '71000000-0000-4000-8000-000000000002';
  current_epoch text := '20261016-monthly-replay-v1';
  snapshot jsonb;
  invalid_snapshot jsonb;
begin
  delete from public.phd_simulator_v2_role_levels where player_id in (first_player, second_player);
  perform public.record_phd_simulator_v2_role_levels(first_player, current_epoch, '{"normal":0,"genius":2}');
  perform public.record_phd_simulator_v2_role_levels(first_player, current_epoch, '{"normal":4}');
  perform public.record_phd_simulator_v2_role_levels(first_player, current_epoch, '{"normal":1}');
  perform public.record_phd_simulator_v2_role_levels(first_player, current_epoch, '{"normal":4}');
  perform public.record_phd_simulator_v2_role_levels(second_player, current_epoch, '{"normal":10}');
  if (select count(*) from public.phd_simulator_v2_role_levels where player_id = first_player) <> 2
    or (select level from public.phd_simulator_v2_role_levels where player_id = first_player and role_id = 'normal') <> 4 then
    raise exception 'A stale tab regressed or duplicated the latest role level';
  end if;
  snapshot := public.get_phd_simulator_v2_role_level_statistics();
  if snapshot ->> 'epoch' <> current_epoch
    or pg_catalog.jsonb_array_length(snapshot #> '{roles,normal,counts}') <> 11
    or (snapshot #>> '{roles,normal,counts,4}')::bigint < 1
    or (snapshot #>> '{roles,normal,counts,10}')::bigint < 1
    or snapshot::text like '%' || first_player::text || '%' then
    raise exception 'Aggregate shape, counts or privacy contract failed';
  end if;
  if exists (select 1 from public.phd_simulator_v2_role_levels where player_id = first_player and role_id = 'rich') then
    raise exception 'Unreported locked roles must not enter the denominator';
  end if;

  foreach invalid_snapshot in array array[
    '{"normal":11}'::jsonb, '{"normal":-1}'::jsonb, '{"normal":1.5}'::jsonb,
    '{"normal":"2"}'::jsonb, '{"unknown":2}'::jsonb, '{"normal":null}'::jsonb, '[]'::jsonb, '{}'::jsonb
  ] loop
    begin
      perform public.record_phd_simulator_v2_role_levels(first_player, current_epoch, invalid_snapshot);
      raise exception 'Malformed levels accepted: %', invalid_snapshot;
    exception when invalid_parameter_value then null;
    end;
  end loop;
  begin
    perform public.record_phd_simulator_v2_role_levels(first_player, 'old-epoch', '{"normal":10}');
    raise exception 'Old epoch was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.record_phd_simulator_v2_role_levels('71000000-0000-1000-8000-000000000001', current_epoch, '{"normal":10}');
    raise exception 'Invalid player identifier was accepted';
  exception when invalid_parameter_value then null;
  end;
  if pg_catalog.has_table_privilege('anon', 'public.phd_simulator_v2_role_levels', 'select')
    or pg_catalog.has_table_privilege('anon', 'public.phd_simulator_v2_role_levels', 'insert')
    or not pg_catalog.has_function_privilege('anon', 'public.record_phd_simulator_v2_role_levels(uuid,text,jsonb)', 'execute')
    or not pg_catalog.has_function_privilege('anon', 'public.get_phd_simulator_v2_role_level_statistics()', 'execute')
    or pg_catalog.has_function_privilege('authenticated', 'public.record_phd_simulator_v2_role_levels(uuid,text,jsonb)', 'execute') then
    raise exception 'Level statistics grants expose raw player rows or deny aggregate RPCs';
  end if;
end;
$test$;

set local role anon;
do $anonymous_test$
declare
  before_update jsonb := public.get_phd_simulator_v2_role_level_statistics();
  after_update jsonb;
begin
  perform public.record_phd_simulator_v2_role_levels('71000000-0000-4000-8000-000000000001',
    '20261016-monthly-replay-v1', '{"normal":7}');
  perform public.record_phd_simulator_v2_role_levels('71000000-0000-4000-8000-000000000001',
    '20261016-monthly-replay-v1', '{"normal":3}');
  after_update := public.get_phd_simulator_v2_role_level_statistics();
  if (after_update #>> '{roles,normal,counts,4}')::bigint <> (before_update #>> '{roles,normal,counts,4}')::bigint - 1
    or (after_update #>> '{roles,normal,counts,7}')::bigint <> (before_update #>> '{roles,normal,counts,7}')::bigint + 1 then
    raise exception 'Upgrading did not move exactly one anonymous player between levels';
  end if;
  begin
    perform * from public.phd_simulator_v2_role_levels;
    raise exception 'Anonymous caller can read individual player records';
  exception when insufficient_privilege then null;
  end;
end;
$anonymous_test$;

rollback;
