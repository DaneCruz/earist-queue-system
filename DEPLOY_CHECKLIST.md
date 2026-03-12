# EARIST Queue System - Pre-Deploy Checklist

## 1) Database SQL (run once in Supabase SQL Editor)
- `supabase/sql/slot_lock_used_for_day.sql`
- `supabase/sql/daily_consultation_cleanup.sql`
- `supabase/sql/no_show_auto_close.sql`
- `supabase/sql/faculty_availability_window.sql`
- `supabase/sql/activity_logs.sql`

## 2) Edge Functions (deploy from project root)
```powershell
npx.cmd supabase functions deploy send-queue-email
npx.cmd supabase functions deploy start-interview
```

## 3) Secrets (set in Supabase)
```powershell
npx.cmd supabase secrets set "GMAIL_WEBHOOK_URL=PASTE_GOOGLE_APPS_SCRIPT_EXEC_URL" --project-ref yhryfoimpqzmaaymsaat
npx.cmd supabase secrets set "GMAIL_WEBHOOK_SECRET=PASTE_YOUR_SECRET" --project-ref yhryfoimpqzmaaymsaat
```

## 4) Quick Smoke Test
- Student queue filing works.
- Queue confirmation email is delivered.
- Faculty `Start Interview` sends interview email with Meet link.
- `No Show` auto-close works after timeout.
- Admin dashboard loads consultation history and activity logs.

## 5) Data Backup (before major schema changes)
```sql
create table if not exists public.consultations_backup as
select * from public.consultations;
```
