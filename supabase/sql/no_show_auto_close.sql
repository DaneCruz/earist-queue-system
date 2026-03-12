-- Adds "no_show" flow + automatic timeout close for interviewing sessions.
-- Run once in Supabase SQL Editor.

create extension if not exists pg_cron;

-- If an old schedule/function already exists, remove them first so reruns are safe.
select cron.unschedule('auto-mark-no-show')
where exists (
  select 1 from cron.job where jobname = 'auto-mark-no-show'
);

drop function if exists public.auto_mark_no_show();
drop function if exists public.auto_mark_no_show(integer);

-- 1) Add columns used by timeout logic.
alter table public.consultations
add column if not exists interview_started_at timestamptz,
add column if not exists no_show_marked_at timestamptz;

-- 2) Allow status = no_show.
alter table public.consultations
drop constraint if exists consultations_status_check;

alter table public.consultations
add constraint consultations_status_check
check (
  (status)::text = any (
    (
      array[
        'pending'::character varying,
        'interviewing'::character varying,
        'completed'::character varying,
        'cancelled'::character varying,
        'no_show'::character varying
      ]
    )::text[]
  )
);

-- 3) Set interview_started_at for existing interviewing rows (if missing).
update public.consultations
set interview_started_at = coalesce(interview_started_at, created_at)
where status = 'interviewing'
  and interview_started_at is null;

-- Optional performance index for timeout scanning.
create index if not exists consultations_interviewing_timeout_idx
on public.consultations (status, interview_started_at, created_at);

-- 4) Auto-mark no-show after timeout minutes (default: 10).
create or replace function public.auto_mark_no_show(timeout_minutes integer default 10)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_count integer := 0;
begin
  update public.consultations
  set
    status = 'no_show',
    no_show_marked_at = now()
  where status = 'interviewing'
    and no_show_marked_at is null
    and coalesce(interview_started_at, created_at) <= now() - make_interval(mins => timeout_minutes);

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

-- 5) Keep interview timestamps consistent whenever status changes.
create or replace function public.consultations_set_timestamps()
returns trigger
language plpgsql
as $$
begin
  -- On first switch to interviewing, set interview_started_at if missing.
  if new.status = 'interviewing' and coalesce(old.status, '') <> 'interviewing' then
    if new.interview_started_at is null then
      new.interview_started_at = now();
    end if;
    new.no_show_marked_at = null;
  end if;

  -- If status leaves no_show, clear no_show_marked_at.
  if new.status <> 'no_show' then
    new.no_show_marked_at = null;
  end if;

  -- Hard lock: terminal statuses cannot keep Meet links.
  if new.status in ('completed', 'no_show', 'cancelled') then
    new.meet_link = null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_consultations_set_timestamps on public.consultations;
create trigger trg_consultations_set_timestamps
before update on public.consultations
for each row
execute function public.consultations_set_timestamps();

-- 6) Schedule every 2 minutes.
select cron.schedule(
  'auto-mark-no-show',
  '*/2 * * * *',
  $$select public.auto_mark_no_show(10);$$
);
