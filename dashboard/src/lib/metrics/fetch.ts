import { getPool, queryOne } from "../db";
import { pct, type DayPoint, type MetricsPayload } from "./types";

const WINDOW_DAYS = 30;

function n(v: unknown): number {
  if (v == null) return 0;
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

function dayStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

async function querySeries(sql: string, params: unknown[] = []): Promise<DayPoint[]> {
  const result = await getPool().query<{ day: unknown; value: unknown }>(sql, params);
  return result.rows.map((row) => ({
    day: dayStr(row.day),
    value: n(row.value),
  }));
}

export async function fetchMetrics(): Promise<MetricsPayload> {
  const asOf = new Date().toISOString();

  const users = await queryOne<{
    registered_users: string;
    guest_users: string;
    onboarded_users: string;
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_guest = false) AS registered_users,
      COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_guest = true) AS guest_users,
      COUNT(*) FILTER (
        WHERE deleted_at IS NULL
          AND is_guest = false
          AND onboarding_complete = true
      ) AS onboarded_users
    FROM profiles
  `);

  const growth = await queryOne<{
    signups_in_window: string;
    guests_in_window: string;
    referred_signups_in_window: string;
  }>(`
    SELECT
      COUNT(*) FILTER (
        WHERE deleted_at IS NULL
          AND is_guest = false
          AND created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
      ) AS signups_in_window,
      COUNT(*) FILTER (
        WHERE deleted_at IS NULL
          AND is_guest = true
          AND created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
      ) AS guests_in_window,
      COUNT(*) FILTER (
        WHERE deleted_at IS NULL
          AND is_guest = false
          AND referred_by IS NOT NULL
          AND created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
      ) AS referred_signups_in_window
    FROM profiles
  `, [WINDOW_DAYS]);

  const activity = await queryOne<{
    dau: string;
    wau: string;
    mau: string;
  }>(`
    SELECT
      COUNT(DISTINCT user_id) FILTER (
        WHERE activity_date = ((now() AT TIME ZONE 'utc')::date)
      ) AS dau,
      COUNT(DISTINCT user_id) FILTER (
        WHERE activity_date >= ((now() AT TIME ZONE 'utc')::date) - 6
      ) AS wau,
      COUNT(DISTINCT user_id) FILTER (
        WHERE activity_date >= ((now() AT TIME ZONE 'utc')::date) - ($1::int - 1)
      ) AS mau
    FROM daily_activity_snapshots
  `, [WINDOW_DAYS]);

  const fallback = await queryOne<{ mau_behavior_fallback: string }>(`
    SELECT COUNT(DISTINCT user_id) AS mau_behavior_fallback
    FROM (
      SELECT user_id
      FROM focus_sessions
      WHERE was_completed = true
        AND started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
      UNION
      SELECT user_id
      FROM tasks
      WHERE completed_at IS NOT NULL
        AND completed_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
      UNION
      SELECT user_id
      FROM mood_checkins
      WHERE created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
    ) u
  `, [WINDOW_DAYS]);

  const d1 = await queryOne<{ cohort_size_d1: string; retained_d1: string }>(`
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
    FROM cohort
  `);

  const d7 = await queryOne<{ cohort_size_d7: string; retained_d7: string }>(`
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
    FROM cohort
  `);

  const d30 = await queryOne<{ cohort_size_d30: string; retained_d30: string }>(`
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
    FROM cohort
  `);

  const activation = await queryOne<{
    new_registered_in_window: string;
    activated_first_focus_24h: string;
  }>(`
    WITH new_users AS (
      SELECT id AS user_id, created_at
      FROM profiles
      WHERE deleted_at IS NULL
        AND is_guest = false
        AND created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
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
    LEFT JOIN first_focus ff ON ff.user_id = nu.user_id
  `, [WINDOW_DAYS]);

  const guestProxy = await queryOne<{
    guests_completed_focus_still_guest: string;
    registered_with_completed_focus: string;
  }>(`
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
    WHERE p.deleted_at IS NULL
  `);

  const focus = await queryOne<{
    focus_sessions_started: string;
    focus_sessions_completed: string;
    focus_minutes_total: string;
  }>(`
    SELECT
      COUNT(*) AS focus_sessions_started,
      COUNT(*) FILTER (WHERE was_completed = true) AS focus_sessions_completed,
      COALESCE(SUM(actual_duration_mins) FILTER (WHERE was_completed = true), 0) AS focus_minutes_total
    FROM focus_sessions
    WHERE started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
  `, [WINDOW_DAYS]);

  const tasks = await queryOne<{
    tasks_created: string;
    tasks_completed: string;
  }>(`
    SELECT
      COUNT(*) AS tasks_created,
      COUNT(*) FILTER (WHERE completed_at IS NOT NULL) AS tasks_completed
    FROM tasks
    WHERE created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
  `, [WINDOW_DAYS]);

  const adaSessions = await queryOne<{ ada_sessions: string }>(`
    SELECT COUNT(*) AS ada_sessions
    FROM ada_sessions
    WHERE created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
  `, [WINDOW_DAYS]);

  const adaMessages = await queryOne<{ ada_user_messages: string }>(`
    SELECT COUNT(*) AS ada_user_messages
    FROM ada_messages m
    JOIN ada_sessions s ON s.id = m.ada_session_id
    WHERE m.role = 'user'
      AND m.sent_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
  `, [WINDOW_DAYS]);

  const adaPlans = await queryOne<{
    ada_plan_items_suggested: string;
    ada_plan_items_applied: string;
  }>(`
    SELECT
      COUNT(*) AS ada_plan_items_suggested,
      COUNT(*) FILTER (WHERE status = 'applied' OR task_id IS NOT NULL) AS ada_plan_items_applied
    FROM ada_generated_plan_items
    WHERE created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
  `, [WINDOW_DAYS]);

  const mood = await queryOne<{ mood_checkins: string }>(`
    SELECT COUNT(*) AS mood_checkins
    FROM mood_checkins
    WHERE created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
  `, [WINDOW_DAYS]);

  const referrals = await queryOne<{ referral_redemptions: string }>(`
    SELECT COUNT(*) AS referral_redemptions
    FROM referral_redemptions
    WHERE redeemed_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
  `, [WINDOW_DAYS]);

  const signupsDaily = await querySeries(
    `
    SELECT
      gs.day::date AS day,
      COUNT(p.id)::int AS value
    FROM generate_series(
      ((now() AT TIME ZONE 'utc')::date - ($1::int - 1)),
      (now() AT TIME ZONE 'utc')::date,
      '1 day'::interval
    ) AS gs(day)
    LEFT JOIN profiles p
      ON p.deleted_at IS NULL
     AND p.is_guest = false
     AND (p.created_at AT TIME ZONE 'utc')::date = gs.day::date
    GROUP BY gs.day
    ORDER BY gs.day
    `,
    [WINDOW_DAYS],
  );

  const activeUsersDaily = await querySeries(
    `
    SELECT
      gs.day::date AS day,
      COUNT(DISTINCT d.user_id)::int AS value
    FROM generate_series(
      ((now() AT TIME ZONE 'utc')::date - ($1::int - 1)),
      (now() AT TIME ZONE 'utc')::date,
      '1 day'::interval
    ) AS gs(day)
    LEFT JOIN daily_activity_snapshots d
      ON d.activity_date = gs.day::date
    GROUP BY gs.day
    ORDER BY gs.day
    `,
    [WINDOW_DAYS],
  );

  const focusMinutesDaily = await querySeries(
    `
    SELECT
      gs.day::date AS day,
      COALESCE(SUM(fs.actual_duration_mins) FILTER (WHERE fs.was_completed = true), 0)::int AS value
    FROM generate_series(
      ((now() AT TIME ZONE 'utc')::date - ($1::int - 1)),
      (now() AT TIME ZONE 'utc')::date,
      '1 day'::interval
    ) AS gs(day)
    LEFT JOIN focus_sessions fs
      ON (fs.started_at AT TIME ZONE 'utc')::date = gs.day::date
    GROUP BY gs.day
    ORDER BY gs.day
    `,
    [WINDOW_DAYS],
  );

  const tasksCompletedDaily = await querySeries(
    `
    SELECT
      gs.day::date AS day,
      COUNT(t.id)::int AS value
    FROM generate_series(
      ((now() AT TIME ZONE 'utc')::date - ($1::int - 1)),
      (now() AT TIME ZONE 'utc')::date,
      '1 day'::interval
    ) AS gs(day)
    LEFT JOIN tasks t
      ON t.completed_at IS NOT NULL
     AND (t.completed_at AT TIME ZONE 'utc')::date = gs.day::date
    GROUP BY gs.day
    ORDER BY gs.day
    `,
    [WINDOW_DAYS],
  );

  const registeredUsers = n(users.registered_users);
  const guestUsers = n(users.guest_users);
  const onboardedUsers = n(users.onboarded_users);
  const signupsInWindow = n(growth.signups_in_window);
  const referredSignups = n(growth.referred_signups_in_window);

  const dau = n(activity.dau);
  const wau = n(activity.wau);
  const mauSnapshots = n(activity.mau);
  const mauFallback = n(fallback.mau_behavior_fallback);
  const useFallback = mauSnapshots === 0 && mauFallback > 0;
  const mau = useFallback ? mauFallback : mauSnapshots;

  const focusStarted = n(focus.focus_sessions_started);
  const focusCompleted = n(focus.focus_sessions_completed);
  const planSuggested = n(adaPlans.ada_plan_items_suggested);
  const planApplied = n(adaPlans.ada_plan_items_applied);

  const d1Size = n(d1.cohort_size_d1);
  const d7Size = n(d7.cohort_size_d7);
  const d30Size = n(d30.cohort_size_d30);
  const newRegistered = n(activation.new_registered_in_window);
  const activated24h = n(activation.activated_first_focus_24h);

  return {
    meta: {
      asOf,
      windowDays: WINDOW_DAYS,
      source: "supabase_postgres",
      preRelease: registeredUsers === 0,
      error: null,
    },
    growth: {
      registeredUsers,
      guestUsers,
      onboardedUsers,
      onboardingRate: pct(onboardedUsers, registeredUsers),
      signupsInWindow,
      guestsInWindow: n(growth.guests_in_window),
      referredSignupsInWindow: referredSignups,
      referralShare: pct(referredSignups, signupsInWindow),
    },
    activity: {
      dau,
      wau,
      mau,
      mauBehaviorFallback: mauFallback,
      mauSource: useFallback ? "behavior_fallback" : "daily_activity_snapshots",
      stickinessDauMau: pct(dau, mau),
      stickinessWauMau: pct(wau, mau),
    },
    retention: {
      d1: pct(n(d1.retained_d1), d1Size),
      d1CohortSize: d1Size,
      d7: pct(n(d7.retained_d7), d7Size),
      d7CohortSize: d7Size,
      d30: pct(n(d30.retained_d30), d30Size),
      d30CohortSize: d30Size,
    },
    activation: {
      newRegisteredInWindow: newRegistered,
      activatedFirstFocus24h: activated24h,
      firstFocus24hRate: pct(activated24h, newRegistered),
      guestsCompletedFocusStillGuest: n(guestProxy.guests_completed_focus_still_guest),
      registeredWithCompletedFocus: n(guestProxy.registered_with_completed_focus),
    },
    engagement: {
      focusSessionsStarted: focusStarted,
      focusSessionsCompleted: focusCompleted,
      focusCompletionRate: pct(focusCompleted, focusStarted),
      focusMinutesTotal: n(focus.focus_minutes_total),
      tasksCreated: n(tasks.tasks_created),
      tasksCompleted: n(tasks.tasks_completed),
      adaSessions: n(adaSessions.ada_sessions),
      adaUserMessages: n(adaMessages.ada_user_messages),
      adaPlanItemsSuggested: planSuggested,
      adaPlanItemsApplied: planApplied,
      adaPlanApplyRate: pct(planApplied, planSuggested),
      moodCheckins: n(mood.mood_checkins),
      referralRedemptions: n(referrals.referral_redemptions),
    },
    monetization: {
      status: "pre-revenue",
      mrrUsd: null,
      payingCustomers: null,
      arpuUsd: null,
    },
    series: {
      signupsDaily,
      activeUsersDaily,
      focusMinutesDaily,
      tasksCompletedDaily,
    },
  };
}
