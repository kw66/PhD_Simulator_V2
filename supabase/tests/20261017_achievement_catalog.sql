-- Run after the 20261017 migrations. All fixtures and writes roll back.
begin;
create temporary table achievement_catalog_baseline as
select row->>'id' as id, (row->>'achievedPlayers')::bigint as achieved,
  (row->>'eligiblePlayers')::bigint as eligible
from jsonb_array_elements(public.get_phd_simulator_v2_achievement_stats_v2()->'achievements') row;
grant select on achievement_catalog_baseline to anon;

do $$ begin
  if (select count(*) from public.phd_simulator_v2_achievement_catalog) <> 175
    or (select count(*) from public.phd_simulator_v2_achievement_catalog
      where id ~ ':ending-(master|phd)$') <> 24
    or exists (select 1 from public.phd_simulator_v2_achievement_catalog
      where id ~ '^(rewinder|research-captain|special-dandan|special-daji|cursed-frail|special-finite-life|special-fading-genius|cursed-debt):ending-(master|phd)$') then
    raise exception 'Retired graduation achievements remain or ordinary graduations are missing';
  end if;
  if (select cardinality(eligible_role_ids) from public.phd_simulator_v2_achievement_catalog
    where id = 'unlock:research-captain') is distinct from 18 then
    raise exception 'Captain unlock achievement must support all active roles';
  end if;
  if (select cardinality(eligible_role_ids) from public.phd_simulator_v2_achievement_catalog
    where id = 'unlock:rewinder') is distinct from 18 then
    raise exception 'Rewinder unlock achievement must support all active roles';
  end if;
  if exists (
    select 1 from public.phd_simulator_v2_achievement_catalog
    where id = 'global:air-dried'
      and eligible_role_ids && array['rewinder', 'research-captain', 'cursed-frail',
        'special-finite-life', 'special-fading-genius', 'cursed-debt']::text[]
  ) then
    raise exception 'Ordinary global achievements must exclude special and cursed roles';
  end if;
end $$;

set local role anon;
do $$
declare
  epoch text := '20261016-monthly-replay-v1';
  player uuid := gen_random_uuid();
  run uuid := gen_random_uuid();
  role_id text;
  achievement text;
  snapshot jsonb;
  rejected boolean;
begin
  perform public.record_phd_simulator_v2_achievement_start(player, epoch);
  perform public.record_phd_simulator_v2_achievement_run(player, run, 'normal',
    array['unlock:research-captain', 'unlock:rewinder', 'normal:truly-ordinary', 'global:study-fatigue'], epoch);
  perform public.record_phd_simulator_v2_achievement_run(player, run, 'normal',
    array['global:study-fatigue', 'normal:truly-ordinary', 'unlock:rewinder', 'unlock:research-captain'], epoch);
  foreach role_id in array array['research-captain', 'rewinder', 'cursed-frail',
    'special-fading-genius', 'special-finite-life', 'cursed-debt'] loop
    rejected := false;
    begin
      perform public.record_phd_simulator_v2_achievement_run(player, gen_random_uuid(), role_id,
        array['global:study-fatigue'], epoch);
    exception when invalid_parameter_value then rejected := true; end;
    if not rejected then raise exception 'Ordinary shared achievement accepted for special role'; end if;
    perform public.record_phd_simulator_v2_achievement_run(player, gen_random_uuid(), role_id,
      array['global:breakthrough-ii', 'global:product-collector'], epoch);
  end loop;
  foreach role_id in array array['cursed-frail', 'special-fading-genius', 'special-finite-life', 'cursed-debt'] loop
    achievement := role_id || ':curse-hell-phd';
    run := gen_random_uuid();
    perform public.record_phd_simulator_v2_achievement_run(player, run, role_id, array[achievement], epoch);
    perform public.record_phd_simulator_v2_achievement_run(player, run, role_id, array[achievement], epoch);
    rejected := false;
    begin
      perform public.record_phd_simulator_v2_achievement_run(player, gen_random_uuid(), 'normal', array[achievement], epoch);
    exception when invalid_parameter_value then rejected := true; end;
    if not rejected then raise exception 'Curse achievement accepted for wrong role'; end if;
    rejected := false;
    begin
      perform public.record_phd_simulator_v2_achievement_run(player, gen_random_uuid(), role_id,
        array[role_id || ':ending-phd'], epoch);
    exception when invalid_parameter_value then rejected := true; end;
    if not rejected then raise exception 'Retired graduation achievement was accepted'; end if;
  end loop;
  snapshot := public.get_phd_simulator_v2_achievement_stats_v2();
  if snapshot->>'version' <> '2' or jsonb_array_length(snapshot->'achievements') <> 175 then
    raise exception 'Incorrect statistics version or catalog size';
  end if;
  if exists (
    select 1 from jsonb_array_elements(snapshot->'achievements') row
    join achievement_catalog_baseline b on b.id = row->>'id'
    where (row->>'eligiblePlayers')::bigint <> b.eligible + 1
      or (row->>'achievedPlayers')::bigint <> b.achieved + case
        when b.id in ('unlock:research-captain', 'unlock:rewinder', 'normal:truly-ordinary', 'global:study-fatigue',
          'global:breakthrough-ii', 'global:product-collector') or b.id like '%:curse-hell-phd' then 1 else 0 end
  ) then raise exception 'Completion deduplication or all-started-player denominator is incorrect'; end if;
end $$;
reset role;
rollback;
select 'passed; catalog, scope, retries and denominators verified; all fixtures rolled back' as verification;
