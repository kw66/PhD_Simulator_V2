-- V2 activity belongs to kwgame. Deploy after 20261013_kwgame_v2_stats_batch.sql.
-- Existing legacy counters are imported separately with exact-value upserts.
-- games always means new starts; legacy games cannot be reconstructed as starts.
begin;

create table if not exists public.phd_simulator_v2_activity_receipts (
  id uuid primary key check (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  payload jsonb not null check (pg_catalog.jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.phd_simulator_v2_activity_visitors (
  day date not null check (day >= date '2020-01-01'),
  visitor_id uuid not null,
  primary key (day, visitor_id)
);

create table if not exists public.phd_simulator_v2_activity_runs (
  run_key text primary key check (pg_catalog.length(run_key) between 1 and 160),
  role_id text not null check (role_id in ('normal', 'genius', 'social', 'rich', 'teacher-child', 'chosen', 'rewinder', 'research-captain', 'normal-reversed', 'genius-reversed', 'social-reversed', 'rich-reversed', 'teacher-child-reversed', 'chosen-reversed', 'special-dandan', 'special-daji', 'special-finite-life', 'special-fading-genius', 'cursed-frail', 'cursed-debt')),
  started_day date check (started_day >= date '2020-01-01'),
  finished_day date check (finished_day >= date '2020-01-01'),
  ending text check (ending in ('master', 'phd', 'delay', 'burnout', 'poor', 'expelled', 'isolated', 'overthinking', 'lab-bankrupt', 'quit')),
  check ((finished_day is null) = (ending is null))
);

create table if not exists public.phd_simulator_v2_activity_counters (
  counter_id text primary key,
  count bigint not null default 0 check (count >= 0)
);

create table if not exists public.phd_simulator_v2_activity_legacy (
  counter_id text primary key check (counter_id like 'phd_simulator_v2_%'),
  count bigint not null check (count >= 0)
);

-- Guard repeats against historical definitions instead of trusting IF NOT EXISTS.
create temporary table _expected_phd_simulator_v2_activity_receipts (
  id uuid primary key check (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  payload jsonb not null check (pg_catalog.jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
) on commit drop;

create temporary table _expected_phd_simulator_v2_activity_visitors (
  day date not null check (day >= date '2020-01-01'),
  visitor_id uuid not null,
  primary key (day, visitor_id)
) on commit drop;

create temporary table _expected_phd_simulator_v2_activity_runs (
  run_key text primary key check (pg_catalog.length(run_key) between 1 and 160),
  role_id text not null check (role_id in ('normal', 'genius', 'social', 'rich', 'teacher-child', 'chosen', 'rewinder', 'research-captain', 'normal-reversed', 'genius-reversed', 'social-reversed', 'rich-reversed', 'teacher-child-reversed', 'chosen-reversed', 'special-dandan', 'special-daji', 'special-finite-life', 'special-fading-genius', 'cursed-frail', 'cursed-debt')),
  started_day date check (started_day >= date '2020-01-01'),
  finished_day date check (finished_day >= date '2020-01-01'),
  ending text check (ending in ('master', 'phd', 'delay', 'burnout', 'poor', 'expelled', 'isolated', 'overthinking', 'lab-bankrupt', 'quit')),
  check ((finished_day is null) = (ending is null))
) on commit drop;

create temporary table _expected_phd_simulator_v2_activity_counters (
  counter_id text primary key,
  count bigint not null default 0 check (count >= 0)
) on commit drop;

create temporary table _expected_phd_simulator_v2_activity_legacy (
  counter_id text primary key check (counter_id like 'phd_simulator_v2_%'),
  count bigint not null check (count >= 0)
) on commit drop;

do $activity_schema$
declare
  relation_name text;
  actual_relation regclass;
  expected_relation regclass;
  actual_shape jsonb;
  expected_shape jsonb;
begin
  if pg_catalog.to_regprocedure('public.record_phd_simulator_v2_stats_batch(jsonb)') is null
    or pg_catalog.to_regprocedure('public.get_phd_simulator_v2_stats_snapshot()') is null then
    raise exception 'Deploy 20261013_kwgame_v2_stats_batch.sql before activity statistics' using errcode = '55000';
  end if;
  foreach relation_name in array array['phd_simulator_v2_activity_receipts', 'phd_simulator_v2_activity_visitors', 'phd_simulator_v2_activity_runs', 'phd_simulator_v2_activity_counters', 'phd_simulator_v2_activity_legacy'] loop
    actual_relation := pg_catalog.to_regclass('public.' || relation_name);
    expected_relation := pg_catalog.to_regclass('pg_temp._expected_' || relation_name);
    if not exists (select 1 from pg_catalog.pg_class where oid = actual_relation and relkind = 'r' and not relforcerowsecurity) then
      raise exception 'Incompatible activity table: %', relation_name using errcode = '55000';
    end if;
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attname, a.atttypid, a.atttypmod,
      a.attnotnull, a.attidentity, a.attgenerated, pg_catalog.pg_get_expr(d.adbin, d.adrelid)) order by a.attnum)
      into actual_shape from pg_catalog.pg_attribute a
      left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = actual_relation and a.attnum > 0 and not a.attisdropped;
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(a.attname, a.atttypid, a.atttypmod,
      a.attnotnull, a.attidentity, a.attgenerated, pg_catalog.pg_get_expr(d.adbin, d.adrelid)) order by a.attnum)
      into expected_shape from pg_catalog.pg_attribute a
      left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = expected_relation and a.attnum > 0 and not a.attisdropped;
    if actual_shape is distinct from expected_shape then
      raise exception 'Incompatible activity table columns: %', relation_name using errcode = '55000';
    end if;
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(contype, convalidated, pg_catalog.pg_get_constraintdef(oid))
      order by contype, pg_catalog.pg_get_constraintdef(oid)) into actual_shape
      from pg_catalog.pg_constraint where conrelid = actual_relation;
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(contype, convalidated, pg_catalog.pg_get_constraintdef(oid))
      order by contype, pg_catalog.pg_get_constraintdef(oid)) into expected_shape
      from pg_catalog.pg_constraint where conrelid = expected_relation;
    if actual_shape is distinct from expected_shape then
      raise exception 'Incompatible activity table constraints: %', relation_name using errcode = '55000';
    end if;
  end loop;
end;
$activity_schema$;

alter table public.phd_simulator_v2_activity_receipts enable row level security;
alter table public.phd_simulator_v2_activity_visitors enable row level security;
alter table public.phd_simulator_v2_activity_runs enable row level security;
alter table public.phd_simulator_v2_activity_counters enable row level security;
alter table public.phd_simulator_v2_activity_legacy enable row level security;
revoke all on public.phd_simulator_v2_activity_receipts, public.phd_simulator_v2_activity_visitors,
  public.phd_simulator_v2_activity_runs, public.phd_simulator_v2_activity_counters,
  public.phd_simulator_v2_activity_legacy from public, anon, authenticated;

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
  request_payload jsonb;
  existing_payload jsonb;
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
    or p_day > (pg_catalog.timezone('Asia/Shanghai', pg_catalog.now()))::date + 1 then
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
    canonical_run := parsed_run::text;
    if pg_catalog.length(canonical_run) > 160 then
      raise exception 'Activity run key is too long' using errcode = '22023';
    end if;
  end if;
  day_text := pg_catalog.to_char(p_day, 'YYYY-MM-DD');
  request_payload := pg_catalog.jsonb_build_object('event', p_event, 'day', day_text,
    'visitor', p_visitor_id, 'run', canonical_run, 'role', p_role_id, 'ending', p_ending);
  insert into public.phd_simulator_v2_activity_receipts (id, payload)
    values (p_id, request_payload) on conflict (id) do nothing returning id into inserted_id;
  if inserted_id is null then
    select payload into existing_payload from public.phd_simulator_v2_activity_receipts where id = p_id;
    if existing_payload is distinct from request_payload then
      raise exception 'Activity ID already belongs to another payload' using errcode = '22023';
    end if;
    return true;
  end if;

  if p_event = 'visit' then
    counter_keys := array['phd_simulator_v2_pv_total', 'phd_simulator_v2_pv_' || day_text];
    insert into public.phd_simulator_v2_activity_visitors (day, visitor_id)
      values (p_day, p_visitor_id) on conflict (day, visitor_id) do nothing returning visitor_id into inserted_visitor;
    if inserted_visitor is not null then
      counter_keys := counter_keys || array['phd_simulator_v2_uv_total', 'phd_simulator_v2_uv_' || day_text];
    end if;
  else
    insert into public.phd_simulator_v2_activity_runs (run_key, role_id)
      values (canonical_run, p_role_id) on conflict (run_key) do nothing;
    select * into run_row from public.phd_simulator_v2_activity_runs where run_key = canonical_run for update;
    if run_row.role_id is distinct from p_role_id then
      raise exception 'Activity run role mismatch' using errcode = '22023';
    end if;
    if p_event = 'start' and run_row.started_day is null then
      update public.phd_simulator_v2_activity_runs set started_day = p_day where run_key = canonical_run;
      counter_keys := array['phd_simulator_v2_games_total', 'phd_simulator_v2_games_' || day_text,
        'phd_simulator_v2_role_' || p_role_id || '_games_total'];
    elsif p_event = 'finish' and run_row.finished_day is null then
      update public.phd_simulator_v2_activity_runs set finished_day = p_day, ending = p_ending where run_key = canonical_run;
      counter_keys := array['phd_simulator_v2_role_' || p_role_id || '_finished_total'];
      if p_ending in ('master', 'phd') then
        counter_keys := counter_keys || array['phd_simulator_v2_role_' || p_role_id || '_clears_total'];
      end if;
      if p_ending = 'phd' then
        counter_keys := counter_keys || array['phd_simulator_v2_role_' || p_role_id || '_phd_total'];
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

create or replace function public.get_phd_simulator_v2_activity_stats(p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $activity_stats$
declare
  role_ids text[] := array['normal', 'genius', 'social', 'rich', 'teacher-child', 'chosen', 'rewinder', 'research-captain', 'normal-reversed', 'genius-reversed', 'social-reversed', 'rich-reversed', 'teacher-child-reversed', 'chosen-reversed', 'special-dandan', 'special-daji', 'special-finite-life', 'special-fading-genius', 'cursed-frail', 'cursed-debt'];
  prefix text := 'phd_simulator_v2_';
  day_text text;
  requested_keys text[];
  live jsonb;
  legacy jsonb;
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
  select coalesce(pg_catalog.jsonb_object_agg(counter_id, count), '{}'::jsonb) into live
    from public.phd_simulator_v2_activity_counters where counter_id = any(requested_keys);
  select coalesce(pg_catalog.jsonb_object_agg(counter_id, count), '{}'::jsonb) into legacy
    from public.phd_simulator_v2_activity_legacy where counter_id = any(requested_keys);
  select pg_catalog.jsonb_object_agg(role_id, pg_catalog.jsonb_build_object(
    'games', coalesce((live ->> (prefix || 'role_' || role_id || '_games_total'))::bigint, 0),
    'finished', coalesce((live ->> (prefix || 'role_' || role_id || '_finished_total'))::bigint, 0)
      + coalesce((legacy ->> (prefix || 'role_' || role_id || '_games_total'))::bigint, 0),
    'clears', coalesce((live ->> (prefix || 'role_' || role_id || '_clears_total'))::bigint, 0)
      + coalesce((legacy ->> (prefix || 'role_' || role_id || '_clears_total'))::bigint, 0),
    'phd', coalesce((live ->> (prefix || 'role_' || role_id || '_phd_total'))::bigint, 0)
      + coalesce((legacy ->> (prefix || 'role_' || role_id || '_phd_total'))::bigint, 0)
  )) into roles from pg_catalog.unnest(role_ids) as role_values(role_id);
  return pg_catalog.jsonb_build_object(
    'day', day_text,
    'views', coalesce((live ->> (prefix || 'pv_total'))::bigint, 0) + coalesce((legacy ->> (prefix || 'pv_total'))::bigint, 0),
    'todayViews', coalesce((live ->> (prefix || 'pv_' || day_text))::bigint, 0) + coalesce((legacy ->> (prefix || 'pv_' || day_text))::bigint, 0),
    'visitors', coalesce((live ->> (prefix || 'uv_total'))::bigint, 0) + coalesce((legacy ->> (prefix || 'uv_total'))::bigint, 0),
    'todayVisitors', coalesce((live ->> (prefix || 'uv_' || day_text))::bigint, 0) + coalesce((legacy ->> (prefix || 'uv_' || day_text))::bigint, 0),
    'games', coalesce((live ->> (prefix || 'games_total'))::bigint, 0),
    'todayGames', coalesce((live ->> (prefix || 'games_' || day_text))::bigint, 0),
    'roles', roles
  );
end;
$activity_stats$;

revoke all on function public.record_phd_simulator_v2_activity(uuid, text, date, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.get_phd_simulator_v2_activity_stats(date) from public, anon, authenticated;
grant execute on function public.record_phd_simulator_v2_activity(uuid, text, date, uuid, text, text, text)
  to anon, authenticated;
grant execute on function public.get_phd_simulator_v2_activity_stats(date) to anon, authenticated;

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
begin
  if p_records is null or pg_catalog.jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'Statistics batch must be an array' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_records) not between 1 and 50 then
    raise exception 'Statistics batch must contain 1 to 50 records' using errcode = '22023';
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
