begin;

create or replace view public.phd_simulator_v2_public_messages
with (security_barrier = true)
as
select id, nickname, content, source, created_at, parent_id, is_deleted
from public.phd_simulator_v2_messages
where is_visible;

revoke all on public.phd_simulator_v2_public_messages from public, anon, authenticated;
grant select on public.phd_simulator_v2_public_messages to anon;

notify pgrst, 'reload schema';
commit;
