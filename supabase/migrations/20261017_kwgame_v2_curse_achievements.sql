-- Completion requires formal settlement of a highest-difficulty doctoral run.
insert into public.phd_simulator_v2_achievement_catalog (id, eligible_role_ids) values
  ('cursed-frail:curse-hell-phd', array['cursed-frail']),
  ('special-fading-genius:curse-hell-phd', array['special-fading-genius']),
  ('special-finite-life:curse-hell-phd', array['special-finite-life']),
  ('cursed-debt:curse-hell-phd', array['cursed-debt'])
on conflict (id) do update set eligible_role_ids = excluded.eligible_role_ids;
