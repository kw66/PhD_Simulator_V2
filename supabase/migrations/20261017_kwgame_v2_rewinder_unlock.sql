-- Account milestone only: yearly inheritance remains a lobby design preview.
begin;
insert into public.phd_simulator_v2_achievement_catalog (id, eligible_role_ids)
select 'unlock:rewinder', eligible_role_ids
from public.phd_simulator_v2_achievement_catalog
where id = 'unlock:research-captain'
on conflict (id) do update set eligible_role_ids = excluded.eligible_role_ids;
commit;
