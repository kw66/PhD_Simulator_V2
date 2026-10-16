-- Production RPC boundary tests. No fixture or aggregate changes survive.
begin;
create temporary table _paper_diagnostic_test on commit drop as
select gen_random_uuid() as conference_id, gen_random_uuid() as journal_id,
  gen_random_uuid() as legacy_id, gen_random_uuid() as explicit_null_id,
  '{"version":1,"roleId":"normal","runKey":"[123456,\"normal\"]","paperId":"paper-1","totalMonths":36,
    "scores":{"idea":{"own":120,"collaboration":20,"total":140},
      "experiment":{"own":100,"collaboration":80,"total":180},
      "writing":{"own":60,"collaboration":33,"total":93}},
    "talents":{"normal-my-fate":12},"snapshot":{"research":22,"effectiveResearch":30},
    "buffs":[{"id":"audit-buff","bonus":3,"remainingMonths":2}]}'::jsonb as context;
grant select on _paper_diagnostic_test to anon;
set local role anon;

do $test$
declare
  fixture record;
  conference_payload jsonb;
  journal_payload jsonb;
  result jsonb;
  bad_context jsonb;
  malformed_contexts jsonb;
  before_stats jsonb;
  rejected boolean;
  error_detail text;
begin
  select * into fixture from pg_temp._paper_diagnostic_test;
  if has_table_privilege('anon', 'public.phd_simulator_v2_conference_reviews', 'SELECT')
    or has_table_privilege('anon', 'public.phd_simulator_v2_journal_acceptances', 'SELECT')
    or has_function_privilege('anon', 'public.validate_phd_simulator_v2_paper_context(jsonb,double precision)', 'EXECUTE')
    or has_function_privilege('anon', 'public.record_phd_simulator_v2_conference_review(uuid,text,text,integer,text,boolean,text,double precision,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.record_phd_simulator_v2_journal_acceptance(uuid,text,text,double precision,integer,jsonb)', 'EXECUTE') then
    raise exception 'Private paper diagnostics or internal validators are accessible';
  end if;
  conference_payload := jsonb_build_object('p_id',fixture.conference_id,'p_rule_version','v2-review-20261009',
    'p_conference_name','CVPR','p_conference_year',2028,'p_target','A','p_accepted',false,
    'p_accept_type',null,'p_score',413,'p_context',fixture.context);
  journal_payload := jsonb_build_object('p_id',fixture.journal_id,'p_rule_version','v2-journal-20261012',
    'p_journal','pami','p_score',413,'p_months',3,'p_context',fixture.context);
  result := public.record_phd_simulator_v2_stats_batch(jsonb_build_array(
    jsonb_build_object('kind','conference','payload',conference_payload),
    jsonb_build_object('kind','journal','payload',journal_payload),
    jsonb_build_object('kind','conference','payload',(conference_payload - 'p_context') || jsonb_build_object('p_id',fixture.legacy_id)),
    jsonb_build_object('kind','journal','payload',journal_payload || jsonb_build_object('p_id',fixture.explicit_null_id,'p_context',null))
  ));
  if result is distinct from jsonb_build_array(fixture.conference_id,fixture.journal_id,fixture.legacy_id,fixture.explicit_null_id) then
    raise exception 'Paper diagnostic batch acknowledgement was incomplete';
  end if;
  before_stats := public.get_phd_simulator_v2_stats_snapshot();
  -- A lost-response retry must preserve the first accepted metadata and score,
  -- even if the retry supplies a different valid snapshot or omits it entirely.
  perform public.record_phd_simulator_v2_stats_batch(jsonb_build_array(
    jsonb_build_object('kind','conference','payload',conference_payload || jsonb_build_object('p_context',fixture.context || '{"roleId":"genius","retry":true}'::jsonb)),
    jsonb_build_object('kind','journal','payload',journal_payload - 'p_context'),
    jsonb_build_object('kind','conference','payload',conference_payload || jsonb_build_object('p_id',fixture.legacy_id))
  ));
  if public.get_phd_simulator_v2_stats_snapshot() is distinct from before_stats then
    raise exception 'Paper diagnostic retries changed aggregate counts';
  end if;
  malformed_contexts := jsonb_build_array(
    '[]'::jsonb, 'false'::jsonb, '"text"'::jsonb, '{}'::jsonb,
    fixture.context || '{"version":2}'::jsonb,
    fixture.context || '{"version":"1"}'::jsonb,
    fixture.context || '{"roleId":null}'::jsonb,
    fixture.context || '{"roleId":"made-up"}'::jsonb,
    fixture.context || '{"roleId":5}'::jsonb,
    fixture.context || '{"runKey":""}'::jsonb,
    fixture.context || jsonb_build_object('runKey',repeat('a',161)),
    fixture.context || '{"runKey":{}}'::jsonb,
    fixture.context || '{"paperId":""}'::jsonb,
    fixture.context || jsonb_build_object('paperId',repeat('a',101)),
    fixture.context || '{"totalMonths":121}'::jsonb,
    fixture.context || '{"totalMonths":-1}'::jsonb,
    fixture.context || '{"totalMonths":0.5}'::jsonb,
    fixture.context || '{"totalMonths":"36"}'::jsonb,
    fixture.context || '{"scores":null}'::jsonb,
    jsonb_set(fixture.context,'{scores,idea}','null'::jsonb),
    jsonb_set(fixture.context,'{scores,idea,own}','"120"'::jsonb),
    jsonb_set(fixture.context,'{scores,idea,own}','null'::jsonb),
    jsonb_set(fixture.context,'{scores,idea,own}','-1'::jsonb),
    jsonb_set(fixture.context,'{scores,idea,own}','0.1'::jsonb),
    jsonb_set(fixture.context,'{scores,idea,own}','1000001'::jsonb),
    fixture.context #- '{scores,idea,collaboration}',
    jsonb_set(fixture.context,'{scores,idea,total}','139'::jsonb),
    -- Components still add up, but their sum no longer matches p_score.
    jsonb_set(jsonb_set(fixture.context,'{scores,idea,own}','121'::jsonb),'{scores,idea,total}','141'::jsonb),
    fixture.context || jsonb_build_object('padding',repeat('界',12000))
  );
  for bad_context in select value from jsonb_array_elements(malformed_contexts) loop
    rejected := false;
    begin
      -- A valid first record must be rolled back when a later one is invalid.
      perform public.record_phd_simulator_v2_stats_batch(jsonb_build_array(
        jsonb_build_object('kind','journal','payload',journal_payload || jsonb_build_object('p_id',gen_random_uuid())),
        jsonb_build_object('kind','conference','payload',conference_payload || jsonb_build_object('p_id',gen_random_uuid(),'p_context',bad_context))
      ));
    exception when invalid_parameter_value then rejected := true;
    end;
    if not rejected or public.get_phd_simulator_v2_stats_snapshot() is distinct from before_stats then
      raise exception 'Malformed diagnostic context was accepted or partially written: %',bad_context;
    end if;
  end loop;
  -- Preserve the structured future-date rejection and priority used by the
  -- client to quarantine skewed activity without losing valid queued papers.
  rejected := false;
  begin
    perform public.record_phd_simulator_v2_stats_batch(jsonb_build_array(
      jsonb_build_object('kind','conference','payload',conference_payload || jsonb_build_object('p_id',gen_random_uuid())),
      jsonb_build_object('kind','activity','payload',jsonb_build_object('p_id',gen_random_uuid(),'p_event','start',
        'p_day',(now() at time zone 'Asia/Shanghai')::date + 2,'p_run_key','[987654,"normal"]','p_role_id','normal'))
    ));
  exception when sqlstate 'PT422' then
    get stacked diagnostics error_detail = pg_exception_detail;
    rejected := (error_detail::jsonb ->> 'reason' = 'activity-future-date')
      and jsonb_array_length(error_detail::jsonb -> 'ids') = 1;
  end;
  if not rejected or public.get_phd_simulator_v2_stats_snapshot() is distinct from before_stats then
    raise exception 'Future activity handling changed or partially wrote papers';
  end if;
end;
$test$;
reset role;

do $private_assertions$
declare fixture record;
begin
  select * into fixture from pg_temp._paper_diagnostic_test;
  if (select context from public.phd_simulator_v2_conference_reviews where id=fixture.conference_id) is distinct from fixture.context
    or (select context from public.phd_simulator_v2_journal_acceptances where id=fixture.journal_id) is distinct from fixture.context then
    raise exception 'Capture-time diagnostics were missing or overwritten on retry';
  end if;
  if (select context from public.phd_simulator_v2_conference_reviews where id=fixture.legacy_id) is not null
    or (select context from public.phd_simulator_v2_journal_acceptances where id=fixture.explicit_null_id) is not null then
    raise exception 'Legacy samples acquired unrelated retry diagnostics';
  end if;
end;
$private_assertions$;
rollback;
select 'passed; paper diagnostic fixtures rolled back' as verification;
