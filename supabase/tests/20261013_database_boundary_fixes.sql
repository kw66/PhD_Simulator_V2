-- Run after both boundary-fix migrations. All fixtures roll back; explicit
-- negative message IDs avoid advancing the production identity sequence.
begin;

do $$ begin
  if exists (select 1 from public.phd_simulator_v2_messages where id between -913004 and -913001) then
    raise exception 'Reserved verification IDs already exist';
  end if;
end $$;

insert into public.phd_simulator_v2_messages(id,nickname,content,source)
  overriding system value values(-913001,'verify','temporary root','board');
insert into public.phd_simulator_v2_messages(id,nickname,content,source,parent_id)
  overriding system value values(-913002,'verify','temporary reply','board',-913001);
update public.phd_simulator_v2_messages set is_deleted=true,content='deleted' where id=-913001;

set local role anon;
do $$ begin
  if (select count(*) from public.phd_simulator_v2_public_messages where id in (-913001,-913002)) <> 2
    or (select count(*) from public.phd_simulator_v2_messages where id in (-913001,-913002)) <> 2 then
    raise exception 'Deleted parent lost its placeholder or existing reply';
  end if;
  if has_column_privilege('anon','public.phd_simulator_v2_messages','edit_token_hash','SELECT') then
    raise exception 'Editing secret is readable';
  end if;
end $$;
reset role;

do $$ declare rejected boolean:=false; begin
  begin
    insert into public.phd_simulator_v2_messages(id,nickname,content,source,parent_id)
      overriding system value values(-913003,'verify','must reject','board',-913001);
  exception when check_violation then rejected:=true;
  end;
  if not rejected then raise exception 'Deleted parent accepted a new reply'; end if;
end $$;

update public.phd_simulator_v2_messages set is_visible=false where id=-913001;
set local role anon;
do $$ begin
  if exists (select 1 from public.phd_simulator_v2_public_messages where id in (-913001,-913002))
    or exists (select 1 from public.phd_simulator_v2_messages where id in (-913001,-913002)) then
    raise exception 'Hidden thread remains readable';
  end if;
end $$;

do $$
declare
  first_id uuid:=gen_random_uuid();
  second_id uuid:=gen_random_uuid();
  paper_id uuid:=gen_random_uuid();
  future_day text:=to_char((now() at time zone 'Asia/Shanghai')::date+2,'YYYY-MM-DD');
  before_stats jsonb:=public.get_phd_simulator_v2_stats_snapshot();
  details text;
  rejected boolean:=false;
begin
  begin
    perform public.record_phd_simulator_v2_stats_batch(jsonb_build_array(
      jsonb_build_object('kind','journal','payload',jsonb_build_object('p_id',paper_id,'p_rule_version','v2-journal-20261012','p_journal','pami','p_score',125,'p_months',3)),
      jsonb_build_object('kind','activity','payload',jsonb_build_object('p_id',first_id,'p_event','visit','p_day',future_day,'p_visitor_id',gen_random_uuid())),
      jsonb_build_object('kind','activity','payload',jsonb_build_object('p_id',second_id,'p_event','visit','p_day',future_day,'p_visitor_id',gen_random_uuid()))
    ));
  exception when sqlstate 'PT422' then
    rejected:=true;
    get stacked diagnostics details=PG_EXCEPTION_DETAIL;
  end;
  if not rejected or details::jsonb is distinct from jsonb_build_object('reason','activity-future-date','ids',jsonb_build_array(first_id,second_id)) then
    raise exception 'Future activity rejection is incomplete';
  end if;
  if public.get_phd_simulator_v2_stats_snapshot() is distinct from before_stats then
    raise exception 'Rejected batch wrote partial data';
  end if;
end $$;
reset role;
rollback;

select 'passed; all fixtures rolled back' as verification,
  (select count(*) from public.phd_simulator_v2_messages where id between -913004 and -913001) as remaining_fixtures;
