-- Aqademiq investor KPI extract
-- Run in Supabase SQL editor (production). Copy results into inputs.json.
-- Definitions are explicit. No estimated/filler values.

-- ============================================================
-- 0) As-of + window (edit once)
-- ============================================================
-- window_days = 30 means last 30 calendar days including today (UTC).

-- ============================================================
-- 1) User base (exclude soft-deleted)
-- ============================================================
SELECT
  COUNT(*) FILTER (WHERE deleted_at IS NULL) AS total_profiles,
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_guest = false) AS registered_users,
  COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_guest = true) AS guest_users,
  COUNT(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted_users,
  COUNT(*) FILTER (
    WHERE deleted_at IS NULL
      AND is_guest = false
      AND onboarding_complete = true
  ) AS onboarded_users
FROM profiles;

-- ============================================================
-- 2) Growth in window
-- ============================================================
SELECT
  COUNT(*) FILTER (
    WHERE deleted_at IS NULL
      AND is_guest = false
      AND created_at >= (now() AT TIME ZONE 'utc') - INTERVAL '30 days'
  ) AS signups_in_window,
  COUNT(*) FILTER (
    WHERE deleted_at IS NULL
      AND is_guest = true
      AND created_at >= (now() AT TIME ZONE 'utc') - INTERVAL '30 days'
  ) AS guests_in_window,
  COUNT(*) FILTER (
    WHERE deleted_at IS NULL
      AND is_guest = false
      AND referred_by IS NOT NULL
      AND created_at >= (now() AT TIME ZONE 'utc') - INTERVAL '30 days'
  ) AS referred_signups_in_window
FROM profiles;

-- ============================================================
-- 3) Active users
-- Active day = row in daily_activity_snapshots for that user/date
-- (only as reliable as that table is written in prod)
-- ============================================================
SELECT
  COUNT(DISTINCT user_id) FILTER (
    WHERE activity_date = ((now() AT TIME ZONE 'utc')::date)
  ) AS dau,
  COUNT(DISTINCT user_id) FILTER (
    WHERE activity_date >= ((now() AT TIME ZONE 'utc')::date) - 6
  ) AS wau,
  COUNT(DISTINCT user_id) FILTER (
    WHERE activity_date >= ((now() AT TIME ZONE 'utc')::date) - 29
  ) AS mau
FROM daily_activity_snapshots;

-- Fallback if snapshots are empty/untrusted: distinct users with
-- focus completed OR task completed OR mood checkin in window.
SELECT
  COUNT(DISTINCT user_id) AS mau_behavior_fallback
FROM (
  SELECT user_id
  FROM focus_sessions
  WHERE was_completed = true
    AND started_at >= (now() AT TIME ZONE 'utc') - INTERVAL '30 days'
  UNION
  SELECT user_id
  FROM tasks
  WHERE completed_at IS NOT NULL
    AND completed_at >= (now() AT TIME ZONE 'utc') - INTERVAL '30 days'
  UNION
  SELECT user_id
  FROM mood_checkins
  WHERE created_at >= (now() AT TIME ZONE 'utc') - INTERVAL '30 days'
) u;

-- ============================================================
-- 4) Retention cohorts (activity-based)
-- Cohort = registered users who signed up on day D.
-- Retained Dn = has daily_activity_snapshots row on signup_date + n.
-- Run separately for each cohort day you care about, or use the
-- rolling cohort below (all registered signups with enough age).
-- ============================================================

-- D1: users signed up >= 2 days ago and < 32 days ago
WITH cohort AS (
  SELECT
    id AS user_id,
    (created_at AT TIME ZONE 'utc')::date AS signup_date
  FROM profiles
  WHERE deleted_at IS NULL
    AND is_guest = false
    AND created_at < (now() AT TIME ZONE 'utc') - INTERVAL '1 day'
    AND created_at >= (now() AT TIME ZONE 'utc') - INTERVAL '31 days'
)
SELECT
  COUNT(*) AS cohort_size_d1,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1
      FROM daily_activity_snapshots d
      WHERE d.user_id = cohort.user_id
        AND d.activity_date = cohort.signup_date + 1
    )
  ) AS retained_d1
FROM cohort;

-- D7
WITH cohort AS (
  SELECT
    id AS user_id,
    (created_at AT TIME ZONE 'utc')::date AS signup_date
  FROM profiles
  WHERE deleted_at IS NULL
    AND is_guest = false
    AND created_at < (now() AT TIME ZONE 'utc') - INTERVAL '7 days'
    AND created_at >= (now() AT TIME ZONE 'utc') - INTERVAL '37 days'
)
SELECT
  COUNT(*) AS cohort_size_d7,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1
      FROM daily_activity_snapshots d
      WHERE d.user_id = cohort.user_id
        AND d.activity_date = cohort.signup_date + 7
    )
  ) AS retained_d7
FROM cohort;

-- D30
WITH cohort AS (
  SELECT
    id AS user_id,
    (created_at AT TIME ZONE 'utc')::date AS signup_date
  FROM profiles
  WHERE deleted_at IS NULL
    AND is_guest = false
    AND created_at < (now() AT TIME ZONE 'utc') - INTERVAL '30 days'
    AND created_at >= (now() AT TIME ZONE 'utc') - INTERVAL '60 days'
)
SELECT
  COUNT(*) AS cohort_size_d30,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1
      FROM daily_activity_snapshots d
      WHERE d.user_id = cohort.user_id
        AND d.activity_date = cohort.signup_date + 30
    )
  ) AS retained_d30
FROM cohort;

-- ============================================================
-- 5) Activation: first completed focus within 24h of signup
-- ============================================================
WITH new_users AS (
  SELECT id AS user_id, created_at
  FROM profiles
  WHERE deleted_at IS NULL
    AND is_guest = false
    AND created_at >= (now() AT TIME ZONE 'utc') - INTERVAL '30 days'
),
first_focus AS (
  SELECT
    fs.user_id,
    MIN(fs.started_at) AS first_completed_at
  FROM focus_sessions fs
  WHERE fs.was_completed = true
  GROUP BY fs.user_id
)
SELECT
  COUNT(*) AS new_registered_in_window,
  COUNT(*) FILTER (
    WHERE ff.first_completed_at IS NOT NULL
      AND ff.first_completed_at <= nu.created_at + INTERVAL '24 hours'
  ) AS activated_first_focus_24h
FROM new_users nu
LEFT JOIN first_focus ff ON ff.user_id = nu.user_id;

-- ============================================================
-- 6) Guest → convert after focus
-- Converted = guest profile later became non-guest is NOT always
-- tracked as same id (anonymous upgrade usually keeps same auth id).
-- Definition used here:
--   guests_completed_focus = distinct guest users with completed focus
--   guests_converted_after_focus = those who are now is_guest=false
--     AND have completed focus while still having been guest historically
-- Safer proxy (same user_id): currently registered users who completed
-- a focus session and also have is_guest=false, counted among users
-- who ever had guest activity is hard without history.
-- Use this operational proxy:
-- ============================================================
SELECT
  COUNT(DISTINCT p.id) FILTER (
    WHERE p.is_guest = true
      AND EXISTS (
        SELECT 1 FROM focus_sessions fs
        WHERE fs.user_id = p.id AND fs.was_completed = true
      )
  ) AS guests_completed_focus_still_guest,
  COUNT(DISTINCT p.id) FILTER (
    WHERE p.is_guest = false
      AND EXISTS (
        SELECT 1 FROM focus_sessions fs
        WHERE fs.user_id = p.id AND fs.was_completed = true
      )
  ) AS registered_with_completed_focus
FROM profiles p
WHERE p.deleted_at IS NULL;

-- Put into inputs:
-- guests_completed_focus = guests_completed_focus_still_guest
--   + converted guests (if you track convert events; else leave null)
-- guests_converted_after_focus = only if you have convert telemetry

-- ============================================================
-- 7) Engagement totals (window)
-- ============================================================
SELECT
  COUNT(*) AS focus_sessions_started,
  COUNT(*) FILTER (WHERE was_completed = true) AS focus_sessions_completed,
  COALESCE(SUM(actual_duration_mins) FILTER (WHERE was_completed = true), 0) AS focus_minutes_total
FROM focus_sessions
WHERE started_at >= (now() AT TIME ZONE 'utc') - INTERVAL '30 days';

SELECT
  COUNT(*) AS tasks_created,
  COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS tasks_completed
FROM tasks
WHERE created_at >= (now() AT TIME ZONE 'utc') - INTERVAL '30 days';

SELECT COUNT(*) AS ada_sessions
FROM ada_sessions
WHERE created_at >= (now() AT TIME ZONE 'utc') - INTERVAL '30 days';

SELECT COUNT(*) AS ada_user_messages
FROM ada_messages m
JOIN ada_sessions s ON s.id = m.ada_session_id
WHERE m.role = 'user'
  AND m.sent_at >= (now() AT TIME ZONE 'utc') - INTERVAL '30 days';

SELECT
  COUNT(*) AS ada_plan_items_suggested,
  COUNT(*) FILTER (WHERE status = 'applied' OR task_id IS NOT NULL) AS ada_plan_items_applied
FROM ada_generated_plan_items
WHERE created_at >= (now() AT TIME ZONE 'utc') - INTERVAL '30 days';

SELECT COUNT(*) AS mood_checkins
FROM mood_checkins
WHERE created_at >= (now() AT TIME ZONE 'utc') - INTERVAL '30 days';

SELECT COUNT(*) AS referral_redemptions
FROM referral_redemptions
WHERE redeemed_at >= (now() AT TIME ZONE 'utc') - INTERVAL '30 days';
