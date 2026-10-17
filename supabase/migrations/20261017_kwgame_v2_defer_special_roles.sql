-- Keep historical runs and schema identifiers for possible future reactivation.
-- Only the current achievement eligibility catalog follows the 18-role roster.
begin;
update public.phd_simulator_v2_achievement_catalog
set eligible_role_ids = array_remove(array_remove(eligible_role_ids, 'special-dandan'), 'special-daji')
where eligible_role_ids && array['special-dandan', 'special-daji']::text[];
commit;
