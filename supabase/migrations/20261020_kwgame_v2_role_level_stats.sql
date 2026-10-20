-- One browser contributes one monotonically increasing level per unlocked role.
-- No individual player identifier is exposed by the public aggregate RPC.
begin;

create table public.phd_simulator_v2_role_levels (
  data_epoch text not null check (data_epoch = '20261016-monthly-replay-v1'),
  player_id uuid not null check (player_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  role_id text not null check (role_id = any(array[
    'normal','genius','social','rich','teacher-child','chosen','rewinder','research-captain',
    'normal-reversed','genius-reversed','social-reversed','rich-reversed','teacher-child-reversed','chosen-reversed',
    'special-finite-life','special-fading-genius','cursed-frail','cursed-debt'
  ]::text[])),
  level smallint not null check (level between 0 and 10),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (data_epoch, player_id, role_id)
);

create index phd_simulator_v2_role_levels_distribution
  on public.phd_simulator_v2_role_levels(data_epoch, role_id, level);

alter table public.phd_simulator_v2_role_levels enable row level security;
revoke all on public.phd_simulator_v2_role_levels from public, anon, authenticated;

create function public.record_phd_simulator_v2_role_levels(p_player_id uuid, p_epoch text, p_levels jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $record_levels$
declare
  role_ids text[] := array[
    'normal','genius','social','rich','teacher-child','chosen','rewinder','research-captain',
    'normal-reversed','genius-reversed','social-reversed','rich-reversed','teacher-child-reversed','chosen-reversed',
    'special-finite-life','special-fading-genius','cursed-frail','cursed-debt'
  ];
  item record;
  role_count integer;
begin
  if p_epoch is distinct from '20261016-monthly-replay-v1'
    or p_player_id is null
    or p_player_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_levels is null or pg_catalog.jsonb_typeof(p_levels) is distinct from 'object' then
    raise exception 'Invalid role level snapshot' using errcode = '22023';
  end if;
  select count(*) into role_count from pg_catalog.jsonb_object_keys(p_levels);
  if role_count < 1 or role_count > pg_catalog.cardinality(role_ids) then
    raise exception 'Invalid role level count' using errcode = '22023';
  end if;
  -- Validate the full batch before writing any role.
  for item in select key, value from pg_catalog.jsonb_each(p_levels) loop
    if not (item.key = any(role_ids))
      or pg_catalog.jsonb_typeof(item.value) is distinct from 'number'
      or item.value::text !~ '^(10|[0-9])$' then
      raise exception 'Invalid role or level' using errcode = '22023';
    end if;
  end loop;

  insert into public.phd_simulator_v2_role_levels as stored (data_epoch, player_id, role_id, level)
    select p_epoch, p_player_id, key, (value::text)::smallint
    from pg_catalog.jsonb_each(p_levels)
  on conflict (data_epoch, player_id, role_id) do update
    set level = greatest(stored.level, excluded.level), updated_at = pg_catalog.now()
    where excluded.level > stored.level;
  return true;
end;
$record_levels$;

create function public.get_phd_simulator_v2_role_level_statistics()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $level_statistics$
  with roles(role_id) as (
    select pg_catalog.unnest(array[
      'normal','genius','social','rich','teacher-child','chosen','rewinder','research-captain',
      'normal-reversed','genius-reversed','social-reversed','rich-reversed','teacher-child-reversed','chosen-reversed',
      'special-finite-life','special-fading-genius','cursed-frail','cursed-debt'
    ]::text[])
  ), distribution as (
    select role_id, level, count(*)::bigint as players
    from public.phd_simulator_v2_role_levels
    where data_epoch = '20261016-monthly-replay-v1'
    group by role_id, level
  ), role_counts as (
    select r.role_id, pg_catalog.jsonb_agg(coalesce(d.players, 0) order by levels.level) as counts
    from roles r cross join pg_catalog.generate_series(0, 10) as levels(level)
    left join distribution d on d.role_id = r.role_id and d.level = levels.level
    group by r.role_id
  )
  select pg_catalog.jsonb_build_object('version', 1, 'epoch', '20261016-monthly-replay-v1',
    'roles', pg_catalog.jsonb_object_agg(role_id, pg_catalog.jsonb_build_object('counts', counts)))
  from role_counts;
$level_statistics$;

revoke all on function public.record_phd_simulator_v2_role_levels(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.get_phd_simulator_v2_role_level_statistics() from public, anon, authenticated;
grant execute on function public.record_phd_simulator_v2_role_levels(uuid, text, jsonb) to anon;
grant execute on function public.get_phd_simulator_v2_role_level_statistics() to anon;

notify pgrst, 'reload schema';
commit;
