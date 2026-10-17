-- New ordinary challenges use the same twelve-role scope as existing ordinary achievements.
begin;
insert into public.phd_simulator_v2_achievement_catalog (id, eligible_role_ids)
select challenge.id, source.eligible_role_ids
from public.phd_simulator_v2_achievement_catalog source
cross join (values
  ('global:no-first-conference-graduation'),
  ('global:advisor-spending-thousand'),
  ('global:career-rejections-six')
) as challenge(id)
where source.id = 'global:advisor-funding-user'
on conflict (id) do update set eligible_role_ids = excluded.eligible_role_ids;
commit;
