begin;

create table public.phd_simulator_v2_conference_reviews (
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

create index phd_simulator_v2_conference_reviews_aggregate_idx
  on public.phd_simulator_v2_conference_reviews (rule_version, conference_name, conference_year, target);

alter table public.phd_simulator_v2_conference_reviews enable row level security;
revoke all on public.phd_simulator_v2_conference_reviews from public, anon, authenticated;

create function public.record_phd_simulator_v2_conference_review(
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

create function public.get_phd_simulator_v2_conference_stats(
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

notify pgrst, 'reload schema';
commit;
