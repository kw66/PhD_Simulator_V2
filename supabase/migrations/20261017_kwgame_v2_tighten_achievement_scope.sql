-- Tighten ordinary achievement statistics to the roles that can actually pursue them.
-- The game catalog is the source of truth; this idempotent migration mirrors its scopes.
begin;
update public.phd_simulator_v2_achievement_catalog
set eligible_role_ids = array[
  'normal', 'genius', 'social', 'rich', 'teacher-child', 'chosen',
  'normal-reversed', 'genius-reversed', 'social-reversed', 'rich-reversed',
  'teacher-child-reversed', 'chosen-reversed'
]::text[]
where id like 'global:%'
  and id not in (
    'global:breakthrough-ii', 'global:nature-summit', 'global:future-academician',
    'global:nobel-beginning', 'global:ten-thousand-citations',
    'global:career-apex-internet', 'global:career-apex-state',
    'global:career-apex-civil', 'global:career-apex-academic',
    'global:buff-collector', 'global:product-collector', 'global:conference-collector',
    'global:travel-collector', 'global:direction-collector', 'global:slow-research'
  );

update public.phd_simulator_v2_achievement_catalog
set eligible_role_ids = array[
  'normal', 'genius', 'social', 'rich', 'teacher-child', 'chosen',
  'rewinder', 'research-captain', 'normal-reversed', 'genius-reversed',
  'social-reversed', 'rich-reversed', 'teacher-child-reversed', 'chosen-reversed',
  'cursed-frail', 'special-finite-life', 'special-fading-genius', 'cursed-debt'
]::text[]
where id in (
  'unlock:research-captain', 'global:breakthrough-ii', 'global:nature-summit',
  'global:future-academician', 'global:nobel-beginning', 'global:ten-thousand-citations',
  'global:career-apex-internet', 'global:career-apex-state',
  'global:career-apex-civil', 'global:career-apex-academic',
  'global:buff-collector', 'global:product-collector', 'global:conference-collector',
  'global:travel-collector', 'global:direction-collector', 'global:slow-research'
);
commit;
