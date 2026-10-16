begin;
insert into public.phd_simulator_v2_achievement_catalog (id, eligible_role_ids)
select 'global:study-fatigue', array_agg(distinct role_id order by role_id)
from public.phd_simulator_v2_achievement_catalog, unnest(eligible_role_ids) role_id
on conflict (id) do update set eligible_role_ids = excluded.eligible_role_ids;
commit;
