-- Add lower-difficulty achievements without resetting historical completions.
begin;
insert into public.phd_simulator_v2_achievement_catalog (id, eligible_role_ids, active) values
  ('cursed-frail:curse-easy-phd', array['cursed-frail'], true),
  ('cursed-frail:curse-normal-phd', array['cursed-frail'], true),
  ('cursed-frail:curse-hard-phd', array['cursed-frail'], true),
  ('special-fading-genius:curse-easy-phd', array['special-fading-genius'], true),
  ('special-fading-genius:curse-normal-phd', array['special-fading-genius'], true),
  ('special-fading-genius:curse-hard-phd', array['special-fading-genius'], true),
  ('special-finite-life:curse-easy-phd', array['special-finite-life'], true),
  ('special-finite-life:curse-normal-phd', array['special-finite-life'], true),
  ('special-finite-life:curse-hard-phd', array['special-finite-life'], true),
  ('cursed-debt:curse-easy-phd', array['cursed-debt'], true),
  ('cursed-debt:curse-normal-phd', array['cursed-debt'], true),
  ('cursed-debt:curse-hard-phd', array['cursed-debt'], true)
on conflict (id) do update set eligible_role_ids = excluded.eligible_role_ids, active = true;

-- Lower-difficulty doctoral achievements are also evidence of graduation.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.get_phd_simulator_v2_activity_stats(date)'::regprocedure);
  if position(':curse-easy-phd' in definition) = 0 then
    definition := replace(definition, 'role_id || '':curse-hell-phd''', 'role_id || '':curse-hell-phd'', role_id || '':curse-easy-phd'', role_id || '':curse-normal-phd'', role_id || '':curse-hard-phd''');
    execute definition;
  end if;
end $migration$;
commit;
