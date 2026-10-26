-- Reuse the existing aggregate table. No per-view records or new tables.
begin;

create or replace function public.record_phd_simulator_v2_replay_play(p_replay_id text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare result bigint;
begin
  if p_replay_id is null or p_replay_id !~ '^official-(normal|genius|social|rich|teacher-child|chosen|normal-reversed|genius-reversed|social-reversed|rich-reversed|teacher-child-reversed|chosen-reversed|rewinder|research-captain|special-dandan|special-daji|special-finite-life|special-fading-genius|cursed-frail|cursed-debt)-(phd-(0|10)|master-10)$' then
    raise exception 'Unknown official replay' using errcode = '22023';
  end if;
  insert into public.phd_simulator_v2_activity_counters as counters (counter_id, count)
    values ('phd_simulator_v2_official_replay:' || p_replay_id, 1)
    on conflict (counter_id) do update set count = counters.count + 1
    returning count into result;
  return result;
end;
$$;

create or replace function public.get_phd_simulator_v2_replay_plays()
returns jsonb language sql stable security definer set search_path = '' as $$
  with roles(id) as (values
    ('normal'), ('genius'), ('social'), ('rich'), ('teacher-child'), ('chosen'),
    ('normal-reversed'), ('genius-reversed'), ('social-reversed'), ('rich-reversed'),
    ('teacher-child-reversed'), ('chosen-reversed'), ('rewinder'), ('research-captain'),
    ('special-dandan'), ('special-daji'), ('special-finite-life'), ('special-fading-genius'),
    ('cursed-frail'), ('cursed-debt')
  ), routes(id) as (values ('phd-0'), ('phd-10'), ('master-10')),
  replays(id) as (select 'official-' || roles.id || '-' || routes.id from roles cross join routes)
  select pg_catalog.jsonb_object_agg(replays.id, coalesce(counters.count, 0))
    from replays left join public.phd_simulator_v2_activity_counters counters
      on counters.counter_id = 'phd_simulator_v2_official_replay:' || replays.id;
$$;

revoke all on function public.record_phd_simulator_v2_replay_play(text) from public;
revoke all on function public.get_phd_simulator_v2_replay_plays() from public;
grant execute on function public.record_phd_simulator_v2_replay_play(text) to anon, authenticated;
grant execute on function public.get_phd_simulator_v2_replay_plays() to anon, authenticated;

notify pgrst, 'reload schema';
commit;
