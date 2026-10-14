-- Apply after the activity and cleanup migrations. No existing data is changed.
-- Deploy before the client begins handling the structured date rejection.
begin;

create or replace function public.record_phd_simulator_v2_stats_batch(p_records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $batch$
declare
  item jsonb;
  payload jsonb;
  accepted_ids jsonb := '[]'::jsonb;
  rejected_ids jsonb := '[]'::jsonb;
  beijing_day date := (pg_catalog.timezone('Asia/Shanghai', pg_catalog.now()))::date;
begin
  if p_records is null or pg_catalog.jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'Statistics batch must be an array' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_records) not between 1 and 50 then
    raise exception 'Statistics batch must contain 1 to 50 records' using errcode = '22023';
  end if;
  -- Validate clock skew before writing any rows. The client can quarantine all
  -- offending activity records in one response and retry the unchanged papers.
  -- Use the server date: a faulty client clock cannot validate itself.
  for item in select value from pg_catalog.jsonb_array_elements(p_records) loop
    payload := item -> 'payload';
    if item ->> 'kind' = 'activity'
      and pg_catalog.jsonb_typeof(payload -> 'p_day') = 'string'
      and payload ->> 'p_day' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      if (payload ->> 'p_day')::date > beijing_day + 1 then
        rejected_ids := rejected_ids || pg_catalog.jsonb_build_array(((payload ->> 'p_id')::uuid)::text);
      end if;
    end if;
  end loop;
  if pg_catalog.jsonb_array_length(rejected_ids) > 0 then
    raise exception 'Activity date is ahead of the server calendar'
      using errcode = 'PT422',
        detail = pg_catalog.jsonb_build_object('reason', 'activity-future-date', 'ids', rejected_ids)::text;
  end if;
  for item in select value from pg_catalog.jsonb_array_elements(p_records) loop
    payload := item -> 'payload';
    if pg_catalog.jsonb_typeof(item) is distinct from 'object'
      or pg_catalog.jsonb_typeof(payload) is distinct from 'object' then
      raise exception 'Invalid statistics batch record' using errcode = '22023';
    end if;
    case item ->> 'kind'
      when 'conference' then
        perform public.record_phd_simulator_v2_conference_review(
          (payload ->> 'p_id')::uuid, payload ->> 'p_rule_version', payload ->> 'p_conference_name',
          (payload ->> 'p_conference_year')::integer, payload ->> 'p_target',
          (payload ->> 'p_accepted')::boolean, payload ->> 'p_accept_type',
          (payload ->> 'p_score')::double precision
        );
      when 'journal' then
        perform public.record_phd_simulator_v2_journal_acceptance(
          (payload ->> 'p_id')::uuid, payload ->> 'p_rule_version', payload ->> 'p_journal',
          (payload ->> 'p_score')::double precision, (payload ->> 'p_months')::integer
        );
      when 'thesis' then
        perform public.record_phd_simulator_v2_thesis_review(
          (payload ->> 'p_id')::uuid, payload ->> 'p_rule_version', payload ->> 'p_degree',
          (payload ->> 'p_submitted')::boolean, (payload ->> 'p_passed')::boolean,
          (payload ->> 'p_excellent')::boolean
        );
      when 'activity' then
        if pg_catalog.jsonb_typeof(payload -> 'p_day') is distinct from 'string'
          or payload ->> 'p_day' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
          raise exception 'Invalid activity date' using errcode = '22023';
        end if;
        perform public.record_phd_simulator_v2_activity(
          (payload ->> 'p_id')::uuid, payload ->> 'p_event', (payload ->> 'p_day')::date,
          (payload ->> 'p_visitor_id')::uuid, payload ->> 'p_run_key', payload ->> 'p_role_id', payload ->> 'p_ending'
        );
      else
        raise exception 'Invalid statistics kind' using errcode = '22023';
    end case;
    -- Existing IDs are acknowledged too, so a retry after a lost response is safe.
    accepted_ids := accepted_ids || pg_catalog.jsonb_build_array(((payload ->> 'p_id')::uuid)::text);
  end loop;
  return accepted_ids;
end;
$batch$;

revoke all on function public.record_phd_simulator_v2_stats_batch(jsonb)
  from public, anon, authenticated;
grant execute on function public.record_phd_simulator_v2_stats_batch(jsonb)
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
