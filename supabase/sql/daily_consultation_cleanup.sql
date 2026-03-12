-- Daily cleanup for old active consultations.
-- Purpose:
-- 1) Expire stale "pending"/"interviewing" rows from previous days.
-- 2) Keep slot availability clean per day.

-- Run once in Supabase SQL Editor.

create extension if not exists pg_cron;

create or replace function public.expire_old_consultations()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.consultations
  set status = 'cancelled'
  where status in ('pending', 'interviewing')
    and queue_date < (now() at time zone 'Asia/Manila')::date;
end;
$$;

-- Remove old schedule if already exists (safe to rerun).
select cron.unschedule('expire-old-consultations')
where exists (
  select 1
  from cron.job
  where jobname = 'expire-old-consultations'
);

-- Runs every day at 00:05 Asia/Manila.
-- Supabase cron timezone is UTC, so 16:05 UTC = 00:05 Asia/Manila.
select cron.schedule(
  'expire-old-consultations',
  '5 16 * * *',
  $$select public.expire_old_consultations();$$
);

