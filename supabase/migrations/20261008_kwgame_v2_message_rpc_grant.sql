begin;

grant execute on function public.edit_phd_simulator_v2_message(bigint, text, text, text) to anon;
notify pgrst, 'reload schema';

commit;
