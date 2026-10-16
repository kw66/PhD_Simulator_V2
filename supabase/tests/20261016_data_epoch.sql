-- Run after 20261016_kwgame_v2_data_epoch.sql. All fixtures roll back.
begin;
do $test$
declare
  epoch text := '20261016-monthly-replay-v1';
  test_day date := pg_catalog.timezone('Asia/Shanghai', pg_catalog.now())::date;
  visitor uuid := 'e0160000-0000-4000-8000-000000000001';
  player uuid := 'e0160000-0000-4000-8000-000000000002';
  run uuid := 'e0160000-0000-4000-8000-000000000003';
  paper uuid := 'e0160000-0000-4000-8000-000000000004';
  visit uuid := 'e0160000-0000-4000-8000-000000000005';
  start_id uuid := 'e0160000-0000-4000-8000-000000000006';
  finish_id uuid := 'e0160000-0000-4000-8000-000000000007';
  journal_id uuid := 'e0160000-0000-4000-8000-000000000008';
  thesis_id uuid := 'e0160000-0000-4000-8000-000000000009';
  legacy_paper uuid := 'e0160000-0000-4000-8000-00000000000a';
  run_key text := '[1792128329123,"normal"]';
  before_activity jsonb;
  before_papers bigint;
  before_journal bigint;
  before_thesis bigint;
  before_achieved bigint;
  before_players bigint;
  achievement text;
  actual jsonb;
  payload jsonb;
  total_rows bigint;
begin
  select id into achievement from public.phd_simulator_v2_achievement_catalog
    where 'normal' = any(eligible_role_ids) order by id limit 1;
  if achievement is null then raise exception 'Missing achievement catalog'; end if;
  before_activity := public.get_phd_simulator_v2_activity_stats(test_day);
  before_papers := (public.get_phd_simulator_v2_conference_stats('v2-review-20261009','EPOCHTEST',2026,'A')->>'submissions')::bigint;
  before_journal := (public.get_phd_simulator_v2_journal_stats('v2-journal-20261012','pami')->>'acceptedCount')::bigint;
  before_thesis := (public.get_phd_simulator_v2_thesis_stats('v2-thesis-20261013','master')->>'submittedCount')::bigint;
  select (r->>'achievedPlayers')::bigint, (r->>'eligiblePlayers')::bigint into before_achieved,before_players
    from pg_catalog.jsonb_array_elements(public.get_phd_simulator_v2_achievement_stats_v2()->'achievements') r where r->>'id'=achievement;
  -- A legacy client has neither the current epoch nor access to internal writers.
  begin perform public.record_phd_simulator_v2_stats_batch('[]'::jsonb); raise exception 'Old batch accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_phd_simulator_v2_stats_batch('[]'::jsonb,'legacy'); raise exception 'Wrong epoch accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_phd_simulator_v2_achievement_start(player); raise exception 'Old start accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_phd_simulator_v2_achievement_run(player,run,'normal','{}'); raise exception 'Old run accepted'; exception when sqlstate '22023' then null; end;
  if pg_catalog.to_regprocedure('public.record_phd_simulator_v2_stats_batch(jsonb)') is not null
    or pg_catalog.to_regprocedure('public.record_phd_simulator_v2_achievement_start(uuid)') is not null
    or pg_catalog.to_regprocedure('public.record_phd_simulator_v2_achievement_run(uuid,uuid,text,text[])') is not null then raise exception 'Ambiguous obsolete overload'; end if;
  if pg_catalog.has_function_privilege('anon','public.record_phd_simulator_v2_activity(uuid,text,date,uuid,text,text,text)','execute')
    or pg_catalog.has_function_privilege('anon','public.record_phd_simulator_v2_conference_review(uuid,text,text,integer,text,boolean,text,double precision,jsonb)','execute')
    or not pg_catalog.has_function_privilege('anon','public.record_phd_simulator_v2_stats_batch(jsonb,text)','execute') then raise exception 'Wrong wrapper privileges'; end if;
  -- Add legacy rows now (after cutoff) to prove timestamp-only filtering would
  -- be insufficient. The epoch filter must still exclude them.
  insert into public.phd_simulator_v2_conference_reviews(id,rule_version,conference_name,conference_year,target,accepted,accept_type,score)
    values(legacy_paper,'v2-review-20261009','EPOCHTEST',2026,'A',true,'Oral',99999);
  insert into public.phd_simulator_v2_achievement_players(player_id) values(player);
  insert into public.phd_simulator_v2_achievement_completions(player_id,achievement_id,role_id) values(player,achievement,'normal');
  insert into public.phd_simulator_v2_activity_visitors(data_epoch,day,visitor_id) values('legacy',test_day,visitor);
  if (public.get_phd_simulator_v2_conference_stats('v2-review-20261009','EPOCHTEST',2026,'A')->>'submissions')::bigint <> before_papers then raise exception 'Legacy paper leaked'; end if;
  select r into actual from pg_catalog.jsonb_array_elements(public.get_phd_simulator_v2_achievement_stats_v2()->'achievements') r where r->>'id'=achievement;
  if (actual->>'achievedPlayers')::bigint <> before_achieved or (actual->>'eligiblePlayers')::bigint <> before_players then raise exception 'Legacy achievement leaked'; end if;
  payload := pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind','conference','payload',
    pg_catalog.jsonb_build_object('p_id',legacy_paper,'p_rule_version','v2-review-20261009','p_conference_name','EPOCHTEST','p_conference_year',2026,'p_target','A','p_accepted',true,'p_accept_type','Oral','p_score',99999)));
  begin perform public.record_phd_simulator_v2_stats_batch(payload,epoch); raise exception 'Historical UUID relabelled'; exception when sqlstate '22023' then null; end;
  payload := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('kind','conference','payload',pg_catalog.jsonb_build_object('p_id',paper,'p_rule_version','v2-review-20261009','p_conference_name','EPOCHTEST','p_conference_year',2026,'p_target','A','p_accepted',true,'p_accept_type','Poster','p_score',123)),
    pg_catalog.jsonb_build_object('kind','journal','payload',pg_catalog.jsonb_build_object('p_id',journal_id,'p_rule_version','v2-journal-20261012','p_journal','pami','p_score',125,'p_months',3)),
    pg_catalog.jsonb_build_object('kind','thesis','payload',pg_catalog.jsonb_build_object('p_id',thesis_id,'p_rule_version','v2-thesis-20261013','p_degree','master','p_submitted',true,'p_passed',true,'p_excellent',true)),
    pg_catalog.jsonb_build_object('kind','activity','payload',pg_catalog.jsonb_build_object('p_id',visit,'p_event','visit','p_day',test_day,'p_visitor_id',visitor)),
    pg_catalog.jsonb_build_object('kind','activity','payload',pg_catalog.jsonb_build_object('p_id',start_id,'p_event','start','p_day',test_day,'p_run_key',run_key,'p_role_id','normal')),
    pg_catalog.jsonb_build_object('kind','activity','payload',pg_catalog.jsonb_build_object('p_id',finish_id,'p_event','finish','p_day',test_day,'p_run_key',run_key,'p_role_id','normal','p_ending','master'))
  );
  perform public.record_phd_simulator_v2_stats_batch(payload,epoch);
  perform public.record_phd_simulator_v2_stats_batch(payload,epoch);
  if (public.get_phd_simulator_v2_conference_stats('v2-review-20261009','EPOCHTEST',2026,'A')->>'submissions')::bigint <> before_papers+1 then raise exception 'New conference count or retry wrong'; end if;
  if (public.get_phd_simulator_v2_journal_stats('v2-journal-20261012','pami')->>'acceptedCount')::bigint <> before_journal+1 then raise exception 'New journal count wrong'; end if;
  if (public.get_phd_simulator_v2_thesis_stats('v2-thesis-20261013','master')->>'submittedCount')::bigint <> before_thesis+1 then raise exception 'New thesis count wrong'; end if;
  actual:=public.get_phd_simulator_v2_activity_stats(test_day);
  if actual->>'epoch'<>epoch or (actual->>'views')::bigint<>(before_activity->>'views')::bigint+1
    or (actual->>'visitors')::bigint<>(before_activity->>'visitors')::bigint+1
    or (actual->>'games')::bigint<>(before_activity->>'games')::bigint+1
    or (actual->'roles'->'normal'->>'finished')::bigint<>(before_activity->'roles'->'normal'->>'finished')::bigint+1 then raise exception 'Epoch activity counters wrong'; end if;
  perform public.record_phd_simulator_v2_achievement_start(player,epoch);
  perform public.record_phd_simulator_v2_achievement_run(player,run,'normal',array[achievement],epoch);
  perform public.record_phd_simulator_v2_achievement_run(player,run,'normal',array[achievement],epoch);
  select r into actual from pg_catalog.jsonb_array_elements(public.get_phd_simulator_v2_achievement_stats_v2()->'achievements') r where r->>'id'=achievement;
  if (actual->>'achievedPlayers')::bigint<>before_achieved+1 or (actual->>'eligiblePlayers')::bigint<>before_players+1 then raise exception 'New achievement counts wrong'; end if;
  if public.get_phd_simulator_v2_stats_snapshot()->>'epoch'<>epoch then raise exception 'Snapshot epoch missing'; end if;
  if (select count(*) from public.phd_simulator_v2_activity_visitors where day=test_day and visitor_id=visitor)<>2 then raise exception 'Same-day legacy visitor lost'; end if;
  -- Each public batch is atomic, even when a later record belongs to old data.
  select count(*) into total_rows from public.phd_simulator_v2_journal_acceptances;
  begin
    perform public.record_phd_simulator_v2_stats_batch(pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('kind','journal','payload',pg_catalog.jsonb_build_object('p_id','e0160000-0000-4000-8000-00000000000b','p_rule_version','v2-journal-20261012','p_journal','pami','p_score',125,'p_months',3)),
      pg_catalog.jsonb_build_object('kind','activity','payload',pg_catalog.jsonb_build_object('p_id','e0160000-0000-4000-8000-00000000000c','p_event','start','p_day',date '2026-10-15','p_run_key','[123,"normal"]','p_role_id','normal'))),epoch);
    raise exception 'Old date accepted';
  exception when sqlstate '22023' then null; end;
  if (select count(*) from public.phd_simulator_v2_journal_acceptances)<>total_rows then raise exception 'Batch partially wrote'; end if;
  perform public.record_phd_simulator_v2_stats_batch(pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('kind','activity','payload',pg_catalog.jsonb_build_object('p_id','e0160000-0000-4000-8000-00000000000d','p_event','start','p_day',test_day,'p_run_key','[123,"normal"]','p_role_id','normal'))),epoch);
  raise notice 'PASS: new epoch writes, retries, legacy exclusion, denominator, privileges, cutoff and atomicity';
end;
$test$;
rollback;
