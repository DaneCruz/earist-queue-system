-- Track delivery state for post-interview status emails.
-- Run once in Supabase SQL Editor.

alter table public.consultations
add column if not exists no_show_email_sent_at timestamptz,
add column if not exists completed_email_sent_at timestamptz;

create index if not exists consultations_no_show_email_sent_idx
on public.consultations (status, no_show_email_sent_at, created_at);

create index if not exists consultations_completed_email_sent_idx
on public.consultations (status, completed_email_sent_at, created_at);
