-- Keep used slots locked for the whole day.
-- Run once in Supabase SQL Editor.

-- Make sure queue_date exists and is backfilled.
alter table public.consultations
add column if not exists queue_date date;

update public.consultations
set queue_date = (created_at at time zone 'Asia/Manila')::date
where queue_date is null;

alter table public.consultations
alter column queue_date set default ((now() at time zone 'Asia/Manila')::date);

alter table public.consultations
alter column queue_date set not null;

-- Recreate unique index so "completed" remains locked for the day.
drop index if exists public.consultations_unique_active_slot_per_day;

create unique index consultations_unique_active_slot_per_day
on public.consultations (faculty_id, preferred_time, queue_date)
where status in ('pending', 'interviewing', 'completed', 'no_show');
