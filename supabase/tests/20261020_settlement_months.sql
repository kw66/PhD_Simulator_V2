-- All fixtures, counters and receipts are rolled back.
begin;
do $test$
declare
  epoch text := '20261016-monthly-replay-v1';
  today date := (now() at time zone 'Asia/Shanghai')::date;
  test_key text := jsonb_build_array(-floor(random() * 9000000000000000), 'normal')::text;
  payload jsonb;
  variant jsonb;
  rejected boolean;
  initial_count bigint;
  settled_counts jsonb;
  month_value integer;
  degree_value text;
  original_role text := current_user;
begin
  if has_table_privilege('anon', 'public.phd_simulator_v2_activity_runs', 'SELECT')
    or has_table_privilege('anon', 'public.phd_simulator_v2_activity_runs', 'UPDATE') then
    raise exception 'Raw settlement data is publicly accessible';
  end if;
  payload := jsonb_build_object('p_id',gen_random_uuid(),'p_event','finish','p_day',today,
    'p_run_key',test_key,'p_role_id','normal','p_ending','quit','p_total_months',7,'p_degree','master',
    'p_finalized_run_id',gen_random_uuid(),'p_fingerprint','finish');
  select count into initial_count from public.phd_simulator_v2_activity_counters
    where counter_id='phd_simulator_v2_epoch20261016_role_normal_finished_total';
  perform set_config('role', 'anon', true);
  perform public.record_phd_simulator_v2_stats_batch(
    jsonb_build_array(jsonb_build_object('kind','activity','payload',payload)), epoch);
  perform set_config('role', original_role, true);
  select total_months, degree into month_value, degree_value
    from public.phd_simulator_v2_activity_runs where run_key = payload->>'p_run_key';
  if month_value is distinct from 7 or degree_value is distinct from 'master' then
    raise exception 'Actual final month and degree were not stored';
  end if;
  select jsonb_object_agg(counter_id, count) into settled_counts
    from public.phd_simulator_v2_activity_counters where counter_id like '%role_normal%';
  if (settled_counts->>'phd_simulator_v2_epoch20261016_role_normal_finished_total')::bigint
    is distinct from coalesce(initial_count,0) + 1 then
    raise exception 'Final settlement was not counted once';
  end if;

  -- Same receipt, different receipt/date, and older clients all deduplicate.
  perform public.record_phd_simulator_v2_stats_batch(jsonb_build_array(jsonb_build_object('kind','activity','payload',payload)), epoch);
  perform public.record_phd_simulator_v2_stats_batch(jsonb_build_array(jsonb_build_object('kind','activity',
    'payload',payload || jsonb_build_object('p_id',gen_random_uuid(),'p_day',today+1))), epoch);
  perform public.record_phd_simulator_v2_stats_batch(jsonb_build_array(jsonb_build_object('kind','activity',
    'payload',payload - 'p_total_months' - 'p_degree' || jsonb_build_object('p_id',gen_random_uuid()))), epoch);
  if (select total_months from public.phd_simulator_v2_activity_runs where run_key=payload->>'p_run_key') is distinct from 7
    or (select jsonb_object_agg(counter_id,count) from public.phd_simulator_v2_activity_counters where counter_id like '%role_normal%') is distinct from settled_counts then
    raise exception 'Retry erased metadata or counted an extra ending';
  end if;

  for variant in select value from jsonb_array_elements('[
    {"p_total_months":8}, {"p_total_months":-1}, {"p_total_months":71},
    {"p_total_months":1.5}, {"p_total_months":"7"}, {"p_total_months":null},
    {"p_degree":null}, {"p_degree":"other"}, {"p_degree":"phd"},
    {"p_event":"start"}, {"p_ending":"phd"}
  ]'::jsonb) loop
    rejected := false;
    begin
      perform public.record_phd_simulator_v2_stats_batch(jsonb_build_array(jsonb_build_object('kind','activity',
        'payload',payload || variant || jsonb_build_object('p_id',gen_random_uuid()))), epoch);
    exception when invalid_parameter_value then rejected := true;
    end;
    if not rejected then raise exception 'Invalid or conflicting metadata accepted: %', variant; end if;
  end loop;

  -- Legacy finishes remain unknown, then may be enriched without recounting.
  payload := payload - 'p_total_months' - 'p_degree' || jsonb_build_object('p_id',gen_random_uuid(),
    'p_finalized_run_id',gen_random_uuid(),'p_run_key',jsonb_build_array(-floor(random()*9000000000000000),'normal')::text);
  perform public.record_phd_simulator_v2_stats_batch(jsonb_build_array(jsonb_build_object('kind','activity','payload',payload)), epoch);
  if exists(select 1 from public.phd_simulator_v2_activity_runs where run_key=payload->>'p_run_key'
    and (total_months is not null or degree is not null)) then raise exception 'Invented legacy month'; end if;
  select jsonb_object_agg(counter_id,count) into settled_counts
    from public.phd_simulator_v2_activity_counters where counter_id like '%role_normal%';
  payload := payload || jsonb_build_object('p_total_months',0,'p_degree','master','p_id',gen_random_uuid());
  perform public.record_phd_simulator_v2_stats_batch(jsonb_build_array(jsonb_build_object('kind','activity','payload',payload)), epoch);
  if (select total_months from public.phd_simulator_v2_activity_runs where run_key=payload->>'p_run_key') is distinct from 0
    or (select jsonb_object_agg(counter_id,count) from public.phd_simulator_v2_activity_counters where counter_id like '%role_normal%') is distinct from settled_counts then
    raise exception 'Pre-enrollment month zero or legacy enrichment failed';
  end if;

  -- Doctoral settlement stores totalMonths=70 rather than the annual month.
  payload := payload || jsonb_build_object('p_id',gen_random_uuid(),'p_finalized_run_id',gen_random_uuid(),
    'p_run_key',jsonb_build_array(-floor(random()*9000000000000000),'normal')::text,
    'p_ending','phd','p_degree','phd','p_total_months',70);
  perform public.record_phd_simulator_v2_stats_batch(jsonb_build_array(jsonb_build_object('kind','activity','payload',payload)), epoch);
  if (select total_months from public.phd_simulator_v2_activity_runs where run_key=payload->>'p_run_key') is distinct from 70 then
    raise exception 'Doctoral settlement month was truncated';
  end if;
end;
$test$;
rollback;
select 'passed; settlement months fixtures rolled back' as verification;
