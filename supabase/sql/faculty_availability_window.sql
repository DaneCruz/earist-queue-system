-- Add per-faculty availability time window.
-- Run once in Supabase SQL Editor.

alter table public.faculty
add column if not exists available_start time,
add column if not exists available_end time;

-- Optional safety checks:
alter table public.faculty
drop constraint if exists faculty_available_window_order_check;

alter table public.faculty
add constraint faculty_available_window_order_check
check (
  available_start is null
  or available_end is null
  or available_end > available_start
);

alter table public.faculty
drop constraint if exists faculty_available_window_max3h_check;

alter table public.faculty
add constraint faculty_available_window_max3h_check
check (
  available_start is null
  or available_end is null
  or available_end <= available_start + interval '3 hours'
);

