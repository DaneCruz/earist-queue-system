-- Hard-lock Meet links after consultation is finished.
-- Run once in Supabase SQL Editor.

-- 1) Clean existing data: finished/no-show/cancelled rows should not keep active meet links.
update public.consultations
set meet_link = null
where status in ('completed', 'no_show', 'cancelled')
  and meet_link is not null;

-- 2) Update existing timestamp trigger function to also clear meet_link on terminal statuses.
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

-- 3) Ensure trigger is attached.
drop trigger if exists trg_consultations_set_timestamps on public.consultations;
create trigger trg_consultations_set_timestamps
before update on public.consultations
for each row
execute function public.consultations_set_timestamps();

