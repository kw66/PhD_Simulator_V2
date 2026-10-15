-- Exercise the production anonymous RPCs; every fixture is rolled back.
begin;
set local role anon;
do $$
declare
  today date := (now() at time zone 'Asia/Shanghai')::date;
  run_key text := jsonb_build_array(-floor(random() * 9000000000000000), 'normal')::text;
  start_id uuid := gen_random_uuid();
  finish_id uuid := gen_random_uuid();
  paper_id uuid := gen_random_uuid();
  journal_id uuid := gen_random_uuid();
  thesis_id uuid := gen_random_uuid();
  initial_activity jsonb := public.get_phd_simulator_v2_activity_stats(today);
  initial_journal jsonb := public.get_phd_simulator_v2_journal_stats('v2-journal-20261012', 'pami');
  initial_thesis jsonb := public.get_phd_simulator_v2_thesis_stats('v2-thesis-20261013', 'phd');
  initial_conference jsonb := public.get_phd_simulator_v2_conference_stats('v2-review-20261009', 'CVPR', 2026, 'A');
  recorded_activity jsonb;
  recorded_papers jsonb;
  start_payload jsonb;
  final_batch jsonb;
  acknowledged jsonb;
  rejected boolean := false;
begin
  if has_table_privilege('anon', 'public.phd_simulator_v2_activity_runs', 'SELECT')
    or has_table_privilege('anon', 'public.phd_simulator_v2_conference_reviews', 'INSERT')
    or has_table_privilege('anon', 'public.phd_simulator_v2_journal_acceptances', 'INSERT')
    or has_table_privilege('anon', 'public.phd_simulator_v2_thesis_reviews', 'INSERT') then
    raise exception 'Raw statistics records are publicly accessible';
  end if;
  start_payload := jsonb_build_object('p_id',start_id,'p_event','start','p_day',today,'p_run_key',run_key,'p_role_id','normal');
  perform public.record_phd_simulator_v2_stats_batch(jsonb_build_array(jsonb_build_object('kind','activity','payload',start_payload)));
  -- Returning to a saved game may resend its start with a fresh request ID.
  perform public.record_phd_simulator_v2_stats_batch(jsonb_build_array(jsonb_build_object('kind','activity',
    'payload',start_payload || jsonb_build_object('p_id',gen_random_uuid()))));
  recorded_activity := public.get_phd_simulator_v2_activity_stats(today);
  if (recorded_activity->>'games')::bigint <> (initial_activity->>'games')::bigint + 1
    or (recorded_activity->'roles'->'normal'->>'games')::bigint <> (initial_activity->'roles'->'normal'->>'games')::bigint + 1
    or recorded_activity->'roles'->'normal'->'finished' is distinct from initial_activity->'roles'->'normal'->'finished' then
    raise exception 'Resume counted another game or starting counted an ending';
  end if;
  final_batch := jsonb_build_array(
    jsonb_build_object('kind','activity','payload',jsonb_build_object('p_id',finish_id,'p_event','finish','p_day',today,'p_run_key',run_key,'p_role_id','normal','p_ending','phd')),
    jsonb_build_object('kind','conference','payload',jsonb_build_object('p_id',paper_id,'p_rule_version','v2-review-20261009','p_conference_name','CVPR','p_conference_year',2026,'p_target','A','p_accepted',true,'p_accept_type','Poster','p_score',125)),
    jsonb_build_object('kind','journal','payload',jsonb_build_object('p_id',journal_id,'p_rule_version','v2-journal-20261012','p_journal','pami','p_score',130,'p_months',3)),
    jsonb_build_object('kind','thesis','payload',jsonb_build_object('p_id',thesis_id,'p_rule_version','v2-thesis-20261013','p_degree','phd','p_submitted',true,'p_passed',true,'p_excellent',false))
  );
  acknowledged := public.record_phd_simulator_v2_stats_batch(final_batch);
  if acknowledged is distinct from jsonb_build_array(finish_id,paper_id,journal_id,thesis_id) then
    raise exception 'Finalized batch has incomplete acknowledgement';
  end if;
  recorded_activity := public.get_phd_simulator_v2_activity_stats(today);
  recorded_papers := public.get_phd_simulator_v2_stats_snapshot();
  if (recorded_activity->'roles'->'normal'->>'finished')::bigint <> (initial_activity->'roles'->'normal'->>'finished')::bigint + 1
    or (recorded_activity->'roles'->'normal'->>'phd')::bigint <> (initial_activity->'roles'->'normal'->>'phd')::bigint + 1
    or (public.get_phd_simulator_v2_journal_stats('v2-journal-20261012','pami')->>'acceptedCount')::bigint <> (initial_journal->>'acceptedCount')::bigint + 1
    or (public.get_phd_simulator_v2_thesis_stats('v2-thesis-20261013','phd')->>'passedCount')::bigint <> (initial_thesis->>'passedCount')::bigint + 1
    or (public.get_phd_simulator_v2_conference_stats('v2-review-20261009','CVPR',2026,'A')->>'accepted')::bigint <> (initial_conference->>'accepted')::bigint + 1 then
    raise exception 'Finalized batch did not update all aggregates exactly once';
  end if;
  -- Lost-response retries must be idempotent across all result categories.
  perform public.record_phd_simulator_v2_stats_batch(final_batch);
  perform public.record_phd_simulator_v2_stats_batch(jsonb_build_array(jsonb_build_object('kind','activity',
    'payload',final_batch->0->'payload' || jsonb_build_object('p_id',gen_random_uuid()))));
  if public.get_phd_simulator_v2_activity_stats(today) is distinct from recorded_activity
    or public.get_phd_simulator_v2_stats_snapshot() is distinct from recorded_papers then
    raise exception 'Finalized retry counted duplicate results';
  end if;
  begin
    perform public.record_phd_simulator_v2_stats_batch(jsonb_build_array(jsonb_build_object('kind','activity',
      'payload',final_batch->0->'payload' || jsonb_build_object('p_id',gen_random_uuid(),'p_ending','quit'))));
  exception when invalid_parameter_value then rejected := true;
  end;
  if not rejected or public.get_phd_simulator_v2_activity_stats(today) is distinct from recorded_activity then
    raise exception 'A finalized ending accepted another branch';
  end if;
end $$;
reset role;
rollback;
select 'passed; finalized statistics fixtures rolled back' as verification;
