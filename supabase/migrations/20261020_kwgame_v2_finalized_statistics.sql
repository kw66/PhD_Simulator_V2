-- Link statistics to the account finalization UUID used by achievement_runs.
-- Legacy rows stay unlinked: their random run keys cannot be safely guessed.
-- The browser also splits uploads by UTF-8 byte size; without that fix long
-- successful runs exceeded Fetch keepalive's 64 KiB limit before reaching SQL.
begin;

create table if not exists public.phd_simulator_v2_finalized_statistics (
  data_epoch text not null,
  finalized_run_id uuid not null,
  kind text not null check (kind in ('conference', 'journal', 'thesis', 'activity')),
  fingerprint text not null check (length(fingerprint) between 1 and 1024),
  run_key text not null check (length(run_key) between 1 and 160),
  role_id text not null,
  payload_id uuid not null,
  payload_hash bytea not null,
  recorded_at timestamptz not null default now(),
  primary key (data_epoch, finalized_run_id, kind, fingerprint),
  unique (data_epoch, kind, payload_id)
);
create index if not exists phd_simulator_v2_finalized_statistics_run_key
  on public.phd_simulator_v2_finalized_statistics (data_epoch, run_key);
alter table public.phd_simulator_v2_finalized_statistics enable row level security;
revoke all on public.phd_simulator_v2_finalized_statistics from public, anon, authenticated;

-- Retain all existing rule, context, epoch and activity-date validation. This
-- private implementation is called only after the public wrapper binds stable
-- finalization identities. The guard makes this migration safe to rerun.
do $rename$
begin
  if pg_catalog.to_regprocedure('public.record_phd_simulator_v2_stats_batch_unlinked(jsonb,text)') is null then
    alter function public.record_phd_simulator_v2_stats_batch(jsonb, text)
      rename to record_phd_simulator_v2_stats_batch_unlinked;
  end if;
end;
$rename$;
revoke all on function public.record_phd_simulator_v2_stats_batch_unlinked(jsonb, text)
  from public, anon, authenticated;

create or replace function public.record_phd_simulator_v2_stats_batch(p_records jsonb, p_epoch text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $batch$
declare
  item jsonb;
  payload jsonb;
  parsed_run jsonb;
  canonical_run text;
  role_id text;
  final_id uuid;
  record_id uuid;
  record_kind text;
  record_fingerprint text;
  record_hash bytea;
  existing public.phd_simulator_v2_finalized_statistics%rowtype;
  fresh_records jsonb := '[]'::jsonb;
  accepted_ids jsonb := '[]'::jsonb;
  lock_id text;
begin
  if p_epoch is distinct from '20261016-monthly-replay-v1' then
    raise exception 'Refresh the game: statistics epoch expired' using errcode = '22023';
  end if;
  if p_records is null or pg_catalog.jsonb_typeof(p_records) is distinct from 'array' then
    raise exception 'Statistics batch must be an array' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_records) not between 1 and 50 then
    raise exception 'Statistics batch must contain 1 to 50 records' using errcode = '22023';
  end if;

  -- Serialize the same finalized run across tabs and retries. Lock in a stable
  -- order so two mixed-run batches cannot deadlock. No player-level lock exists.
  for lock_id in select distinct value -> 'payload' ->> 'p_finalized_run_id'
    from pg_catalog.jsonb_array_elements(p_records)
    where value -> 'payload' ->> 'p_finalized_run_id' is not null
    order by 1
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phd-v2-final:' || lock_id, 0));
  end loop;

  for item in select value from pg_catalog.jsonb_array_elements(p_records) loop
    payload := item -> 'payload';
    if pg_catalog.jsonb_typeof(item) is distinct from 'object'
      or pg_catalog.jsonb_typeof(payload) is distinct from 'object' then
      raise exception 'Invalid statistics batch record' using errcode = '22023';
    end if;
    record_id := (payload ->> 'p_id')::uuid;
    if record_id is null or record_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Invalid statistics record ID' using errcode = '22023';
    end if;
    accepted_ids := accepted_ids || pg_catalog.jsonb_build_array(record_id::text);
    if not (payload ? 'p_finalized_run_id') then
      fresh_records := fresh_records || pg_catalog.jsonb_build_array(item);
      continue;
    end if;

    final_id := (payload ->> 'p_finalized_run_id')::uuid;
    record_kind := item ->> 'kind';
    record_fingerprint := payload ->> 'p_fingerprint';
    if final_id is null or final_id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or record_kind is null or record_kind not in ('conference', 'journal', 'thesis', 'activity')
      or pg_catalog.jsonb_typeof(payload -> 'p_fingerprint') is distinct from 'string'
      or pg_catalog.length(record_fingerprint) not between 1 and 1024
      or pg_catalog.jsonb_typeof(payload -> 'p_run_key') is distinct from 'string'
      or pg_catalog.length(payload ->> 'p_run_key') not between 1 and 160
      or (record_kind = 'activity' and payload ->> 'p_event' is distinct from 'finish') then
      raise exception 'Invalid statistics finalization identity' using errcode = '22023';
    end if;
    parsed_run := (payload ->> 'p_run_key')::jsonb;
    if pg_catalog.jsonb_typeof(parsed_run) is distinct from 'array' then
      raise exception 'Invalid finalized run key' using errcode = '22023';
    end if;
    if pg_catalog.jsonb_array_length(parsed_run) <> 2
      or pg_catalog.jsonb_typeof(parsed_run -> 0) is distinct from 'number'
      or pg_catalog.jsonb_typeof(parsed_run -> 1) is distinct from 'string' then
      raise exception 'Invalid finalized run key' using errcode = '22023';
    end if;
    canonical_run := parsed_run::text;
    role_id := parsed_run ->> 1;
    if pg_catalog.length(canonical_run) > 160
      or role_id not in ('normal', 'genius', 'social', 'rich', 'teacher-child', 'chosen', 'rewinder', 'research-captain', 'normal-reversed', 'genius-reversed', 'social-reversed', 'rich-reversed', 'teacher-child-reversed', 'chosen-reversed', 'special-dandan', 'special-daji', 'special-finite-life', 'special-fading-genius', 'cursed-frail', 'cursed-debt')
      or (record_kind = 'activity' and payload ->> 'p_role_id' is distinct from role_id)
      or (record_kind in ('conference', 'journal') and payload -> 'p_context' is not null
        and payload -> 'p_context' <> 'null'::jsonb
        and ((payload -> 'p_context' ->> 'runKey')::jsonb is distinct from parsed_run
          or payload -> 'p_context' ->> 'roleId' is distinct from role_id)) then
      raise exception 'Finalized statistics role mismatch' using errcode = '22023';
    end if;
    if exists (select 1 from public.phd_simulator_v2_finalized_statistics s
      where s.data_epoch = p_epoch and s.finalized_run_id = final_id and s.run_key <> canonical_run) then
      raise exception 'Finalized run ID already belongs to another run' using errcode = '22023';
    end if;
    -- A retried finish may be replayed on another calendar day. Its identity is
    -- the finalized run and ending; retain the first confirmed activity date.
    record_hash := pg_catalog.sha256(pg_catalog.convert_to(
      (pg_catalog.jsonb_set(payload - 'p_id' - 'p_day', '{p_run_key}', pg_catalog.to_jsonb(canonical_run)))::text, 'UTF8'));
    select * into existing from public.phd_simulator_v2_finalized_statistics s
      where s.data_epoch = p_epoch and s.finalized_run_id = final_id
        and s.kind = record_kind and s.fingerprint = record_fingerprint;
    if found then
      if existing.payload_hash is distinct from record_hash then
        raise exception 'Finalized statistic already has another payload' using errcode = '22023';
      end if;
      continue;
    end if;
    insert into public.phd_simulator_v2_finalized_statistics
      (data_epoch, finalized_run_id, kind, fingerprint, run_key, role_id, payload_id, payload_hash)
      values (p_epoch, final_id, record_kind, record_fingerprint, canonical_run, role_id, record_id, record_hash);
    fresh_records := fresh_records || pg_catalog.jsonb_build_array(item);
  end loop;

  -- Both the receipt ledger and every raw row commit together. A rejected
  -- activity date or paper context rolls the whole transaction back as before.
  if pg_catalog.jsonb_array_length(fresh_records) > 0 then
    perform public.record_phd_simulator_v2_stats_batch_unlinked(fresh_records, p_epoch);
  end if;
  return accepted_ids;
end;
$batch$;

revoke all on function public.record_phd_simulator_v2_stats_batch(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.record_phd_simulator_v2_stats_batch(jsonb, text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
