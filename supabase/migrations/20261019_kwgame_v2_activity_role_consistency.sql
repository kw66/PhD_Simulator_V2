-- A finalized achievement run proves that a game started and ended, including
-- master graduations and failed runs whose activity outbox never arrived.
-- Reconcile lower bounds in order: phd <= clears <= finished <= games.
begin;

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
  role_games bigint;
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

  -- Activity and achievement outboxes have different run identities. They
  -- cannot be safely joined or added. GREATEST preserves the known lower
  -- bound and does not double-count a later retry from the other outbox.
  with achievement_evidence as (
    select role_id, count(*)::bigint as finished,
      count(*) filter (where achievement_ids && array[
        role_id || ':ending-master', role_id || ':ending-phd', role_id || ':curse-hell-phd'
      ]::text[])::bigint as clears,
      count(*) filter (where achievement_ids && array[
        role_id || ':ending-phd', role_id || ':curse-hell-phd'
      ]::text[])::bigint as phd
    from public.phd_simulator_v2_achievement_runs
    where data_epoch = '20261016-monthly-replay-v1'
      and finalized_at >= timestamptz '2026-10-16T05:25:29.000Z'
    group by role_id
  ), role_evidence as (
    select r.role_id,
      coalesce((totals ->> (prefix || 'role_' || r.role_id || '_games_total'))::bigint, 0) as activity_games,
      greatest(coalesce((totals ->> (prefix || 'role_' || r.role_id || '_finished_total'))::bigint, 0),
        coalesce(a.finished, 0)) as proven_finished,
      greatest(coalesce((totals ->> (prefix || 'role_' || r.role_id || '_clears_total'))::bigint, 0),
        coalesce(a.clears, 0)) as proven_clears,
      greatest(coalesce((totals ->> (prefix || 'role_' || r.role_id || '_phd_total'))::bigint, 0),
        coalesce(a.phd, 0)) as phd
    from pg_catalog.unnest(role_ids) as r(role_id)
    left join achievement_evidence a on a.role_id = r.role_id
  ), clear_counts as (
    select *, greatest(proven_clears, phd) as clears from role_evidence
  ), finished_counts as (
    select *, greatest(proven_finished, clears) as finished from clear_counts
  ), game_counts as (
    select *, greatest(activity_games, finished) as games from finished_counts
  )
  select pg_catalog.jsonb_object_agg(role_id, pg_catalog.jsonb_build_object(
    'games', games, 'finished', finished, 'clears', clears, 'phd', phd
  )), coalesce(sum(games), 0)::bigint into roles, role_games from game_counts;

  return pg_catalog.jsonb_build_object(
    'version', 2, 'epoch', '20261016-monthly-replay-v1', 'day', day_text,
    'views', coalesce((totals ->> (prefix || 'pv_total'))::bigint, 0),
    'todayViews', coalesce((totals ->> (prefix || 'pv_' || day_text))::bigint, 0),
    'visitors', coalesce((totals ->> (prefix || 'uv_total'))::bigint, 0),
    'todayVisitors', coalesce((totals ->> (prefix || 'uv_' || day_text))::bigint, 0),
    'games', greatest(coalesce((totals ->> (prefix || 'games_total'))::bigint, 0), role_games),
    -- Finalization proves a start, but not its date; daily starts stay unchanged.
    'todayGames', coalesce((totals ->> (prefix || 'games_' || day_text))::bigint, 0),
    'roles', roles
  );
end;
$activity_stats$;

revoke all on function public.get_phd_simulator_v2_activity_stats(date) from public, anon, authenticated;
grant execute on function public.get_phd_simulator_v2_activity_stats(date) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
