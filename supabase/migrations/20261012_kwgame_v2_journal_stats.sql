begin;

create table public.phd_simulator_v2_journal_acceptances (
  id uuid primary key check (id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  rule_version text not null check (rule_version = 'v2-journal-20261012'),
  journal text not null check (journal in ('nature', 'nmi', 'pami')),
  score double precision not null check (score >= 0 and score <= 1000000),
  months integer not null check (months between 0 and 120),
  created_at timestamptz not null default now()
);

create index phd_simulator_v2_journal_acceptances_aggregate_idx
  on public.phd_simulator_v2_journal_acceptances (rule_version, journal);

alter table public.phd_simulator_v2_journal_acceptances enable row level security;
revoke all on public.phd_simulator_v2_journal_acceptances from public, anon, authenticated;

create function public.record_phd_simulator_v2_journal_acceptance(
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

create function public.get_phd_simulator_v2_journal_stats(p_rule_version text, p_journal text)
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

notify pgrst, 'reload schema';
commit;
