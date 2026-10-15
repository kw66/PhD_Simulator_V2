-- Safe to execute against the live project: every fixture and write rolls back.
begin;

-- Capture aggregate baselines; production data is never assumed empty.
create temporary table achievement_verification_baseline as
  select x->>'id' as id, (x->>'achievedPlayers')::bigint as achieved,
    (x->>'eligiblePlayers')::bigint as eligible
  from jsonb_array_elements(public.get_phd_simulator_v2_achievement_stats()->'achievements') x;
create temporary table achievement_verification_ids as select
  gen_random_uuid() as player_a, gen_random_uuid() as player_b, gen_random_uuid() as player_c,
  gen_random_uuid() as run_a, gen_random_uuid() as run_b, gen_random_uuid() as run_c,
  gen_random_uuid() as run_d, gen_random_uuid() as run_e;
grant select on achievement_verification_baseline, achievement_verification_ids to anon;

set local role anon;
do $$
declare
  ids record;
  before_stats jsonb;
  after_stats jsonb;
  rejected boolean;
begin
  select * into ids from achievement_verification_ids;
  if has_table_privilege('anon', 'public.phd_simulator_v2_achievement_runs', 'SELECT')
    or has_table_privilege('anon', 'public.phd_simulator_v2_achievement_completions', 'SELECT')
    or has_table_privilege('anon', 'public.phd_simulator_v2_achievement_catalog', 'SELECT')
    or has_table_privilege('anon', 'public.phd_simulator_v2_achievement_runs', 'INSERT')
    or has_table_privilege('anon', 'public.phd_simulator_v2_achievement_completions', 'INSERT')
    or has_table_privilege('authenticated', 'public.phd_simulator_v2_achievement_completions', 'SELECT') then
    raise exception 'Private achievement records are directly accessible';
  end if;

  -- Duplicate IDs and reordered retry payloads are canonicalized.
  perform public.record_phd_simulator_v2_achievement_run(ids.player_a, ids.run_a, 'normal',
    array['normal:first-pot', 'global:breakthrough-ii', 'global:breakthrough-ii']);
  before_stats := public.get_phd_simulator_v2_achievement_stats();
  perform public.record_phd_simulator_v2_achievement_run(ids.player_a, ids.run_a, 'normal',
    array['global:breakthrough-ii', 'normal:first-pot']);
  if public.get_phd_simulator_v2_achievement_stats() is distinct from before_stats then
    raise exception 'Retry counted the finalized run twice';
  end if;

  -- Same player completes a shared achievement with another character.
  perform public.record_phd_simulator_v2_achievement_run(ids.player_a, ids.run_b, 'rich', array['global:breakthrough-ii']);
  -- Zero-achievement finalized runs still contribute one eligible player.
  perform public.record_phd_simulator_v2_achievement_run(ids.player_b, ids.run_c, 'genius', '{}'::text[]);
  perform public.record_phd_simulator_v2_achievement_run(ids.player_b, ids.run_d, 'normal', '{}'::text[]);
  -- The reversed player belongs in universal, but not upright/normal denominators.
  perform public.record_phd_simulator_v2_achievement_run(ids.player_c, ids.run_e, 'normal-reversed', '{}'::text[]);

  after_stats := public.get_phd_simulator_v2_achievement_stats();
  if after_stats->>'version' <> '1' or jsonb_array_length(after_stats->'achievements') <> 184 then
    raise exception 'Incomplete statistics snapshot';
  end if;
  if exists (
    select 1 from jsonb_array_elements(after_stats->'achievements') x
    join achievement_verification_baseline b on b.id = x->>'id'
    where (x->>'id' = 'global:breakthrough-ii' and
        ((x->>'achievedPlayers')::bigint <> b.achieved + 1 or (x->>'eligiblePlayers')::bigint <> b.eligible + 3))
      or (x->>'id' = 'normal:first-pot' and
        ((x->>'achievedPlayers')::bigint <> b.achieved + 1 or (x->>'eligiblePlayers')::bigint <> b.eligible + 2))
      or (x->>'id' = 'upright:breakthrough-i' and
        ((x->>'achievedPlayers')::bigint <> b.achieved or (x->>'eligiblePlayers')::bigint <> b.eligible + 2))
  ) then
    raise exception 'Distinct-player numerator or eligible-role denominator is incorrect';
  end if;

  -- A finalized run cannot be extended with an alternative branch.
  rejected := false;
  begin
    perform public.record_phd_simulator_v2_achievement_run(ids.player_a, ids.run_a, 'normal',
      array['normal:first-pot', 'global:breakthrough-ii', 'normal:ending-master']);
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'A finalized branch was extended'; end if;
  rejected := false;
  begin
    perform public.record_phd_simulator_v2_achievement_run(ids.player_b, ids.run_a, 'normal',
      array['normal:first-pot', 'global:breakthrough-ii']);
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'A finalized run changed player'; end if;
  rejected := false;
  begin
    perform public.record_phd_simulator_v2_achievement_run(ids.player_b, gen_random_uuid(), 'genius', array['normal:first-pot']);
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Role-specific achievement accepted another role'; end if;
  rejected := false;
  begin
    perform public.record_phd_simulator_v2_achievement_run(ids.player_b, gen_random_uuid(), 'normal', array['not-an-achievement']);
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Unknown achievement was accepted'; end if;
  rejected := false;
  begin
    perform public.record_phd_simulator_v2_achievement_run(ids.player_b, gen_random_uuid(), 'not-a-role', '{}'::text[]);
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Unknown role was accepted'; end if;
  rejected := false;
  begin
    perform public.record_phd_simulator_v2_achievement_run(ids.player_b, gen_random_uuid(), 'normal', array[null]::text[]);
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Null achievement was accepted'; end if;
  rejected := false;
  begin
    perform public.record_phd_simulator_v2_achievement_run(null, gen_random_uuid(), 'normal', '{}'::text[]);
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected then raise exception 'Null player was accepted'; end if;
  if public.get_phd_simulator_v2_achievement_stats() is distinct from after_stats then
    raise exception 'Rejected payloads wrote partial records';
  end if;
end $$;
reset role;

-- Check first completion dates and per-role records without exposing them publicly.
do $$
declare ids record; original_date timestamptz;
begin
  select * into ids from achievement_verification_ids;
  if (select count(*) from public.phd_simulator_v2_achievement_runs where player_id in(ids.player_a, ids.player_b, ids.player_c)) <> 5
    or (select count(*) from public.phd_simulator_v2_achievement_completions
      where player_id = ids.player_a and achievement_id = 'global:breakthrough-ii') <> 2 then
    raise exception 'Run or per-character completion records missing';
  end if;
  -- now() is constant inside this transaction, so use an earlier fixture date.
  update public.phd_simulator_v2_achievement_completions set completed_at = '2020-01-01T00:00:00Z'
    where player_id = ids.player_a and achievement_id = 'normal:first-pot' and role_id = 'normal';
  select completed_at into original_date from public.phd_simulator_v2_achievement_completions
    where player_id = ids.player_a and achievement_id = 'normal:first-pot' and role_id = 'normal';
  perform public.record_phd_simulator_v2_achievement_run(ids.player_a, gen_random_uuid(), 'normal', array['normal:first-pot']);
  if (select completed_at from public.phd_simulator_v2_achievement_completions
    where player_id = ids.player_a and achievement_id = 'normal:first-pot' and role_id = 'normal') is distinct from original_date then
    raise exception 'Repeat completion changed first date';
  end if;
end $$;

rollback;
select 'passed; all achievement fixtures rolled back' as verification;
