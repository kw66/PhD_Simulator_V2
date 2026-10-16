-- Remove only the retired ordinary graduation achievements for special/curse roles.
-- Keep original run receipts unchanged for idempotent historical submissions.
begin;
delete from public.phd_simulator_v2_achievement_completions
where achievement_id ~ '^(rewinder|research-captain|special-dandan|special-daji|cursed-frail|special-finite-life|special-fading-genius|cursed-debt):ending-(master|phd)$';
delete from public.phd_simulator_v2_achievement_catalog
where id ~ '^(rewinder|research-captain|special-dandan|special-daji|cursed-frail|special-finite-life|special-fading-genius|cursed-debt):ending-(master|phd)$';
commit;
