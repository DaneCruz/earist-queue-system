-- Activity logs for admin auditing.
-- Run once in Supabase SQL Editor.

create table if not exists public.activity_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor_email text null,
  actor_role text not null check (actor_role in ('student', 'faculty', 'admin', 'system')),
  action text not null,
  target_type text null,
  target_id text null,
  details jsonb not null default '{}'::jsonb
);

create index if not exists activity_logs_created_at_idx
on public.activity_logs (created_at desc);

create index if not exists activity_logs_actor_role_idx
on public.activity_logs (actor_role);

create index if not exists activity_logs_action_idx
on public.activity_logs (action);

alter table public.activity_logs enable row level security;

drop policy if exists "activity_logs_insert_authenticated" on public.activity_logs;
create policy "activity_logs_insert_authenticated"
on public.activity_logs
for insert
to authenticated
with check (true);

drop policy if exists "activity_logs_select_admins" on public.activity_logs;
create policy "activity_logs_select_admins"
on public.activity_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.admins a
    where lower(a.email) = lower(auth.jwt()->>'email')
  )
);
