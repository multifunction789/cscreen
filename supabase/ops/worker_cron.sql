-- ═══════════════════════════════════════════════════════════════════
-- Safety net for the chat task queue (phase 4). Run once in the SQL Editor
-- of the production project (not a migration: it points at the live URL).
--
-- The webhook already processes new tasks right after it answers LINE.
-- This job calls /api/worker every minute so anything that failed
-- (LINE busy, Vercel timeout) is retried with back-off until done or 'dead'.
-- /api/worker needs no secret: it only runs work that is already queued.
-- ═══════════════════════════════════════════════════════════════════
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'cscreen-chat-worker';
select cron.schedule('cscreen-chat-worker', '* * * * *',
  $$ select net.http_post(url := 'https://cscreen.vercel.app/api/worker', body := '{}'::jsonb, timeout_milliseconds := 55000) $$);

-- check:   select jobname, schedule, active from cron.job;
-- history: select status, start_time from cron.job_run_details order by start_time desc limit 10;
-- stop:    select cron.unschedule('cscreen-chat-worker');
