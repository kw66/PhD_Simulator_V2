-- Every historical completed run necessarily started. Preserve those known
-- starts without copying rows or guessing start dates for the legacy records.
-- Only legacy finished counters contribute to starts; new finishes never do.
-- The historical per-day bucket remains on its originally recorded date.
-- Version 2 certifies that historical finished runs are included in starts.
-- Deploy this response before clients require its version in cached data.
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
  prefix text := 'phd_simulator_v2_';
  day_text text;
  requested_keys text[];
  totals jsonb;
  historical jsonb;
  roles jsonb;
begin
  if p_day is null or p_day < date '2020-01-01'
    or p_day > (pg_catalog.timezone('Asia/Shanghai', pg_catalog.now()))::date + 1 then
    raise exception 'Invalid activity statistics day' using errcode = '22023';
  end if;
  day_text := pg_catalog.to_char(p_day, 'YYYY-MM-DD');
  requested_keys := array[prefix || 'pv_total', prefix || 'pv_' || day_text, prefix || 'uv_total',
    prefix || 'uv_' || day_text, prefix || 'games_total', prefix || 'games_' || day_text,
    prefix || 'finished_total', prefix || 'finished_' || day_text];
  requested_keys := requested_keys || array(
    select prefix || 'role_' || role_id || '_' || metric || '_total'
    from pg_catalog.unnest(role_ids) as role_values(role_id)
    cross join pg_catalog.unnest(array['games', 'finished', 'clears', 'phd']) as metrics(metric)
  );
  select coalesce(pg_catalog.jsonb_object_agg(counter_id, count + legacy_count), '{}'::jsonb),
    coalesce(pg_catalog.jsonb_object_agg(counter_id, legacy_count), '{}'::jsonb)
    into totals, historical
    from public.phd_simulator_v2_activity_counters where counter_id = any(requested_keys);
  select pg_catalog.jsonb_object_agg(role_id, pg_catalog.jsonb_build_object(
    'games', coalesce((totals ->> (prefix || 'role_' || role_id || '_games_total'))::bigint, 0)
      + coalesce((historical ->> (prefix || 'role_' || role_id || '_finished_total'))::bigint, 0),
    'finished', coalesce((totals ->> (prefix || 'role_' || role_id || '_finished_total'))::bigint, 0),
    'clears', coalesce((totals ->> (prefix || 'role_' || role_id || '_clears_total'))::bigint, 0),
    'phd', coalesce((totals ->> (prefix || 'role_' || role_id || '_phd_total'))::bigint, 0)
  )) into roles from pg_catalog.unnest(role_ids) as role_values(role_id);
  return pg_catalog.jsonb_build_object(
    'version', 2,
    'day', day_text,
    'views', coalesce((totals ->> (prefix || 'pv_total'))::bigint, 0),
    'todayViews', coalesce((totals ->> (prefix || 'pv_' || day_text))::bigint, 0),
    'visitors', coalesce((totals ->> (prefix || 'uv_total'))::bigint, 0),
    'todayVisitors', coalesce((totals ->> (prefix || 'uv_' || day_text))::bigint, 0),
    'games', coalesce((totals ->> (prefix || 'games_total'))::bigint, 0)
      + coalesce((historical ->> (prefix || 'finished_total'))::bigint, 0),
    'todayGames', coalesce((totals ->> (prefix || 'games_' || day_text))::bigint, 0)
      + coalesce((historical ->> (prefix || 'finished_' || day_text))::bigint, 0),
    'roles', roles
  );
end;
$activity_stats$;

revoke all on function public.get_phd_simulator_v2_activity_stats(date) from public;
grant execute on function public.get_phd_simulator_v2_activity_stats(date) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
