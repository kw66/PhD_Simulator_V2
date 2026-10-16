-- Register the new account milestone without changing existing completion records.
insert into public.phd_simulator_v2_achievement_catalog (id, eligible_role_ids)
values ('unlock:research-captain', array[
  'normal', 'genius', 'social', 'rich', 'teacher-child', 'chosen',
  'rewinder', 'research-captain', 'normal-reversed', 'genius-reversed',
  'social-reversed', 'rich-reversed', 'teacher-child-reversed', 'chosen-reversed',
  'special-dandan', 'special-daji', 'cursed-frail', 'special-finite-life',
  'special-fading-genius', 'cursed-debt'
])
on conflict (id) do update set eligible_role_ids = excluded.eligible_role_ids;
