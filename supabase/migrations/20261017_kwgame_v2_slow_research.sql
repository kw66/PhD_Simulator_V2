-- All active roles may finish a doctorate with exactly two first-author publications.
begin;
insert into public.phd_simulator_v2_achievement_catalog (id, eligible_role_ids)
select 'global:slow-research', eligible_role_ids
from public.phd_simulator_v2_achievement_catalog
where id = 'unlock:research-captain'
on conflict (id) do update set eligible_role_ids = excluded.eligible_role_ids;
commit;
