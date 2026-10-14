-- Apply after stats_batch and activity, including any legacy baseline import.
-- This migration is repeatable. Do not rerun the superseded activity migration.
-- If message_merge_backups still exists, archive it first and execute in the same
-- SQL session: SET phd_simulator_v2.message_backup_archived = 'true';
begin;

-- Fail before modifying anything if the backup has not been archived.
do $archive_guard$
begin
  if pg_catalog.to_regclass('community_maintenance.message_merge_backups') is not null
    and pg_catalog.current_setting('phd_simulator_v2.message_backup_archived', true) is distinct from 'true' then
    raise exception 'Archive community_maintenance.message_merge_backups before cleanup'
      using errcode = '55000';
  end if;
end;
$archive_guard$;

-- Imported baseline and newly collected counts remain logically independent.
alter table public.phd_simulator_v2_activity_counters
  add column if not exists legacy_count bigint not null default 0;
do $baseline_merge$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.phd_simulator_v2_activity_counters'::regclass
      and conname = 'phd_simulator_v2_activity_counters_legacy_nonnegative') then
    alter table public.phd_simulator_v2_activity_counters
      add constraint phd_simulator_v2_activity_counters_legacy_nonnegative check (legacy_count >= 0);
  end if;
  if pg_catalog.to_regclass('public.phd_simulator_v2_activity_legacy') is not null then
    insert into public.phd_simulator_v2_activity_counters as counters (counter_id, count, legacy_count)
      select normalized_key, 0, sum(count) from (
        select case
        when counter_id ~ '^phd_simulator_v2_role_.+_games_total$'
          then pg_catalog.regexp_replace(counter_id, '_games_total$', '_finished_total')
        when counter_id ~ '^phd_simulator_v2_games_(total|[0-9]{4}-[0-9]{2}-[0-9]{2})$'
          then pg_catalog.regexp_replace(counter_id, '^phd_simulator_v2_games_', 'phd_simulator_v2_finished_')
        else counter_id
      end as normalized_key, count
        from public.phd_simulator_v2_activity_legacy
      ) imported group by normalized_key
      on conflict (counter_id) do update set legacy_count = excluded.legacy_count;
  end if;
end;
$baseline_merge$;

-- Compact idempotency receipts. Hash the same canonical JSON used by the writer.
alter table public.phd_simulator_v2_activity_receipts
  add column if not exists payload_hash bytea,
  add column if not exists event_day date;
do $receipt_upgrade$
begin
  if exists (select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.phd_simulator_v2_activity_receipts'::regclass
      and attname = 'payload' and not attisdropped) then
    update public.phd_simulator_v2_activity_receipts
      set payload_hash = pg_catalog.sha256(pg_catalog.convert_to(payload::text, 'UTF8')),
        event_day = (payload ->> 'day')::date
      where payload_hash is null or event_day is null;
  end if;
end;
$receipt_upgrade$;
alter table public.phd_simulator_v2_activity_receipts
  alter column payload_hash set not null,
  alter column event_day set not null;
alter table public.phd_simulator_v2_activity_receipts drop column if exists payload;
do $receipt_constraints$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.phd_simulator_v2_activity_receipts'::regclass
      and conname = 'phd_simulator_v2_activity_receipts_hash_length') then
    alter table public.phd_simulator_v2_activity_receipts
      add constraint phd_simulator_v2_activity_receipts_hash_length check (pg_catalog.octet_length(payload_hash) = 32),
      add constraint phd_simulator_v2_activity_receipts_event_day check (event_day >= date '2020-01-01');
  end if;
end;
$receipt_constraints$;
create index if not exists phd_simulator_v2_activity_receipts_event_day_idx
  on public.phd_simulator_v2_activity_receipts (event_day);
-- activity_visitors already has the required (day, visitor_id) primary-key index.

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
    canonical_run := parsed_run::text;
    if pg_catalog.length(canonical_run) > 160 then
      raise exception 'Activity run key is too long' using errcode = '22023';
    end if;
  end if;
  -- Once per Beijing day: claim maintenance atomically, then prune indexed days.
  -- Stale activity is acknowledged below without recounting, so pruning cannot
  -- resurrect an old visit. Run rows remain for permanent start/finish deduplication.
  insert into public.phd_simulator_v2_activity_counters as counters (counter_id, count)
    values ('__phd_simulator_v2_activity_cleanup_day', (beijing_day - date '2020-01-01')::bigint)
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
  day_text := pg_catalog.to_char(p_day, 'YYYY-MM-DD');
  request_hash := pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.jsonb_build_object(
    'event', p_event, 'day', day_text, 'visitor', p_visitor_id, 'run', canonical_run,
    'role', p_role_id, 'ending', p_ending)::text, 'UTF8'));
  insert into public.phd_simulator_v2_activity_receipts (id, payload_hash, event_day)
    values (p_id, request_hash, p_day) on conflict (id) do nothing returning id into inserted_id;
  if inserted_id is null then
    select payload_hash into existing_hash from public.phd_simulator_v2_activity_receipts where id = p_id;
    if existing_hash is distinct from request_hash then
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
  select coalesce(pg_catalog.jsonb_object_agg(counter_id, count + legacy_count), '{}'::jsonb) into totals
    from public.phd_simulator_v2_activity_counters where counter_id = any(requested_keys);
  select pg_catalog.jsonb_object_agg(role_id, pg_catalog.jsonb_build_object(
    'games', coalesce((totals ->> (prefix || 'role_' || role_id || '_games_total'))::bigint, 0),
    'finished', coalesce((totals ->> (prefix || 'role_' || role_id || '_finished_total'))::bigint, 0),
    'clears', coalesce((totals ->> (prefix || 'role_' || role_id || '_clears_total'))::bigint, 0),
    'phd', coalesce((totals ->> (prefix || 'role_' || role_id || '_phd_total'))::bigint, 0)
  )) into roles from pg_catalog.unnest(role_ids) as role_values(role_id);
  return pg_catalog.jsonb_build_object(
    'day', day_text,
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
  where rule_version = p_rule_version and conference_name = p_conference_name
    and conference_year = p_conference_year and target = p_target;
  return result;
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
    'version', 1,
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
        where rule_version = 'v2-review-20261009'
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

-- Replaced getter no longer references the baseline table. Do not use CASCADE.
drop table if exists public.phd_simulator_v2_activity_legacy;

-- One maintenance pass immediately on deployment; counters and runs are retained.
delete from public.phd_simulator_v2_activity_receipts
  where event_day < (pg_catalog.timezone('Asia/Shanghai', pg_catalog.now()))::date - 30;
delete from public.phd_simulator_v2_activity_visitors
  where day < (pg_catalog.timezone('Asia/Shanghai', pg_catalog.now()))::date - 30;
insert into public.phd_simulator_v2_activity_counters as counters (counter_id, count)
  values ('__phd_simulator_v2_activity_cleanup_day',
    ((pg_catalog.timezone('Asia/Shanghai', pg_catalog.now()))::date - date '2020-01-01')::bigint)
  on conflict (counter_id) do update set count = greatest(counters.count, excluded.count);

-- Only this archived backup is removed. Keep the schema if anything else remains.
do $drop_archived_backup$
declare
  maintenance_schema oid;
begin
  if pg_catalog.to_regclass('community_maintenance.message_merge_backups') is not null then
    drop table community_maintenance.message_merge_backups;
  end if;
  select oid into maintenance_schema from pg_catalog.pg_namespace where nspname = 'community_maintenance';
  if maintenance_schema is not null and not exists (
    select 1 from pg_catalog.pg_depend
    where refclassid = 'pg_catalog.pg_namespace'::regclass and refobjid = maintenance_schema
  ) then
    drop schema community_maintenance;
  end if;
end;
$drop_archived_backup$;

-- Compatibility aggregate getters remain available. Single writes are internal
-- validators for the SECURITY DEFINER batch; only the batch accepts public writes.
revoke all on public.phd_simulator_v2_activity_receipts,
  public.phd_simulator_v2_activity_visitors, public.phd_simulator_v2_activity_runs,
  public.phd_simulator_v2_activity_counters from public, anon, authenticated;
revoke all on function public.record_phd_simulator_v2_activity(uuid, text, date, uuid, text, text, text),
  public.get_phd_simulator_v2_activity_stats(date),
  public.get_phd_simulator_v2_conference_stats(text, text, integer, text),
  public.get_phd_simulator_v2_stats_snapshot() from public;
revoke all on function public.record_phd_simulator_v2_activity(uuid, text, date, uuid, text, text, text),
  public.record_phd_simulator_v2_conference_review(uuid, text, text, integer, text, boolean, text, double precision),
  public.record_phd_simulator_v2_journal_acceptance(uuid, text, text, double precision, integer),
  public.record_phd_simulator_v2_thesis_review(uuid, text, text, boolean, boolean, boolean)
  from public, anon, authenticated;

-- Future old-site imports must SET the latest full baseline, never += a delta.
-- Replace imported VALUES with the exact latest rows. count (new traffic) is untouched.
-- WITH imported(counter_id, baseline) AS (VALUES ('phd_simulator_v2_pv_total', 123::bigint)),
-- normalized AS (
--   SELECT CASE
--     WHEN counter_id ~ '^phd_simulator_v2_role_.+_games_total$'
--       THEN regexp_replace(counter_id, '_games_total$', '_finished_total')
--     WHEN counter_id ~ '^phd_simulator_v2_games_(total|[0-9]{4}-[0-9]{2}-[0-9]{2})$'
--       THEN regexp_replace(counter_id, '^phd_simulator_v2_games_', 'phd_simulator_v2_finished_')
--     ELSE counter_id END AS key, baseline FROM imported
-- )
-- INSERT INTO public.phd_simulator_v2_activity_counters(counter_id, count, legacy_count)
-- SELECT key, 0, sum(baseline) FROM normalized GROUP BY key
-- ON CONFLICT(counter_id) DO UPDATE SET legacy_count = excluded.legacy_count;

notify pgrst, 'reload schema';
commit;
