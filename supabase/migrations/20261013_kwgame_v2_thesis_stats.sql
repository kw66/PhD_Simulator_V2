begin;

create table public.phd_simulator_v2_thesis_reviews (
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

create index phd_simulator_v2_thesis_reviews_aggregate_idx
  on public.phd_simulator_v2_thesis_reviews (rule_version, degree);

alter table public.phd_simulator_v2_thesis_reviews enable row level security;
revoke all on public.phd_simulator_v2_thesis_reviews from public, anon, authenticated;

create function public.record_phd_simulator_v2_thesis_review(
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

create function public.get_phd_simulator_v2_thesis_stats(p_rule_version text, p_degree text)
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

notify pgrst, 'reload schema';
commit;
