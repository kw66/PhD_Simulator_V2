-- Standalone, repeatable installation of the V2 statistics tables and RPCs.
-- Existing rows are retained; incompatible table definitions abort the transaction.
-- This migration does not access message, visit, or any other game tables.
begin;

create temporary table _phd_v2_expected_conference_reviews (
  id uuid primary key check (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  rule_version text not null check (rule_version = 'v2-review-20261009'),
  conference_name text not null check (conference_name ~ '^[A-Za-z0-9][A-Za-z0-9 .&()/+-]{0,63}$'),
  conference_year integer not null check (conference_year between 2000 and 2100),
  target text not null check (target in ('A', 'B', 'C')),
  accepted boolean not null,
  accept_type text,
  score double precision not null check (score >= 0 and score <= 1000000),
  created_at timestamptz not null default now(),
  check ((accepted and accept_type is not null and accept_type in ('Poster', 'Spotlight', 'Oral', 'Best Paper Candidate', 'Best Paper'))
    or (not accepted and accept_type is null))
) on commit drop;

create temporary table _phd_v2_expected_journal_acceptances (
  id uuid primary key check (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  rule_version text not null check (rule_version = 'v2-journal-20261012'),
  journal text not null check (journal in ('nature', 'nmi', 'pami')),
  score double precision not null check (score >= 0 and score <= 1000000),
  months integer not null check (months between 0 and 120),
  created_at timestamptz not null default now()
) on commit drop;

create temporary table _phd_v2_expected_thesis_reviews (
  id uuid primary key check (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  rule_version text not null check (rule_version = 'v2-thesis-20261013'),
  degree text not null check (degree in ('master', 'phd')),
  submitted boolean not null,
  passed boolean not null,
  excellent boolean not null,
  created_at timestamptz not null default now(),
  check (not passed or submitted),
  check (not excellent or passed)
) on commit drop;

create table if not exists public.phd_simulator_v2_conference_reviews (
  id uuid primary key check (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  rule_version text not null check (rule_version = 'v2-review-20261009'),
  conference_name text not null check (conference_name ~ '^[A-Za-z0-9][A-Za-z0-9 .&()/+-]{0,63}$'),
  conference_year integer not null check (conference_year between 2000 and 2100),
  target text not null check (target in ('A', 'B', 'C')),
  accepted boolean not null,
  accept_type text,
  score double precision not null check (score >= 0 and score <= 1000000),
  created_at timestamptz not null default now(),
  check ((accepted and accept_type is not null and accept_type in ('Poster', 'Spotlight', 'Oral', 'Best Paper Candidate', 'Best Paper'))
    or (not accepted and accept_type is null))
);

create table if not exists public.phd_simulator_v2_journal_acceptances (
  id uuid primary key check (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  rule_version text not null check (rule_version = 'v2-journal-20261012'),
  journal text not null check (journal in ('nature', 'nmi', 'pami')),
  score double precision not null check (score >= 0 and score <= 1000000),
  months integer not null check (months between 0 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.phd_simulator_v2_thesis_reviews (
  id uuid primary key check (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  rule_version text not null check (rule_version = 'v2-thesis-20261013'),
  degree text not null check (degree in ('master', 'phd')),
  submitted boolean not null,
  passed boolean not null,
  excellent boolean not null,
  created_at timestamptz not null default now(),
  check (not passed or submitted),
  check (not excellent or passed)
);

-- Compare the complete original columns and constraints before replacing any RPC.
-- IF NOT EXISTS alone would silently accept an incompatible historical table.
do $schema_guard$
declare
  relation_name text;
  actual_relation regclass;
  expected_relation regclass;
  actual_shape jsonb;
  expected_shape jsonb;
begin
  foreach relation_name in array array['conference_reviews', 'journal_acceptances', 'thesis_reviews'] loop
    actual_relation := pg_catalog.to_regclass('public.phd_simulator_v2_' || relation_name);
    expected_relation := pg_catalog.to_regclass('pg_temp._phd_v2_expected_' || relation_name);
    if not exists (
      select 1 from pg_catalog.pg_class where oid = actual_relation and relkind = 'r' and not relforcerowsecurity
    ) then
      raise exception 'Incompatible statistics table: %', actual_relation using errcode = '55000';
    end if;
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
      a.attname, a.atttypid, a.atttypmod, a.attnotnull, a.attidentity, a.attgenerated,
      pg_catalog.pg_get_expr(d.adbin, d.adrelid)
    ) order by a.attnum) into actual_shape
      from pg_catalog.pg_attribute a
      left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = actual_relation and a.attnum > 0 and not a.attisdropped;
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
      a.attname, a.atttypid, a.atttypmod, a.attnotnull, a.attidentity, a.attgenerated,
      pg_catalog.pg_get_expr(d.adbin, d.adrelid)
    ) order by a.attnum) into expected_shape
      from pg_catalog.pg_attribute a
      left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = expected_relation and a.attnum > 0 and not a.attisdropped;
    if actual_shape is distinct from expected_shape then
      raise exception 'Incompatible columns on statistics table: %', actual_relation using errcode = '55000';
    end if;
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
      contype, convalidated, pg_catalog.pg_get_constraintdef(oid)
    ) order by contype, pg_catalog.pg_get_constraintdef(oid)) into actual_shape
      from pg_catalog.pg_constraint where conrelid = actual_relation;
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
      contype, convalidated, pg_catalog.pg_get_constraintdef(oid)
    ) order by contype, pg_catalog.pg_get_constraintdef(oid)) into expected_shape
      from pg_catalog.pg_constraint where conrelid = expected_relation;
    if actual_shape is distinct from expected_shape then
      raise exception 'Incompatible constraints on statistics table: %', actual_relation using errcode = '55000';
    end if;
  end loop;
end;
$schema_guard$;

create index if not exists phd_simulator_v2_conference_reviews_aggregate_idx
  on public.phd_simulator_v2_conference_reviews (rule_version, conference_name, conference_year, target);

alter table public.phd_simulator_v2_conference_reviews enable row level security;
revoke all on public.phd_simulator_v2_conference_reviews from public, anon, authenticated;

create or replace function public.record_phd_simulator_v2_conference_review(
  p_id uuid, p_rule_version text, p_conference_name text, p_conference_year integer,
  p_target text, p_accepted boolean, p_accept_type text, p_score double precision
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
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
  insert into public.phd_simulator_v2_conference_reviews
    (id, rule_version, conference_name, conference_year, target, accepted, accept_type, score)
    values (p_id, p_rule_version, p_conference_name, p_conference_year, p_target, p_accepted, p_accept_type, p_score)
    on conflict (id) do nothing;
  return true;
end;
$$;

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
    'acceptedMeanScore', avg(score) filter (where accepted),
    'rejectedMeanScore', avg(score) filter (where not accepted),
    'means', pg_catalog.jsonb_build_object(
      'Reject', avg(score) filter (where not accepted),
      'Poster', avg(score) filter (where accept_type = 'Poster'),
      'Spotlight', avg(score) filter (where accept_type = 'Spotlight'),
      'Oral', avg(score) filter (where accept_type = 'Oral'),
      'Best Paper Candidate', avg(score) filter (where accept_type = 'Best Paper Candidate'),
      'Best Paper', avg(score) filter (where accept_type = 'Best Paper')),
    'p90', percentile_cont(0.9) within group (order by score),
    'p99', percentile_cont(0.99) within group (order by score),
    'updatedAt', max(created_at)
  ) into result
  from public.phd_simulator_v2_conference_reviews
  where rule_version = p_rule_version and conference_name = p_conference_name
    and conference_year = p_conference_year and target = p_target;
  return result;
end;
$$;

revoke all on function public.record_phd_simulator_v2_conference_review(uuid, text, text, integer, text, boolean, text, double precision)
  from public, anon, authenticated;
revoke all on function public.get_phd_simulator_v2_conference_stats(text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.record_phd_simulator_v2_conference_review(uuid, text, text, integer, text, boolean, text, double precision)
  to anon, authenticated;
grant execute on function public.get_phd_simulator_v2_conference_stats(text, text, integer, text)
  to anon, authenticated;


create index if not exists phd_simulator_v2_journal_acceptances_aggregate_idx
  on public.phd_simulator_v2_journal_acceptances (rule_version, journal);

alter table public.phd_simulator_v2_journal_acceptances enable row level security;
revoke all on public.phd_simulator_v2_journal_acceptances from public, anon, authenticated;

create or replace function public.record_phd_simulator_v2_journal_acceptance(
  p_id uuid, p_rule_version text, p_journal text, p_score double precision, p_months integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_id is null or p_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_rule_version is distinct from 'v2-journal-20261012'
    or p_journal is null or p_journal not in ('nature', 'nmi', 'pami')
    or p_score is null or not (p_score >= 0 and p_score <= 1000000)
    or p_months is null or p_months not between 0 and 120 then
    raise exception 'Invalid journal acceptance' using errcode = '22023';
  end if;
  insert into public.phd_simulator_v2_journal_acceptances (id, rule_version, journal, score, months)
    values (p_id, p_rule_version, p_journal, p_score, p_months)
    on conflict (id) do nothing;
  return true;
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
  where rule_version = p_rule_version and journal = p_journal;
  return result;
end;
$$;

revoke all on function public.record_phd_simulator_v2_journal_acceptance(uuid, text, text, double precision, integer)
  from public, anon, authenticated;
revoke all on function public.get_phd_simulator_v2_journal_stats(text, text)
  from public, anon, authenticated;
grant execute on function public.record_phd_simulator_v2_journal_acceptance(uuid, text, text, double precision, integer)
  to anon, authenticated;
grant execute on function public.get_phd_simulator_v2_journal_stats(text, text)
  to anon, authenticated;


create index if not exists phd_simulator_v2_thesis_reviews_aggregate_idx
  on public.phd_simulator_v2_thesis_reviews (rule_version, degree);

alter table public.phd_simulator_v2_thesis_reviews enable row level security;
revoke all on public.phd_simulator_v2_thesis_reviews from public, anon, authenticated;

create or replace function public.record_phd_simulator_v2_thesis_review(
  p_id uuid, p_rule_version text, p_degree text, p_submitted boolean, p_passed boolean, p_excellent boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_id is null or p_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_rule_version is distinct from 'v2-thesis-20261013'
    or p_degree is null or p_degree not in ('master', 'phd')
    or p_submitted is null or p_passed is null or p_excellent is null
    or (p_passed and not p_submitted) or (p_excellent and not p_passed) then
    raise exception 'Invalid thesis review' using errcode = '22023';
  end if;
  insert into public.phd_simulator_v2_thesis_reviews (id, rule_version, degree, submitted, passed, excellent)
    values (p_id, p_rule_version, p_degree, p_submitted, p_passed, p_excellent)
    on conflict (id) do nothing;
  return true;
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
  where rule_version = p_rule_version and degree = p_degree;
  return result;
end;
$$;

revoke all on function public.record_phd_simulator_v2_thesis_review(uuid, text, text, boolean, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.get_phd_simulator_v2_thesis_stats(text, text)
  from public, anon, authenticated;
grant execute on function public.record_phd_simulator_v2_thesis_review(uuid, text, text, boolean, boolean, boolean)
  to anon, authenticated;
grant execute on function public.get_phd_simulator_v2_thesis_stats(text, text)
  to anon, authenticated;


-- A same-named legacy index must actually support this aggregation key.
do $index_guard$
declare
  relation_name text;
  expected_columns text[];
begin
  foreach relation_name in array array['conference_reviews', 'journal_acceptances', 'thesis_reviews'] loop
    expected_columns := case relation_name
      when 'conference_reviews' then array['rule_version', 'conference_name', 'conference_year', 'target']
      when 'journal_acceptances' then array['rule_version', 'journal']
      else array['rule_version', 'degree']
    end;
    if not exists (
      select 1 from pg_catalog.pg_index i
      join pg_catalog.pg_class c on c.oid = i.indexrelid
      join pg_catalog.pg_am am on am.oid = c.relam
      where i.indexrelid = pg_catalog.to_regclass('public.phd_simulator_v2_' || relation_name || '_aggregate_idx')
        and i.indrelid = pg_catalog.to_regclass('public.phd_simulator_v2_' || relation_name)
        and i.indisvalid and i.indisready and not i.indisunique
        and i.indpred is null and i.indexprs is null and am.amname = 'btree'
        and i.indnatts = pg_catalog.cardinality(expected_columns)
        and i.indnkeyatts = pg_catalog.cardinality(expected_columns)
        and (select pg_catalog.array_agg(a.attname::text order by k.ordinality)
          from pg_catalog.unnest(i.indkey::smallint[]) with ordinality as k(attnum, ordinality)
          join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
        ) = expected_columns
    ) then
      raise exception 'Incompatible statistics aggregate index on: %', relation_name using errcode = '55000';
    end if;
  end loop;
end;
$index_guard$;

-- A batch is one transaction: malformed records reject the entire request.
-- The existing single-record RPCs remain the sole payload validators.
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

-- One immutable client snapshot per run. Conference groups are aggregated in a
-- single scan; an absent conference group means zero submissions, not a failure.
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
          'acceptedMeanScore', avg(score) filter (where accepted),
          'rejectedMeanScore', avg(score) filter (where not accepted),
          'means', pg_catalog.jsonb_build_object(
            'Reject', avg(score) filter (where not accepted),
            'Poster', avg(score) filter (where accept_type = 'Poster'),
            'Spotlight', avg(score) filter (where accept_type = 'Spotlight'),
            'Oral', avg(score) filter (where accept_type = 'Oral'),
            'Best Paper Candidate', avg(score) filter (where accept_type = 'Best Paper Candidate'),
            'Best Paper', avg(score) filter (where accept_type = 'Best Paper')),
          'p90', percentile_cont(0.9) within group (order by score),
          'p99', percentile_cont(0.99) within group (order by score),
          'updatedAt', max(created_at)
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

revoke all on function public.get_phd_simulator_v2_stats_snapshot()
  from public, anon, authenticated;
grant execute on function public.get_phd_simulator_v2_stats_snapshot()
  to anon, authenticated;

notify pgrst, 'reload schema';
commit;
