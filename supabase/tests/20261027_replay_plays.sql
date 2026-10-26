begin;
create temporary table replay_test_baseline as
  select counter_id, count from public.phd_simulator_v2_activity_counters;
set local role anon;
do $$
declare before_count bigint; after_count bigint;
begin
  before_count := (public.get_phd_simulator_v2_replay_plays()->>'official-normal-phd-10')::bigint;
  after_count := public.record_phd_simulator_v2_replay_play('official-normal-phd-10');
  if after_count <> before_count + 1 then raise exception 'Increment mismatch'; end if;
  perform public.record_phd_simulator_v2_replay_play('official-genius-master-10');
  if (public.get_phd_simulator_v2_replay_plays()->>'official-normal-phd-10')::bigint <> after_count then
    raise exception 'Read mismatch';
  end if;
  begin
    perform public.record_phd_simulator_v2_replay_play('official-normal-phd-20');
    raise exception 'Retired route accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.record_phd_simulator_v2_replay_play('arbitrary-counter');
    raise exception 'Arbitrary counter accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;
reset role;
do $$
begin
  if exists (select 1 from replay_test_baseline b full join public.phd_simulator_v2_activity_counters c
    using (counter_id) where coalesce(c.counter_id, b.counter_id) not like 'phd_simulator_v2_official_replay:%'
      and b.count is distinct from c.count) then raise exception 'Unrelated counters changed'; end if;
end;
$$;
rollback;
