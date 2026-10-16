-- Restart public statistics without deleting historical rows. Deploy AFTER
-- 20261016_kwgame_v2_paper_diagnostics.sql. Old clients cannot submit new rows.
-- Epochs are protocol/version boundaries, not authentication or proof of integrity.
begin;


alter table public.phd_simulator_v2_conference_reviews add column if not exists data_epoch text not null default 'legacy';

alter table public.phd_simulator_v2_journal_acceptances add column if not exists data_epoch text not null default 'legacy';

alter table public.phd_simulator_v2_thesis_reviews add column if not exists data_epoch text not null default 'legacy';

alter table public.phd_simulator_v2_activity_receipts add column if not exists data_epoch text not null default 'legacy';

alter table public.phd_simulator_v2_activity_visitors add column if not exists data_epoch text not null default 'legacy';

alter table public.phd_simulator_v2_activity_runs add column if not exists data_epoch text not null default 'legacy';

alter table public.phd_simulator_v2_achievement_runs add column if not exists data_epoch text not null default 'legacy';

alter table public.phd_simulator_v2_achievement_completions add column if not exists data_epoch text not null default 'legacy';

alter table public.phd_simulator_v2_achievement_players add column if not exists data_epoch text not null default 'legacy';


-- A returning visitor on the cutoff day must count in the new epoch as well.
alter table public.phd_simulator_v2_activity_visitors drop constraint phd_simulator_v2_activity_visitors_pkey;
alter table public.phd_simulator_v2_activity_visitors add primary key (data_epoch, day, visitor_id);
create index if not exists phd_simulator_v2_activity_visitors_day_idx on public.phd_simulator_v2_activity_visitors(day);


create or replace function public.record_phd_simulator_v2_activity(
  p_id uuid, p_event text, p_day date, p_visitor_id uuid default null,
  p_run_key text default null, p_role_id text default null, p_ending text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $activity$
declare
  request_hash bytea;
  existing_hash bytea;
  beijing_day date := (pg_catalog.timezone('Asia/Shanghai', pg_catalog.now()))::date;
  -- Keep this inclusive 30-day window aligned with the client activity outbox.
  minimum_day date := beijing_day - 30;
  cleanup_day bigint;
  canonical_run text;
  parsed_run jsonb;
  inserted_id uuid;
  inserted_visitor uuid;
  run_row public.phd_simulator_v2_activity_runs%rowtype;
  counter_keys text[] := array[]::text[];
  day_text text;
begin
  if p_id is null or p_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_event is null or p_event not in ('visit', 'start', 'finish')
    or p_day is null or p_day < date '2020-01-01'
    or p_day > beijing_day + 1 then
    raise exception 'Invalid activity record' using errcode = '22023';
  end if;
  if p_event = 'visit' then
    if p_visitor_id is null or p_run_key is not null or p_role_id is not null or p_ending is not null then
      raise exception 'Invalid visit record' using errcode = '22023';
    end if;
  else
    if p_visitor_id is not null or p_run_key is null or pg_catalog.length(p_run_key) not between 1 and 160
      or p_role_id is null or p_role_id not in ('normal', 'genius', 'social', 'rich', 'teacher-child', 'chosen', 'rewinder', 'research-captain', 'normal-reversed', 'genius-reversed', 'social-reversed', 'rich-reversed', 'teacher-child-reversed', 'chosen-reversed', 'special-dandan', 'special-daji', 'special-finite-life', 'special-fading-genius', 'cursed-frail', 'cursed-debt')
      or (p_event = 'start' and p_ending is not null)
      or (p_event = 'finish' and (p_ending is null or p_ending not in
        ('master', 'phd', 'delay', 'burnout', 'poor', 'expelled', 'isolated', 'overthinking', 'lab-bankrupt', 'quit'))) then
      raise exception 'Invalid run activity' using errcode = '22023';
    end if;
    parsed_run := p_run_key::jsonb;
    if pg_catalog.jsonb_typeof(parsed_run) is distinct from 'array' then
      raise exception 'Invalid activity run key' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_array_length(parsed_run) <> 2
      or pg_catalog.jsonb_typeof(parsed_run -> 0) is distinct from 'number'
      or pg_catalog.jsonb_typeof(parsed_run -> 1) is distinct from 'string'
      or parsed_run ->> 1 is distinct from p_role_id then
      raise exception 'Invalid activity run key' using errcode = '22023';
    end if;
    -- The first component is a random identity, not a timestamp. The public
    -- wrapper checks the epoch; receipt dates and epoch-scoped reads set the cutoff.
    canonical_run := parsed_run::text;
    if pg_catalog.length(canonical_run) > 160 then
      raise exception 'Activity run key is too long' using errcode = '22023';
    end if;
  end if;
  -- Once per Beijing day: claim maintenance atomically, then prune indexed days.
  -- Stale activity is acknowledged below without recounting, so pruning cannot
  -- resurrect an old visit. Run rows remain for permanent start/finish deduplication.
  insert into public.phd_simulator_v2_activity_counters as counters (counter_id, count)
    values ('__phd_simulator_v2_epoch20261016_cleanup_day', (beijing_day - date '2020-01-01')::bigint)
    on conflict (counter_id) do update set count = excluded.count
      where counters.count < excluded.count
    returning count into cleanup_day;
  if cleanup_day is not null then
    delete from public.phd_simulator_v2_activity_receipts where event_day < minimum_day;
    delete from public.phd_simulator_v2_activity_visitors where day < minimum_day;
  end if;
  if p_day < minimum_day then
    return true;
  end if;
  if p_day < date '2026-10-16' then raise exception 'Activity predates data epoch' using errcode = '22023'; end if;
  day_text := pg_catalog.to_char(p_day, 'YYYY-MM-DD');
  request_hash := pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'event', p_event, 'day', day_text, 'visitor', p_visitor_id, 'run', canonical_run,
    'role', p_role_id, 'ending', p_ending)::text, 'UTF8'));
  insert into public.phd_simulator_v2_activity_receipts (id, payload_hash, event_day, data_epoch)
    values (p_id, request_hash, p_day, '20261016-monthly-replay-v1') on conflict (id) do nothing returning id into inserted_id;
  if inserted_id is null then
    select payload_hash into existing_hash from public.phd_simulator_v2_activity_receipts where id = p_id;
    if existing_hash is distinct from request_hash then
      raise exception 'Activity ID already belongs to another payload' using errcode = '22023';
    end if;
    return true;
  end if;

  if p_event = 'visit' then
    counter_keys := array['phd_simulator_v2_epoch20261016_pv_total', 'phd_simulator_v2_epoch20261016_pv_' || day_text];
    insert into public.phd_simulator_v2_activity_visitors (data_epoch, day, visitor_id)
      values ('20261016-monthly-replay-v1', p_day, p_visitor_id) on conflict (data_epoch, day, visitor_id) do nothing returning visitor_id into inserted_visitor;
    if inserted_visitor is not null then
      counter_keys := counter_keys || array['phd_simulator_v2_epoch20261016_uv_total', 'phd_simulator_v2_epoch20261016_uv_' || day_text];
    end if;
  else
    insert into public.phd_simulator_v2_activity_runs (run_key, role_id, data_epoch)
      values (canonical_run, p_role_id, '20261016-monthly-replay-v1') on conflict (run_key) do nothing;
    select * into run_row from public.phd_simulator_v2_activity_runs where run_key = canonical_run for update;
    if run_row.role_id is distinct from p_role_id or run_row.data_epoch <> '20261016-monthly-replay-v1' then
      raise exception 'Activity run role mismatch' using errcode = '22023';
    end if;
    if p_event = 'start' and run_row.started_day is null then
      update public.phd_simulator_v2_activity_runs set started_day = p_day where run_key = canonical_run;
      counter_keys := array['phd_simulator_v2_epoch20261016_games_total', 'phd_simulator_v2_epoch20261016_games_' || day_text,
        'phd_simulator_v2_epoch20261016_role_' || p_role_id || '_games_total'];
    elsif p_event = 'finish' and run_row.finished_day is null then
      update public.phd_simulator_v2_activity_runs set finished_day = p_day, ending = p_ending where run_key = canonical_run;
      counter_keys := array['phd_simulator_v2_epoch20261016_role_' || p_role_id || '_finished_total'];
      if p_ending in ('master', 'phd') then
        counter_keys := counter_keys || array['phd_simulator_v2_epoch20261016_role_' || p_role_id || '_clears_total'];
      end if;
      if p_ending = 'phd' then
        counter_keys := counter_keys || array['phd_simulator_v2_epoch20261016_role_' || p_role_id || '_phd_total'];
      end if;
    elsif p_event = 'finish' and run_row.ending is distinct from p_ending then
      raise exception 'Activity run already has another ending' using errcode = '22023';
    end if;
  end if;
  -- Increment only after a newly inserted receipt/visitor/start/finish is proven.
  -- A stable key order avoids counter-row lock inversion in concurrent requests.
  insert into public.phd_simulator_v2_activity_counters as counters (counter_id, count)
    select key, 1 from pg_catalog.unnest(counter_keys) as keys(key) order by key
    on conflict (counter_id) do update set count = counters.count + excluded.count;
  return true;
end;
$activity$;

drop function public.record_phd_simulator_v2_stats_batch(jsonb);

create or replace function public.record_phd_simulator_v2_stats_batch(p_records jsonb, p_epoch text default null)
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
  if p_epoch is distinct from '20261016-monthly-replay-v1' then raise exception 'Refresh the game: statistics epoch expired' using errcode = '22023'; end if;
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
        if exists (select 1 from public.phd_simulator_v2_conference_reviews where id = (payload ->> 'p_id')::uuid and data_epoch <> '20261016-monthly-replay-v1') then raise exception 'Historical sample ID cannot be reused' using errcode = '22023'; end if;
        perform public.record_phd_simulator_v2_conference_review(
          (payload ->> 'p_id')::uuid, payload ->> 'p_rule_version', payload ->> 'p_conference_name',
          (payload ->> 'p_conference_year')::integer, payload ->> 'p_target',
          (payload ->> 'p_accepted')::boolean, payload ->> 'p_accept_type',
          (payload ->> 'p_score')::double precision, payload -> 'p_context'
        );
      when 'journal' then
        if exists (select 1 from public.phd_simulator_v2_journal_acceptances where id = (payload ->> 'p_id')::uuid and data_epoch <> '20261016-monthly-replay-v1') then raise exception 'Historical sample ID cannot be reused' using errcode = '22023'; end if;
        perform public.record_phd_simulator_v2_journal_acceptance(
          (payload ->> 'p_id')::uuid, payload ->> 'p_rule_version', payload ->> 'p_journal',
          (payload ->> 'p_score')::double precision, (payload ->> 'p_months')::integer, payload -> 'p_context'
        );
      when 'thesis' then
        if exists (select 1 from public.phd_simulator_v2_thesis_reviews where id = (payload ->> 'p_id')::uuid and data_epoch <> '20261016-monthly-replay-v1') then raise exception 'Historical sample ID cannot be reused' using errcode = '22023'; end if;
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
    if item ->> 'kind' = 'conference' then update public.phd_simulator_v2_conference_reviews set data_epoch = '20261016-monthly-replay-v1' where id = (payload ->> 'p_id')::uuid;
    elsif item ->> 'kind' = 'journal' then update public.phd_simulator_v2_journal_acceptances set data_epoch = '20261016-monthly-replay-v1' where id = (payload ->> 'p_id')::uuid;
    elsif item ->> 'kind' = 'thesis' then update public.phd_simulator_v2_thesis_reviews set data_epoch = '20261016-monthly-replay-v1' where id = (payload ->> 'p_id')::uuid; end if;
    -- Existing IDs are acknowledged too, so a retry after a lost response is safe.
    accepted_ids := accepted_ids || pg_catalog.jsonb_build_array(((payload ->> 'p_id')::uuid)::text);
  end loop;
  return accepted_ids;
end;
$batch$;

create or replace function public.get_phd_simulator_v2_conference_stats(
  p_rule_version text, p_conference_name text, p_conference_year integer, p_target text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_rule_version is distinct from 'v2-review-20261009'
    or p_conference_name is null or p_conference_name !~ '^[A-Za-z0-9][A-Za-z0-9 .&()/+-]{0,63}$'
    or p_conference_year is null or p_conference_year not between 2000 and 2100
    or p_target is null or p_target not in ('A', 'B', 'C') then
    raise exception 'Invalid conference statistics key' using errcode = '22023';
  end if;
  select pg_catalog.jsonb_build_object(
    'submissions', count(*),
    'accepted', count(*) filter (where accepted),
    'counts', pg_catalog.jsonb_build_object(
      'Poster', count(*) filter (where accept_type = 'Poster'),
      'Spotlight', count(*) filter (where accept_type = 'Spotlight'),
      'Oral', count(*) filter (where accept_type = 'Oral'),
      'Best Paper Candidate', count(*) filter (where accept_type = 'Best Paper Candidate'),
      'Best Paper', count(*) filter (where accept_type = 'Best Paper')),
    'means', pg_catalog.jsonb_build_object(
      'Reject', avg(score) filter (where not accepted),
      'Poster', avg(score) filter (where accept_type = 'Poster'),
      'Spotlight', avg(score) filter (where accept_type = 'Spotlight'),
      'Oral', avg(score) filter (where accept_type = 'Oral'),
      'Best Paper Candidate', avg(score) filter (where accept_type = 'Best Paper Candidate'),
      'Best Paper', avg(score) filter (where accept_type = 'Best Paper'))
  ) into result
  from public.phd_simulator_v2_conference_reviews
  where data_epoch = '20261016-monthly-replay-v1' and created_at >= timestamptz '2026-10-16T05:25:29.000Z' and rule_version = p_rule_version and conference_name = p_conference_name
    and conference_year = p_conference_year and target = p_target;
  return result || pg_catalog.jsonb_build_object('epoch', '20261016-monthly-replay-v1');
end;
$$;

create or replace function public.get_phd_simulator_v2_journal_stats(p_rule_version text, p_journal text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_rule_version is distinct from 'v2-journal-20261012'
    or p_journal is null or p_journal not in ('nature', 'nmi', 'pami') then
    raise exception 'Invalid journal statistics key' using errcode = '22023';
  end if;
  select pg_catalog.jsonb_build_object(
    'acceptedCount', count(*),
    'meanScore', avg(score),
    'meanMonths', avg(months)
  ) into result
  from public.phd_simulator_v2_journal_acceptances
  where data_epoch = '20261016-monthly-replay-v1' and created_at >= timestamptz '2026-10-16T05:25:29.000Z' and rule_version = p_rule_version and journal = p_journal;
  return result || pg_catalog.jsonb_build_object('epoch', '20261016-monthly-replay-v1');
end;
$$;

create or replace function public.get_phd_simulator_v2_thesis_stats(p_rule_version text, p_degree text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_rule_version is distinct from 'v2-thesis-20261013'
    or p_degree is null or p_degree not in ('master', 'phd') then
    raise exception 'Invalid thesis statistics key' using errcode = '22023';
  end if;
  select pg_catalog.jsonb_build_object(
    'submittedCount', count(*) filter (where submitted),
    'passedCount', count(*) filter (where passed),
    'excellentCount', count(*) filter (where excellent),
    'notSubmittedCount', count(*) filter (where not submitted)
  ) into result
  from public.phd_simulator_v2_thesis_reviews
  where data_epoch = '20261016-monthly-replay-v1' and created_at >= timestamptz '2026-10-16T05:25:29.000Z' and rule_version = p_rule_version and degree = p_degree;
  return result || pg_catalog.jsonb_build_object('epoch', '20261016-monthly-replay-v1');
end;
$$;

create or replace function public.get_phd_simulator_v2_stats_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $snapshot$
  select pg_catalog.jsonb_build_object(
    'version', 1, 'epoch', '20261016-monthly-replay-v1',
    'conference', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'name', conference_name, 'year', conference_year, 'target', target, 'stats', stats
      ) order by conference_name, conference_year, target), '[]'::jsonb)
      from (
        select conference_name, conference_year, target, pg_catalog.jsonb_build_object(
          'submissions', count(*),
          'accepted', count(*) filter (where accepted),
          'counts', pg_catalog.jsonb_build_object(
            'Poster', count(*) filter (where accept_type = 'Poster'),
            'Spotlight', count(*) filter (where accept_type = 'Spotlight'),
            'Oral', count(*) filter (where accept_type = 'Oral'),
            'Best Paper Candidate', count(*) filter (where accept_type = 'Best Paper Candidate'),
            'Best Paper', count(*) filter (where accept_type = 'Best Paper')),
          'means', pg_catalog.jsonb_build_object(
            'Reject', avg(score) filter (where not accepted),
            'Poster', avg(score) filter (where accept_type = 'Poster'),
            'Spotlight', avg(score) filter (where accept_type = 'Spotlight'),
            'Oral', avg(score) filter (where accept_type = 'Oral'),
            'Best Paper Candidate', avg(score) filter (where accept_type = 'Best Paper Candidate'),
            'Best Paper', avg(score) filter (where accept_type = 'Best Paper'))
        ) as stats
        from public.phd_simulator_v2_conference_reviews
        where data_epoch = '20261016-monthly-replay-v1' and created_at >= timestamptz '2026-10-16T05:25:29.000Z' and rule_version = 'v2-review-20261009'
        group by conference_name, conference_year, target
      ) conference_groups
    ),
    'journals', pg_catalog.jsonb_build_object(
      'pami', public.get_phd_simulator_v2_journal_stats('v2-journal-20261012', 'pami'),
      'nmi', public.get_phd_simulator_v2_journal_stats('v2-journal-20261012', 'nmi'),
      'nature', public.get_phd_simulator_v2_journal_stats('v2-journal-20261012', 'nature')
    ),
    'theses', pg_catalog.jsonb_build_object(
      'master', public.get_phd_simulator_v2_thesis_stats('v2-thesis-20261013', 'master'),
      'phd', public.get_phd_simulator_v2_thesis_stats('v2-thesis-20261013', 'phd')
    )
  );
$snapshot$;

create or replace function public.get_phd_simulator_v2_activity_stats(p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $activity_stats$
declare
  role_ids text[] := array['normal', 'genius', 'social', 'rich', 'teacher-child', 'chosen', 'rewinder', 'research-captain', 'normal-reversed', 'genius-reversed', 'social-reversed', 'rich-reversed', 'teacher-child-reversed', 'chosen-reversed', 'special-dandan', 'special-daji', 'special-finite-life', 'special-fading-genius', 'cursed-frail', 'cursed-debt'];
  prefix text := 'phd_simulator_v2_epoch20261016_';
  day_text text;
  requested_keys text[];
  totals jsonb;
  roles jsonb;
begin
  if p_day is null or p_day < date '2020-01-01'
    or p_day > (pg_catalog.timezone('Asia/Shanghai', pg_catalog.now()))::date + 1 then
    raise exception 'Invalid activity statistics day' using errcode = '22023';
  end if;
  day_text := pg_catalog.to_char(p_day, 'YYYY-MM-DD');
  requested_keys := array[prefix || 'pv_total', prefix || 'pv_' || day_text, prefix || 'uv_total',
    prefix || 'uv_' || day_text, prefix || 'games_total', prefix || 'games_' || day_text];
  requested_keys := requested_keys || array(
    select prefix || 'role_' || role_id || '_' || metric || '_total'
    from pg_catalog.unnest(role_ids) as role_values(role_id)
    cross join pg_catalog.unnest(array['games', 'finished', 'clears', 'phd']) as metrics(metric)
  );
  select coalesce(pg_catalog.jsonb_object_agg(counter_id, count), '{}'::jsonb) into totals
    from public.phd_simulator_v2_activity_counters where counter_id = any(requested_keys);
  select pg_catalog.jsonb_object_agg(role_id, pg_catalog.jsonb_build_object(
    'games', coalesce((totals ->> (prefix || 'role_' || role_id || '_games_total'))::bigint, 0),
    'finished', coalesce((totals ->> (prefix || 'role_' || role_id || '_finished_total'))::bigint, 0),
    'clears', coalesce((totals ->> (prefix || 'role_' || role_id || '_clears_total'))::bigint, 0),
    'phd', coalesce((totals ->> (prefix || 'role_' || role_id || '_phd_total'))::bigint, 0)
  )) into roles from pg_catalog.unnest(role_ids) as role_values(role_id);
  return pg_catalog.jsonb_build_object(
    'version', 2, 'epoch', '20261016-monthly-replay-v1', 'day', day_text,
    'views', coalesce((totals ->> (prefix || 'pv_total'))::bigint, 0),
    'todayViews', coalesce((totals ->> (prefix || 'pv_' || day_text))::bigint, 0),
    'visitors', coalesce((totals ->> (prefix || 'uv_total'))::bigint, 0),
    'todayVisitors', coalesce((totals ->> (prefix || 'uv_' || day_text))::bigint, 0),
    'games', coalesce((totals ->> (prefix || 'games_total'))::bigint, 0),
    'todayGames', coalesce((totals ->> (prefix || 'games_' || day_text))::bigint, 0),
    'roles', roles
  );
end;
$activity_stats$;

drop function public.record_phd_simulator_v2_achievement_start(uuid);

create or replace function public.record_phd_simulator_v2_achievement_start(p_player_id uuid, p_epoch text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_epoch is distinct from '20261016-monthly-replay-v1' then raise exception 'Refresh the game: achievement epoch expired' using errcode = '22023'; end if;
  if p_player_id is null
    or p_player_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Invalid achievement player' using errcode = '22023';
  end if;
  insert into public.phd_simulator_v2_achievement_players (player_id, data_epoch)
    values (p_player_id, '20261016-monthly-replay-v1') on conflict (player_id) do update set data_epoch = excluded.data_epoch, first_recorded_at = pg_catalog.now() where public.phd_simulator_v2_achievement_players.data_epoch <> excluded.data_epoch;
  return true;
end;
$$;

create or replace function public.ensure_phd_simulator_v2_achievement_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.data_epoch = '20261016-monthly-replay-v1' then perform public.record_phd_simulator_v2_achievement_start(new.player_id, new.data_epoch); end if;
  return new;
end;
$$;

drop function public.record_phd_simulator_v2_achievement_run(uuid, uuid, text, text[]);

create or replace function public.record_phd_simulator_v2_achievement_run(
  p_player_id uuid, p_run_id uuid, p_role_id text, p_achievement_ids text[], p_epoch text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_ids text[];
  existing_run public.phd_simulator_v2_achievement_runs%rowtype;
  inserted_id uuid;
begin
  if p_epoch is distinct from '20261016-monthly-replay-v1' then raise exception 'Refresh the game: achievement epoch expired' using errcode = '22023'; end if;
  if p_player_id is null or p_run_id is null
    or p_player_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_run_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_role_id is null
    or not exists (select 1 from public.phd_simulator_v2_achievement_catalog c where p_role_id = any(c.eligible_role_ids))
    or p_achievement_ids is null
    or cardinality(p_achievement_ids) > 512
    or exists (select 1 from pg_catalog.unnest(p_achievement_ids) a(id) where a.id is null) then
    raise exception 'Invalid achievement run' using errcode = '22023';
  end if;

  select coalesce(pg_catalog.array_agg(a.id order by a.id), '{}'::text[])
    into normalized_ids from (select distinct pg_catalog.unnest(p_achievement_ids) as id) a;
  if exists (
    select 1 from pg_catalog.unnest(normalized_ids) a(id)
    where not exists (select 1 from public.phd_simulator_v2_achievement_catalog c
      where c.id = a.id and p_role_id = any(c.eligible_role_ids))
  ) then
    raise exception 'Unknown achievement or ineligible role' using errcode = '22023';
  end if;

  insert into public.phd_simulator_v2_achievement_runs (id, player_id, role_id, achievement_ids, data_epoch)
    values (p_run_id, p_player_id, p_role_id, normalized_ids, '20261016-monthly-replay-v1')
    on conflict (id) do nothing returning id into inserted_id;
  if inserted_id is null then
    select * into existing_run from public.phd_simulator_v2_achievement_runs where id = p_run_id for update;
    if existing_run.data_epoch <> '20261016-monthly-replay-v1' or existing_run.player_id is distinct from p_player_id
      or existing_run.role_id is distinct from p_role_id
      or existing_run.achievement_ids is distinct from normalized_ids then
      raise exception 'Finalized achievement run cannot be changed' using errcode = '22023';
    end if;
    return true;
  end if;

  insert into public.phd_simulator_v2_achievement_completions (player_id, achievement_id, role_id, data_epoch)
    select p_player_id, a.id, p_role_id, '20261016-monthly-replay-v1' from pg_catalog.unnest(normalized_ids) a(id)
    on conflict (player_id, achievement_id, role_id) do update set data_epoch = excluded.data_epoch, completed_at = pg_catalog.now() where public.phd_simulator_v2_achievement_completions.data_epoch <> excluded.data_epoch;
  return true;
end;
$$;

create or replace function public.get_phd_simulator_v2_achievement_stats_v2()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with started as (
    select count(*) as players from public.phd_simulator_v2_achievement_players where data_epoch = '20261016-monthly-replay-v1' and first_recorded_at >= timestamptz '2026-10-16T05:25:29.000Z'
  ), valid_completions as (
    select a.player_id, a.achievement_id
    from public.phd_simulator_v2_achievement_completions a
    join public.phd_simulator_v2_achievement_catalog c on c.id = a.achievement_id
      and a.role_id = any(c.eligible_role_ids)
    where a.data_epoch = '20261016-monthly-replay-v1' and a.completed_at >= timestamptz '2026-10-16T05:25:29.000Z'
      and exists (select 1 from public.phd_simulator_v2_achievement_players p where p.player_id = a.player_id and p.data_epoch = '20261016-monthly-replay-v1' and p.first_recorded_at >= timestamptz '2026-10-16T05:25:29.000Z')
  ), achieved as (
    select achievement_id, count(distinct player_id) as players
    from valid_completions group by achievement_id
  ), display_rows as (
    select c.id, coalesce(a.players, 0) as players
    from public.phd_simulator_v2_achievement_catalog c
    left join achieved a on a.achievement_id = c.id
  )
  select pg_catalog.jsonb_build_object('version', 2, 'epoch', '20261016-monthly-replay-v1', 'achievements',
    coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', d.id, 'achievedPlayers', d.players, 'eligiblePlayers', s.players
    ) order by d.id), '[]'::jsonb))
  from display_rows d cross join started s;
$$;

-- Retire the old denominator response without exposing historical counts.
create or replace function public.get_phd_simulator_v2_achievement_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  select public.get_phd_simulator_v2_achievement_stats_v2();
$$;


-- Only versioned wrappers accept public writes. Helpers and direct tables
-- remain inaccessible, including old diagnostics overloads.
revoke all on function public.record_phd_simulator_v2_activity(uuid, text, date, uuid, text, text, text),
  public.record_phd_simulator_v2_conference_review(uuid, text, text, integer, text, boolean, text, double precision),
  public.record_phd_simulator_v2_conference_review(uuid, text, text, integer, text, boolean, text, double precision, jsonb),
  public.record_phd_simulator_v2_journal_acceptance(uuid, text, text, double precision, integer),
  public.record_phd_simulator_v2_journal_acceptance(uuid, text, text, double precision, integer, jsonb),
  public.record_phd_simulator_v2_thesis_review(uuid, text, text, boolean, boolean, boolean),
  public.ensure_phd_simulator_v2_achievement_player()
  from public, anon, authenticated;
revoke all on function public.record_phd_simulator_v2_stats_batch(jsonb, text),
  public.record_phd_simulator_v2_achievement_start(uuid, text),
  public.record_phd_simulator_v2_achievement_run(uuid, uuid, text, text[], text)
  from public, anon, authenticated;
grant execute on function public.record_phd_simulator_v2_stats_batch(jsonb, text),
  public.record_phd_simulator_v2_achievement_start(uuid, text),
  public.record_phd_simulator_v2_achievement_run(uuid, uuid, text, text[], text)
  to anon, authenticated;
notify pgrst, 'reload schema';
commit;

