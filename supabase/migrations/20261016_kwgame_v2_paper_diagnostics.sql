-- Optional capture-time paper diagnostics travel with the existing finalization
-- batch. Historical rows and aggregate statistics remain unchanged.
begin;

alter table public.phd_simulator_v2_conference_reviews add column if not exists context jsonb;
alter table public.phd_simulator_v2_journal_acceptances add column if not exists context jsonb;

-- Never grant this validator or the context-aware overloads to public clients.
-- Extra snapshot fields are intentionally allowed, within the byte bound.
create or replace function public.validate_phd_simulator_v2_paper_context(p_context jsonb, p_score double precision)
returns void
language plpgsql
set search_path = ''
as $context$
declare
  component jsonb;
  field text;
  part text;
  value numeric;
  own_score numeric;
  collaboration_score numeric;
  total_score numeric;
  score_sum numeric := 0;
begin
  if p_context is null or p_context = 'null'::jsonb then return; end if;
  if pg_catalog.jsonb_typeof(p_context) is distinct from 'object'
    or pg_catalog.octet_length(p_context::text) > 32768 then
    raise exception 'Invalid paper diagnostic context' using errcode = '22023';
  end if;
  if p_context -> 'version' is distinct from '1'::jsonb
    or pg_catalog.jsonb_typeof(p_context -> 'roleId') is distinct from 'string'
    or p_context ->> 'roleId' not in ('normal', 'genius', 'social', 'rich', 'teacher-child', 'chosen',
      'rewinder', 'research-captain', 'normal-reversed', 'genius-reversed', 'social-reversed',
      'rich-reversed', 'teacher-child-reversed', 'chosen-reversed', 'special-dandan', 'special-daji',
      'special-finite-life', 'special-fading-genius', 'cursed-frail', 'cursed-debt')
    or pg_catalog.jsonb_typeof(p_context -> 'runKey') is distinct from 'string'
    or pg_catalog.length(p_context ->> 'runKey') not between 1 and 160
    or pg_catalog.jsonb_typeof(p_context -> 'paperId') is distinct from 'string'
    or pg_catalog.length(p_context ->> 'paperId') not between 1 and 100
    or pg_catalog.jsonb_typeof(p_context -> 'totalMonths') is distinct from 'number'
    or pg_catalog.jsonb_typeof(p_context -> 'scores') is distinct from 'object' then
    raise exception 'Invalid paper diagnostic identity' using errcode = '22023';
  end if;
  value := (p_context ->> 'totalMonths')::numeric;
  if value < 0 or value > 120 or pg_catalog.trunc(value) <> value then
    raise exception 'Invalid paper diagnostic month' using errcode = '22023';
  end if;
  foreach field in array array['idea', 'experiment', 'writing'] loop
    component := p_context -> 'scores' -> field;
    if pg_catalog.jsonb_typeof(component) is distinct from 'object' then
      raise exception 'Invalid paper diagnostic component' using errcode = '22023';
    end if;
    foreach part in array array['own', 'collaboration', 'total'] loop
      if pg_catalog.jsonb_typeof(component -> part) is distinct from 'number' then
        raise exception 'Invalid paper diagnostic score' using errcode = '22023';
      end if;
      value := (component ->> part)::numeric;
      if value < 0 or value > 1000000 or pg_catalog.trunc(value) <> value then
        raise exception 'Invalid paper diagnostic score' using errcode = '22023';
      end if;
    end loop;
    own_score := (component ->> 'own')::numeric;
    collaboration_score := (component ->> 'collaboration')::numeric;
    total_score := (component ->> 'total')::numeric;
    if own_score + collaboration_score <> total_score then
      raise exception 'Paper diagnostic component does not add up' using errcode = '22023';
    end if;
    score_sum := score_sum + total_score;
  end loop;
  if p_score is null or not (p_score >= 0 and p_score <= 1000000) then
    raise exception 'Invalid paper diagnostic total' using errcode = '22023';
  end if;
  if score_sum <> p_score::numeric then
    raise exception 'Paper diagnostic total does not match reported score' using errcode = '22023';
  end if;
end;
$context$;

create or replace function public.record_phd_simulator_v2_conference_review(
  p_id uuid, p_rule_version text, p_conference_name text, p_conference_year integer,
  p_target text, p_accepted boolean, p_accept_type text, p_score double precision, p_context jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $conference$
begin
  if p_id is null or p_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_rule_version is distinct from 'v2-review-20261009'
    or p_conference_name is null or p_conference_name !~ '^[A-Za-z0-9][A-Za-z0-9 .&()/+-]{0,63}$'
    or p_conference_year is null or p_conference_year not between 2000 and 2100
    or p_target is null or p_target not in ('A', 'B', 'C')
    or p_accepted is null or p_score is null or not (p_score >= 0 and p_score <= 1000000)
    or (p_accepted and (p_accept_type is null or p_accept_type not in ('Poster', 'Spotlight', 'Oral', 'Best Paper Candidate', 'Best Paper')))
    or (not p_accepted and p_accept_type is not null) then
    raise exception 'Invalid conference review' using errcode = '22023';
  end if;
  perform public.validate_phd_simulator_v2_paper_context(p_context, p_score);
  insert into public.phd_simulator_v2_conference_reviews
    (id, rule_version, conference_name, conference_year, target, accepted, accept_type, score, context)
    values (p_id, p_rule_version, p_conference_name, p_conference_year, p_target, p_accepted, p_accept_type,
      p_score, nullif(p_context, 'null'::jsonb)) on conflict (id) do nothing;
  return true;
end;
$conference$;

create or replace function public.record_phd_simulator_v2_journal_acceptance(
  p_id uuid, p_rule_version text, p_journal text, p_score double precision, p_months integer, p_context jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $journal$
begin
  if p_id is null or p_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_rule_version is distinct from 'v2-journal-20261012'
    or p_journal is null or p_journal not in ('nature', 'nmi', 'pami')
    or p_score is null or not (p_score >= 0 and p_score <= 1000000)
    or p_months is null or p_months not between 0 and 120 then
    raise exception 'Invalid journal acceptance' using errcode = '22023';
  end if;
  perform public.validate_phd_simulator_v2_paper_context(p_context, p_score);
  insert into public.phd_simulator_v2_journal_acceptances (id, rule_version, journal, score, months, context)
    values (p_id, p_rule_version, p_journal, p_score, p_months, nullif(p_context, 'null'::jsonb))
    on conflict (id) do nothing;
  return true;
end;
$journal$;

-- Keep existing single-record signatures and their privileges intact. Their
-- existing implementations still store NULL context; no defaulted overloads
-- are introduced, so legacy argument resolution is unambiguous.
revoke all on function public.validate_phd_simulator_v2_paper_context(jsonb, double precision),
  public.record_phd_simulator_v2_conference_review(uuid, text, text, integer, text, boolean, text, double precision, jsonb),
  public.record_phd_simulator_v2_journal_acceptance(uuid, text, text, double precision, integer, jsonb)
  from public, anon, authenticated;

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
          (payload ->> 'p_score')::double precision, payload -> 'p_context'
        );
      when 'journal' then
        perform public.record_phd_simulator_v2_journal_acceptance(
          (payload ->> 'p_id')::uuid, payload ->> 'p_rule_version', payload ->> 'p_journal',
          (payload ->> 'p_score')::double precision, (payload ->> 'p_months')::integer, payload -> 'p_context'
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
