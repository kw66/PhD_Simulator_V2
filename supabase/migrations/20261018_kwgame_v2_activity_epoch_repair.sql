-- Restore the epoch-scoped activity aggregate after an activity and achievement outboxes can disagree after a lost acknowledgement.
-- The writer records under the epoch20261016 namespace; the reader reconciles
-- finalized doctorate achievements so a missing activity finish cannot show 0%.
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
  achievement_phd jsonb;
  achievement_clears jsonb;
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
  -- Achievement and activity writes use separate idempotent outboxes. If a
  -- finalized doctorate reached the achievement table but its activity finish
  -- was lost, reconcile the role aggregate from the authoritative finalized
  -- run. GREATEST keeps a later activity retry from counting the same run twice.
  select coalesce(pg_catalog.jsonb_object_agg(role_id, run_count), '{}'::jsonb)
    into achievement_phd
    from (
      select role_id, count(*)::bigint as run_count
      from public.phd_simulator_v2_achievement_runs
      where data_epoch = '20261016-monthly-replay-v1'
        and finalized_at >= timestamptz '2026-10-16T05:25:29.000Z'
        and achievement_ids && array[role_id || ':ending-phd', role_id || ':curse-hell-phd']::text[]
      group by role_id
    ) as doctoral_runs;
  select coalesce(pg_catalog.jsonb_object_agg(role_id, run_count), '{}'::jsonb)
    into achievement_clears
    from (
      select role_id, count(*)::bigint as run_count
      from public.phd_simulator_v2_achievement_runs
      where data_epoch = '20261016-monthly-replay-v1'
        and finalized_at >= timestamptz '2026-10-16T05:25:29.000Z'
        and achievement_ids && array[role_id || ':ending-master', role_id || ':ending-phd', role_id || ':curse-hell-phd']::text[]
      group by role_id
    ) as clear_runs;
  select pg_catalog.jsonb_object_agg(role_id, pg_catalog.jsonb_build_object(
    'games', greatest(
      coalesce((totals ->> (prefix || 'role_' || role_id || '_games_total'))::bigint, 0),
      coalesce((totals ->> (prefix || 'role_' || role_id || '_finished_total'))::bigint, 0),
      coalesce((achievement_phd ->> role_id)::bigint, 0)
    ),
    'finished', greatest(
      coalesce((totals ->> (prefix || 'role_' || role_id || '_finished_total'))::bigint, 0),
      coalesce((achievement_phd ->> role_id)::bigint, 0)
    ),
    'clears', greatest(
      coalesce((totals ->> (prefix || 'role_' || role_id || '_clears_total'))::bigint, 0),
      coalesce((achievement_clears ->> role_id)::bigint, 0)
    ),
    'phd', greatest(
      coalesce((totals ->> (prefix || 'role_' || role_id || '_phd_total'))::bigint, 0),
      coalesce((achievement_phd ->> role_id)::bigint, 0)
    )
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

revoke all on function public.get_phd_simulator_v2_activity_stats(date) from public, anon, authenticated;
grant execute on function public.get_phd_simulator_v2_activity_stats(date) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
