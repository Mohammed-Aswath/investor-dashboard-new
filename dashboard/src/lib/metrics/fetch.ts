import { getPool, queryOne } from "../db";
import {
  emptyMetrics,
  pct,
  type DayPoint,
  type Hypothesis,
  type MetricsPayload,
  type ReadinessCheck,
  type UnlockInsight,
} from "./types";

const WINDOW_DAYS = 30;

function n(v: unknown): number {
  if (v == null) return 0;
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

function nOrNull(v: unknown): number | null {
  if (v == null) return null;
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
}

function dayStr(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

async function tableExists(name: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
    ) AS exists
    `,
    [name],
  );
  return Boolean(row.exists);
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    ) AS exists
    `,
    [table, column],
  );
  return Boolean(row.exists);
}

async function querySeries(sql: string, params: unknown[] = []): Promise<DayPoint[]> {
  const result = await getPool().query<{ day: unknown; value: unknown }>(sql, params);
  return result.rows.map((row) => ({
    day: dayStr(row.day),
    value: n(row.value),
  }));
}

/** Shared EFM expression: fallback when ended_at is null (cannot LEAST with server span). */
const EFM_CTE = `
WITH session_efm AS (
  SELECT
    fs.id,
    fs.user_id,
    fs.started_at,
    (fs.started_at AT TIME ZONE 'utc')::date AS study_day,
    fs.was_completed,
    fs.prism_preset_id,
    fs.ended_at,
    fs.actual_duration_mins,
    COALESCE(fs.paused_duration_mins, 0) AS paused_duration_mins,
    COALESCE(fs.interruption_count, 0) AS interruption_count,
    GREATEST(
      COALESCE(fs.actual_duration_mins, 0) - COALESCE(fs.paused_duration_mins, 0),
      0
    ) AS net_mins,
    CASE
      WHEN fs.was_completed IS TRUE
        AND GREATEST(
          COALESCE(fs.actual_duration_mins, 0) - COALESCE(fs.paused_duration_mins, 0),
          0
        ) BETWEEN 5 AND 240
      THEN
        GREATEST(
          COALESCE(fs.actual_duration_mins, 0) - COALESCE(fs.paused_duration_mins, 0),
          0
        ) / (1 + 0.15 * LEAST(COALESCE(fs.interruption_count, 0), 20))
      ELSE NULL
    END AS efm,
    (fs.prism_preset_id IS NOT NULL) AS prism_on,
    (fs.ended_at IS NULL) AS ended_at_missing
  FROM focus_sessions fs
)
`;

export async function fetchMetrics(): Promise<MetricsPayload> {
  const asOf = new Date().toISOString();

  try {
    const hasFocus = await tableExists("focus_sessions");
    if (!hasFocus) {
      return emptyMetrics("focus_sessions table missing");
    }

    const [
      hasPsv,
      hasAuthority,
      hasExperiment,
      hasProbe,
      hasEngineVersion,
      hasEndedAt,
      hasPrismPreset,
    ] = await Promise.all([
      tableExists("prism_state_vectors").then(async (t) =>
        t ? true : tableExists("psv_logs"),
      ),
      tableExists("authority_vectors").then(async (t) =>
        t ? true : columnExists("focus_sessions", "authority_vector"),
      ),
      tableExists("experiment_assignments").then(async (t) =>
        t ? true : columnExists("focus_sessions", "control_arm"),
      ),
      tableExists("ground_truth_probes").then(async (t) =>
        t ? true : tableExists("prism_probes"),
      ),
      columnExists("focus_sessions", "engine_version"),
      columnExists("focus_sessions", "ended_at"),
      columnExists("focus_sessions", "prism_preset_id"),
    ]);

    const coverage = await queryOne<{
      sessions_total: string;
      sessions_started_window: string;
      sessions_completed_window: string;
      ended_at_filled: string;
      prism_preset_set: string;
      pause_nonzero: string;
      interrupt_nonzero: string;
      completed_total: string;
      completed_net_in_range: string;
    }>(
      `
      SELECT
        COUNT(*)::text AS sessions_total,
        COUNT(*) FILTER (
          WHERE started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        )::text AS sessions_started_window,
        COUNT(*) FILTER (
          WHERE was_completed IS TRUE
            AND started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        )::text AS sessions_completed_window,
        COUNT(*) FILTER (WHERE ended_at IS NOT NULL)::text AS ended_at_filled,
        COUNT(*) FILTER (WHERE prism_preset_id IS NOT NULL)::text AS prism_preset_set,
        COUNT(*) FILTER (WHERE COALESCE(paused_duration_mins, 0) > 0)::text AS pause_nonzero,
        COUNT(*) FILTER (WHERE COALESCE(interruption_count, 0) > 0)::text AS interrupt_nonzero,
        COUNT(*) FILTER (WHERE was_completed IS TRUE)::text AS completed_total,
        COUNT(*) FILTER (
          WHERE was_completed IS TRUE
            AND GREATEST(
              COALESCE(actual_duration_mins, 0) - COALESCE(paused_duration_mins, 0),
              0
            ) BETWEEN 5 AND 240
        )::text AS completed_net_in_range
      FROM focus_sessions
      `,
      [WINDOW_DAYS],
    );

    const sessionsTotal = n(coverage.sessions_total);
    const endedAtFilled = n(coverage.ended_at_filled);
    const prismPresetSet = n(coverage.prism_preset_set);
    const completedTotal = n(coverage.completed_total);
    const completedNetInRange = n(coverage.completed_net_in_range);
    const endedAtFilledPct = pct(endedAtFilled, sessionsTotal);
    const prismPresetCoveragePct = pct(prismPresetSet, sessionsTotal);
    const usableDurationPct = pct(completedNetInRange, completedTotal);

    const windowSessions = await queryOne<{
      started: string;
      completed: string;
      valid_efm: string;
      total_efm: string;
      mean_efm: string;
      prism_on: string;
      prism_off: string;
      prism_on_valid: string;
      prism_off_valid: string;
      mean_on: string;
      mean_off: string;
    }>(
      `
      ${EFM_CTE}
      SELECT
        COUNT(*)::text AS started,
        COUNT(*) FILTER (WHERE was_completed IS TRUE)::text AS completed,
        COUNT(*) FILTER (WHERE efm IS NOT NULL)::text AS valid_efm,
        COALESCE(SUM(efm) FILTER (WHERE efm IS NOT NULL), 0)::text AS total_efm,
        AVG(efm) FILTER (WHERE efm IS NOT NULL)::text AS mean_efm,
        COUNT(*) FILTER (WHERE prism_on)::text AS prism_on,
        COUNT(*) FILTER (WHERE NOT prism_on)::text AS prism_off,
        COUNT(*) FILTER (WHERE prism_on AND efm IS NOT NULL)::text AS prism_on_valid,
        COUNT(*) FILTER (WHERE NOT prism_on AND efm IS NOT NULL)::text AS prism_off_valid,
        AVG(efm) FILTER (WHERE prism_on AND efm IS NOT NULL)::text AS mean_on,
        AVG(efm) FILTER (WHERE NOT prism_on AND efm IS NOT NULL)::text AS mean_off
      FROM session_efm
      WHERE started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
      `,
      [WINDOW_DAYS],
    );

    const pad = await queryOne<{ pad_count: string; pad_users: string }>(
      `
      ${EFM_CTE},
      day_totals AS (
        SELECT
          user_id,
          study_day,
          SUM(efm) AS day_efm,
          COUNT(*) FILTER (WHERE efm IS NOT NULL) AS valid_sessions
        FROM session_efm
        WHERE efm IS NOT NULL
          AND started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        GROUP BY user_id, study_day
      )
      SELECT
        COUNT(*) FILTER (WHERE valid_sessions >= 1 AND day_efm >= 20)::text AS pad_count,
        COUNT(DISTINCT user_id) FILTER (
          WHERE valid_sessions >= 1 AND day_efm >= 20
        )::text AS pad_users
      FROM day_totals
      `,
      [WINDOW_DAYS],
    );

    const efmDaily = await querySeries(
      `
      ${EFM_CTE}
      SELECT study_day AS day, COALESCE(SUM(efm), 0) AS value
      FROM session_efm
      WHERE efm IS NOT NULL
        AND started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
      GROUP BY study_day
      ORDER BY study_day
      `,
      [WINDOW_DAYS],
    );

    const padDaily = await querySeries(
      `
      ${EFM_CTE},
      day_totals AS (
        SELECT
          user_id,
          study_day,
          SUM(efm) AS day_efm,
          COUNT(*) FILTER (WHERE efm IS NOT NULL) AS valid_sessions
        FROM session_efm
        WHERE efm IS NOT NULL
          AND started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        GROUP BY user_id, study_day
      )
      SELECT
        study_day AS day,
        COUNT(*) FILTER (WHERE valid_sessions >= 1 AND day_efm >= 20) AS value
      FROM day_totals
      GROUP BY study_day
      ORDER BY study_day
      `,
      [WINDOW_DAYS],
    );

    const sessionsStartedDaily = await querySeries(
      `
      SELECT (started_at AT TIME ZONE 'utc')::date AS day, COUNT(*)::float AS value
      FROM focus_sessions
      WHERE started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
      GROUP BY 1
      ORDER BY 1
      `,
      [WINDOW_DAYS],
    );

    const sessionsCompletedDaily = await querySeries(
      `
      SELECT (started_at AT TIME ZONE 'utc')::date AS day, COUNT(*)::float AS value
      FROM focus_sessions
      WHERE was_completed IS TRUE
        AND started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
      GROUP BY 1
      ORDER BY 1
      `,
      [WINDOW_DAYS],
    );

    const moodCheckinsDaily = await querySeries(
      `
      SELECT (created_at AT TIME ZONE 'utc')::date AS day, COUNT(*)::float AS value
      FROM mood_checkins
      WHERE created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
      GROUP BY 1
      ORDER BY 1
      `,
      [WINDOW_DAYS],
    );

    const tasksCompletedDaily = await querySeries(
      `
      SELECT (completed_at AT TIME ZONE 'utc')::date AS day, COUNT(*)::float AS value
      FROM tasks
      WHERE completed_at IS NOT NULL
        AND completed_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
      GROUP BY 1
      ORDER BY 1
      `,
      [WINDOW_DAYS],
    );

    const sessionsByWeekday = await querySeries(
      `
      SELECT
        ((EXTRACT(ISODOW FROM started_at AT TIME ZONE 'utc')::int))::text AS day,
        COUNT(*)::float AS value
      FROM focus_sessions
      WHERE started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
      GROUP BY 1
      ORDER BY 1
      `,
      [WINDOW_DAYS],
    );

    const moreRow = await queryOne<{
      unique_studiers: string;
      multi_session_users: string;
      sessions_with_task: string;
      sessions_with_course: string;
      mean_planned: string;
      plan_pairs: string;
      mean_adherence: string;
      mood_checkins: string;
      mood_users: string;
      mean_mood: string;
      mood_after_sessions: string;
      tasks_done: string;
      tasks_created: string;
      active_courses: string;
      presets: string;
      ada_sessions: string;
      notifications: string;
    }>(
      `
      SELECT
        (SELECT COUNT(DISTINCT user_id)::text FROM focus_sessions
          WHERE started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        ) AS unique_studiers,
        (SELECT COUNT(*)::text FROM (
          SELECT user_id FROM focus_sessions
          WHERE started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
          GROUP BY user_id HAVING COUNT(*) >= 2
        ) u) AS multi_session_users,
        (SELECT COUNT(*)::text FROM focus_sessions
          WHERE task_id IS NOT NULL
            AND started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        ) AS sessions_with_task,
        (SELECT COUNT(*)::text FROM focus_sessions
          WHERE course_id IS NOT NULL
            AND started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        ) AS sessions_with_course,
        (SELECT AVG(planned_duration_mins)::text FROM focus_sessions
          WHERE planned_duration_mins IS NOT NULL AND planned_duration_mins > 0
            AND started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        ) AS mean_planned,
        (SELECT COUNT(*)::text FROM focus_sessions
          WHERE was_completed IS TRUE
            AND planned_duration_mins > 0
            AND actual_duration_mins > 0
            AND started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        ) AS plan_pairs,
        (SELECT AVG(
            LEAST(actual_duration_mins::numeric / NULLIF(planned_duration_mins, 0), 2.0)
          )::text
          FROM focus_sessions
          WHERE was_completed IS TRUE
            AND planned_duration_mins > 0
            AND actual_duration_mins > 0
            AND started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        ) AS mean_adherence,
        (SELECT COUNT(*)::text FROM mood_checkins
          WHERE created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        ) AS mood_checkins,
        (SELECT COUNT(DISTINCT user_id)::text FROM mood_checkins
          WHERE created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        ) AS mood_users,
        (SELECT AVG(mood_score)::text FROM mood_checkins
          WHERE mood_score IS NOT NULL
            AND created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        ) AS mean_mood,
        (SELECT COUNT(*)::text FROM focus_sessions
          WHERE mood_after IS NOT NULL
            AND started_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        ) AS mood_after_sessions,
        (SELECT COUNT(*)::text FROM tasks
          WHERE completed_at IS NOT NULL
            AND completed_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        ) AS tasks_done,
        (SELECT COUNT(*)::text FROM tasks
          WHERE created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        ) AS tasks_created,
        (SELECT COUNT(*)::text FROM courses WHERE COALESCE(is_archived, false) = false) AS active_courses,
        (SELECT COUNT(*)::text FROM prism_presets) AS presets,
        (SELECT COUNT(*)::text FROM ada_sessions
          WHERE created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        ) AS ada_sessions,
        (SELECT COUNT(*)::text FROM notification_deliveries
          WHERE created_at >= (now() AT TIME ZONE 'utc') - make_interval(days => $1)
        ) AS notifications
      `,
      [WINDOW_DAYS],
    );

    // Simplified VAS: users with any dated activity / focus; check criteria in 14d from first activity
    const vas = await queryOne<{ vas_reached: string; vas_eligible: string }>(
      `
      ${EFM_CTE},
      first_activity AS (
        SELECT user_id, MIN(started_at) AS first_at
        FROM focus_sessions
        GROUP BY user_id
      ),
      user_flags AS (
        SELECT
          fa.user_id,
          fa.first_at,
          (
            SELECT COUNT(*)
            FROM courses c
            WHERE c.user_id = fa.user_id
              AND COALESCE(c.is_archived, false) = false
          ) AS courses_open,
          (
            SELECT COUNT(*)
            FROM tasks t
            WHERE t.user_id = fa.user_id
              AND (t.due_at IS NOT NULL OR t.scheduled_start_at IS NOT NULL)
              AND t.created_at < fa.first_at + interval '14 days'
          ) AS dated_tasks,
          (
            SELECT COUNT(*)
            FROM session_efm se
            WHERE se.user_id = fa.user_id
              AND se.efm IS NOT NULL
              AND se.started_at < fa.first_at + interval '14 days'
          ) AS valid_sessions,
          (
            SELECT COALESCE(SUM(se.efm), 0)
            FROM session_efm se
            WHERE se.user_id = fa.user_id
              AND se.efm IS NOT NULL
              AND se.started_at < fa.first_at + interval '14 days'
          ) AS total_efm,
          (
            SELECT COUNT(DISTINCT se.study_day)
            FROM session_efm se
            WHERE se.user_id = fa.user_id
              AND se.efm IS NOT NULL
              AND se.started_at < fa.first_at + interval '14 days'
          ) AS study_days
        FROM first_activity fa
      )
      SELECT
        COUNT(*)::text AS vas_eligible,
        COUNT(*) FILTER (
          WHERE courses_open >= 1
            AND dated_tasks >= 3
            AND valid_sessions >= 2
            AND total_efm >= 40
            AND study_days >= 3
        )::text AS vas_reached
      FROM user_flags
      `,
    );

    // H3: PAD in week W predicts activity in week W+1 (last 60d of completed EFM days)
    const h3 = await queryOne<{
      pad_weeks: string;
      return_next: string;
    }>(
      `
      ${EFM_CTE},
      day_totals AS (
        SELECT
          user_id,
          study_day,
          SUM(efm) AS day_efm
        FROM session_efm
        WHERE efm IS NOT NULL
          AND started_at >= (now() AT TIME ZONE 'utc') - interval '60 days'
        GROUP BY user_id, study_day
      ),
      pads AS (
        SELECT user_id, study_day
        FROM day_totals
        WHERE day_efm >= 20
      ),
      scored AS (
        SELECT
          p.user_id,
          p.study_day,
          EXISTS (
            SELECT 1
            FROM session_efm se
            WHERE se.user_id = p.user_id
              AND se.efm IS NOT NULL
              AND se.study_day > p.study_day
              AND se.study_day <= p.study_day + 7
          ) AS returned
        FROM pads p
      )
      SELECT
        COUNT(*)::text AS pad_weeks,
        COUNT(*) FILTER (WHERE returned)::text AS return_next
      FROM scored
      `,
    );

    const started = n(windowSessions.started);
    const completed = n(windowSessions.completed);
    const validEfm = n(windowSessions.valid_efm);
    const totalEfm = n(windowSessions.total_efm);
    const meanEfm = nOrNull(windowSessions.mean_efm);
    const prismOnValid = n(windowSessions.prism_on_valid);
    const prismOffValid = n(windowSessions.prism_off_valid);
    const meanOn = nOrNull(windowSessions.mean_on);
    const meanOff = nOrNull(windowSessions.mean_off);
    const vasReached = n(vas.vas_reached);
    const vasEligible = n(vas.vas_eligible);
    const padCount = n(pad.pad_count);
    const h3Pads = n(h3.pad_weeks);
    const h3Return = n(h3.return_next);

    const checks: ReadinessCheck[] = [
      {
        id: "actual_duration_usable",
        label: "Study minutes are wrong",
        status:
          completedTotal === 0
            ? "red"
            : (usableDurationPct ?? 0) < 20
              ? "red"
              : (usableDurationPct ?? 0) < 70
                ? "amber"
                : "green",
        rootCause:
          "When a timer finishes, the app usually saves 0 minutes instead of the real time.",
        proof:
          completedTotal === 0
            ? "No finished timers yet."
            : `${completedNetInRange} of ${completedTotal} finished timers have real minutes (need 5–240). Rest are mostly 0.`,
        fix: "Save the real duration when the timer ends.",
        priority: 1,
      },
      {
        id: "ended_at",
        label: "Session end time missing",
        status:
          !hasEndedAt || endedAtFilled === 0
            ? "red"
            : (endedAtFilledPct ?? 0) < 90
              ? "amber"
              : "green",
        rootCause: "We never save the clock time the focus session ended.",
        proof:
          endedAtFilled === 0
            ? `${endedAtFilled} of ${sessionsTotal} sessions have an end time (0%).`
            : `${endedAtFilled} of ${sessionsTotal} sessions have an end time (${endedAtFilledPct ?? 0}%).`,
        fix: "Write ended_at whenever a timer stops or finishes.",
        priority: 2,
      },
      {
        id: "prism_preset_coverage",
        label: "Don’t know if Prism was on",
        status:
          !hasPrismPreset || prismPresetSet === 0
            ? "red"
            : (prismPresetCoveragePct ?? 0) < 20
              ? "amber"
              : "green",
        rootCause: "Most sessions don’t record whether Prism sound was used.",
        proof: hasPrismPreset
          ? `Only ${prismPresetSet} of ${sessionsTotal} sessions (${prismPresetCoveragePct ?? 0}%) have a Prism preset saved.`
          : "No Prism on/off field on sessions.",
        fix: "Always save Prism on/off (or preset id) on every focus session.",
        priority: 3,
      },
      {
        id: "p1_control_arm",
        label: "No fair comparison group",
        status: hasExperiment ? "amber" : "red",
        rootCause:
          "Nobody is randomly given “Prism off” — so we can’t prove Prism caused better studying.",
        proof: hasExperiment
          ? "Some experiment tables may exist — not confirmed as a live control group."
          : "No control / experiment assignment in the database.",
        fix: "Turn Prism off on purpose for some % of sessions and store that.",
        priority: 4,
      },
      {
        id: "engine_version",
        label: "Prism version not tagged",
        status: hasEngineVersion ? "green" : "red",
        rootCause: hasEngineVersion
          ? "Sessions can store which Prism version ran."
          : "We don’t save which Prism software version ran on each session.",
        proof: hasEngineVersion
          ? "engine_version field exists on focus sessions."
          : "No engine_version on focus sessions.",
        fix: hasEngineVersion
          ? "Keep writing the version on every new session."
          : "Save engine version (or build id) on every session.",
        priority: 5,
      },
      {
        id: "p2_psv_control",
        label: "Prism state not logged",
        status: hasPsv ? "amber" : "red",
        rootCause: "Prism’s internal “how the student seemed” snapshot is not stored.",
        proof: hasPsv
          ? "A state-log table may exist — confirm it fills every session."
          : "No Prism state / PCE tables in the database.",
        fix: "Log a state snapshot on every focus session.",
        priority: 6,
      },
      {
        id: "p3_feature_psv",
        label: "Engine inputs not saved",
        status: hasPsv ? "amber" : "red",
        rootCause: "We can’t replay what Prism saw and decided in a past session.",
        proof: hasPsv
          ? "Possible storage found — not confirmed on every session."
          : "No per-session engine input store.",
        fix: "Save engine inputs + state with each session.",
        priority: 7,
      },
      {
        id: "p4_authority",
        label: "Don’t know how hard Prism pushed",
        status: hasAuthority ? "amber" : "red",
        rootCause: "We don’t log how strongly Prism changed each control.",
        proof: hasAuthority
          ? "Authority field/table exists — confirm it is filled."
          : "No authority logging in the database.",
        fix: "Log authority values on every actuated session.",
        priority: 8,
      },
      {
        id: "p6_probes",
        label: "No feel check-ins",
        status: hasProbe ? "amber" : "red",
        rootCause: "Students aren’t asked short “how do you feel?” questions after sessions.",
        proof: hasProbe
          ? "A check-in table exists — confirm users actually see questions."
          : "No ground-truth check-in tables.",
        fix: "Ask occasional in-app check-ins and save answers on the session.",
        priority: 9,
      },
    ];

    const summary = {
      green: checks.filter((c) => c.status === "green").length,
      amber: checks.filter((c) => c.status === "amber").length,
      red: checks.filter((c) => c.status === "red").length,
    };

    const hypotheses: Hypothesis[] = [
      {
        id: "H1",
        claim: "Do people study more minutes when Prism sound is on?",
        status: prismOnValid < 30 ? "weak" : "testable",
        detail:
          prismOnValid < 30
            ? `Not enough data yet — only ${prismOnValid} usable Prism-on session(s) (we want ~30+). Even then this would be a correlation, not proof Prism caused it.`
            : "We have enough Prism-tagged sessions to compare averages — still not proof of cause.",
        evidence: {
          n_prism_valid: prismOnValid,
          n_off_valid: prismOffValid,
          mean_efm_prism_on: meanOn,
          mean_efm_prism_off: meanOff,
        },
      },
      {
        id: "H2",
        claim: "Does a true “no Prism” control group study less than people who got Prism?",
        status: "blocked",
        detail: hasExperiment
          ? "There may be experiment tables — confirm a real control group before answering."
          : "Blocked. We never randomly turn Prism off for some sessions, so we cannot answer this yet.",
        evidence: {
          control_arm_present: hasExperiment ? 1 : 0,
        },
      },
      {
        id: "H3",
        claim: "If someone has a productive study day, do they come back within a week?",
        status: h3Pads >= 5 ? "testable" : "weak",
        detail:
          h3Pads === 0
            ? "No productive days to check yet."
            : `Of ${h3Pads} productive day(s), ${h3Return} were followed by more studying within 7 days. Need more productive days before trusting this.`,
        evidence: {
          pad_days: h3Pads,
          returned_within_7d: h3Return,
          return_rate_pct: pct(h3Return, h3Pads),
        },
      },
    ];

    const pauseNonzero = n(coverage.pause_nonzero);
    const interruptNonzero = n(coverage.interrupt_nonzero);

    const minutesHealthy = (usableDurationPct ?? 0) >= 70;
    const minutesPartial = (usableDurationPct ?? 0) >= 20;
    const prismTaggedEnough = prismOnValid >= 30 && prismOffValid >= 30;
    const padEnough = h3Pads >= 5;
    const endedHealthy = (endedAtFilledPct ?? 0) >= 90;

    const unlocks: UnlockInsight[] = [
      {
        id: "real_minutes_trend",
        title: "Real study minutes over time",
        whatYouGet:
          "A day-by-day chart of trusted study minutes for Aqademiq students — the basic health signal after timers stop saving 0.",
        needs: "Finish timers must save real duration (and ideally ended_at).",
        status: minutesHealthy ? "live" : minutesPartial ? "waiting" : "waiting",
        badge: minutesHealthy
          ? "Live from DB"
          : "Ready — waiting on minute logging",
        now: `${validEfm} usable sessions · ${Math.round(totalEfm)} total EFM in ${WINDOW_DAYS}d`,
        bars: [
          { name: "Usable", value: completedNetInRange },
          {
            name: "Broken",
            value: Math.max(completedTotal - completedNetInRange, 0),
          },
        ],
      },
      {
        id: "prism_on_vs_off",
        title: "Did Prism-on sessions study longer?",
        whatYouGet:
          "Side-by-side average real study minutes: Prism sound on vs off. First answer to “how did Prism help?” (associational — not full proof).",
        needs: "Always tag Prism on/off + usable minutes on both sides (~30+ each).",
        status: prismTaggedEnough
          ? "live"
          : minutesPartial
            ? "waiting"
            : "waiting",
        badge: prismTaggedEnough
          ? "Live from DB"
          : "Ready — waiting on Prism tags + minutes",
        now: `Mean EFM on/off: ${meanOn == null ? "—" : Math.round(meanOn * 10) / 10} / ${meanOff == null ? "—" : Math.round(meanOff * 10) / 10} · n=${prismOnValid}/${prismOffValid}`,
        bars: [
          {
            name: "Prism on",
            value: meanOn == null ? 0 : Math.round(meanOn * 10) / 10,
          },
          {
            name: "Prism off",
            value: meanOff == null ? 0 : Math.round(meanOff * 10) / 10,
          },
        ],
      },
      {
        id: "productive_return",
        title: "Productive day → come back next week?",
        whatYouGet:
          "After a day with 20+ real study minutes, how often does the student study again within 7 days? Habit signal for Aqademiq.",
        needs: "Usable minutes so productive days (PAD) exist in volume.",
        status: padEnough ? "live" : "waiting",
        badge: padEnough
          ? "Live from DB"
          : "Ready — waiting on productive days",
        now: `${h3Return}/${h3Pads} PAD days had a return within 7d (${pct(h3Return, h3Pads) ?? 0}%)`,
        bars: [
          { name: "Returned", value: h3Return },
          { name: "No return", value: Math.max(h3Pads - h3Return, 0) },
        ],
      },
      {
        id: "started_for_real",
        title: "Started studying for real (activation)",
        whatYouGet:
          "% of students who, in their first 14 days, look like real users (course + tasks + several study days with enough minutes).",
        needs: "Usable minutes + dated tasks/courses (courses/tasks already exist).",
        status: vasEligible >= 10 && minutesPartial ? "live" : "waiting",
        badge:
          vasEligible >= 10 && minutesPartial
            ? "Live from DB"
            : "Ready — waiting on minutes for the bar to mean something",
        now: `${vasReached}/${vasEligible} reached (${pct(vasReached, vasEligible) ?? 0}%)`,
        bars: [
          { name: "Reached", value: vasReached },
          {
            name: "Not yet",
            value: Math.max(vasEligible - vasReached, 0),
          },
        ],
      },
      {
        id: "end_time_quality",
        title: "Strict session timing",
        whatYouGet:
          "Study minutes capped by real start→end clock time (not only the minutes field). Cleaner Prism-time science.",
        needs: "ended_at filled on ~all focus sessions.",
        status: endedHealthy ? "live" : "waiting",
        badge: endedHealthy
          ? "Live from DB"
          : "Ready — waiting on ended_at",
        now: `${endedAtFilled}/${sessionsTotal} sessions have end time (${endedAtFilledPct ?? 0}%)`,
        bars: [
          { name: "Has end", value: endedAtFilled },
          {
            name: "Missing",
            value: Math.max(sessionsTotal - endedAtFilled, 0),
          },
        ],
      },
      {
        id: "control_causal",
        title: "True proof: control vs Prism",
        whatYouGet:
          "Fair test — some sessions randomly without Prism. Compare EFM. This is the only honest “Prism caused help” claim.",
        needs: "Control arm in product + logging assignment on each session.",
        status: "blocked",
        badge: "Blocked — needs control arm in product",
        now: hasExperiment
          ? "Experiment tables may exist — not confirmed as a live control cut."
          : "No control / experiment assignment in DB.",
        bars: [
          { name: "Control", value: 0 },
          { name: "Prism", value: 0 },
        ],
      },
      {
        id: "engine_version_ab",
        title: "Which Prism version helped more?",
        whatYouGet:
          "Compare real study minutes across Prism software versions after you ship engine changes.",
        needs: "engine_version written on every focus session.",
        status: hasEngineVersion ? "waiting" : "blocked",
        badge: hasEngineVersion
          ? "Ready — waiting on volume per version"
          : "Blocked — no engine_version field",
        now: hasEngineVersion
          ? "Field exists — fill it on every new session."
          : "focus_sessions has no engine_version.",
        bars: [
          { name: "vA", value: 0 },
          { name: "vB", value: 0 },
        ],
      },
      {
        id: "feel_probes",
        title: "Did students feel more focused with Prism?",
        whatYouGet:
          "Link short “how do you feel?” check-ins to Prism-on sessions and study minutes.",
        needs: "Occasional in-app feel/focus probes saved on the session.",
        status: hasProbe ? "waiting" : "blocked",
        badge: hasProbe
          ? "Ready — waiting on probe answers"
          : "Blocked — no probe tables",
        now: hasProbe
          ? "Probe table may exist — confirm users get questions."
          : "No ground-truth probe tables.",
        bars: [
          { name: "Focused", value: 0 },
          { name: "Not", value: 0 },
        ],
      },
      {
        id: "plan_vs_actual",
        title: "Planned timer vs actual study time",
        whatYouGet:
          "Did students hit the minutes they planned? Adherence % = actual ÷ planned on finished sessions.",
        needs: "actual_duration_mins filled (planned already exists on most sessions).",
        status: n(moreRow.plan_pairs) >= 20 ? "live" : "waiting",
        badge:
          n(moreRow.plan_pairs) >= 20
            ? "Live from DB"
            : "Ready — waiting on actual minutes",
        now: `${n(moreRow.plan_pairs)} sessions with both planned+actual · adherence ${
          nOrNull(moreRow.mean_adherence) == null
            ? "—"
            : `${Math.round(n(moreRow.mean_adherence) * 1000) / 10}%`
        }`,
        bars: [
          {
            name: "Planned avg",
            value:
              nOrNull(moreRow.mean_planned) == null
                ? 0
                : Math.round(n(moreRow.mean_planned) * 10) / 10,
          },
          {
            name: "Pairs",
            value: n(moreRow.plan_pairs),
          },
        ],
      },
      {
        id: "task_linked_study",
        title: "Study linked to a real task",
        whatYouGet:
          "Share of focus sessions tied to a task — Prism helping with planned work, not idle timers.",
        needs: "App keeps linking task_id on focus sessions (already partial).",
        status: started > 0 ? "live" : "waiting",
        badge: started > 0 ? "Live from DB" : "Ready — waiting on sessions",
        now: `${n(moreRow.sessions_with_task)}/${started} sessions linked to a task`,
        bars: [
          { name: "With task", value: n(moreRow.sessions_with_task) },
          {
            name: "No task",
            value: Math.max(started - n(moreRow.sessions_with_task), 0),
          },
        ],
      },
      {
        id: "repeat_studiers",
        title: "Students who came back to study",
        whatYouGet:
          "How many unique studiers had 2+ focus sessions — early habit / retention signal.",
        needs: "Focus sessions keep flowing (already live).",
        status: n(moreRow.unique_studiers) >= 3 ? "live" : "waiting",
        badge:
          n(moreRow.unique_studiers) >= 3
            ? "Live from DB"
            : "Ready — waiting on more studiers",
        now: `${n(moreRow.multi_session_users)} of ${n(moreRow.unique_studiers)} studiers had 2+ sessions`,
        bars: [
          { name: "Repeat", value: n(moreRow.multi_session_users) },
          {
            name: "Once only",
            value: Math.max(
              n(moreRow.unique_studiers) - n(moreRow.multi_session_users),
              0,
            ),
          },
        ],
      },
      {
        id: "mood_pulse",
        title: "Mood check-ins while studying",
        whatYouGet:
          "Mood score trends next to study minutes / Prism-on days — soft signal of how students feel.",
        needs: "mood_checkins keep writing (table live); link more to focus_session_id.",
        status: n(moreRow.mood_checkins) >= 5 ? "live" : "waiting",
        badge:
          n(moreRow.mood_checkins) >= 5
            ? "Live from DB"
            : "Ready — waiting on mood volume",
        now: `${n(moreRow.mood_checkins)} check-ins · ${n(moreRow.mood_users)} users · avg score ${
          nOrNull(moreRow.mean_mood) == null
            ? "—"
            : Math.round(n(moreRow.mean_mood) * 10) / 10
        }`,
        bars: [
          { name: "Check-ins", value: n(moreRow.mood_checkins) },
          { name: "Users", value: n(moreRow.mood_users) },
        ],
      },
      {
        id: "tasks_done",
        title: "Tasks completed alongside focus",
        whatYouGet:
          "Task completions in the same window as focus — Aqademiq output signal next to Prism time.",
        needs: "Tasks keep completing (already live).",
        status: n(moreRow.tasks_done) >= 1 ? "live" : "waiting",
        badge:
          n(moreRow.tasks_done) >= 1 ? "Live from DB" : "Ready — waiting on completions",
        now: `${n(moreRow.tasks_done)} tasks completed · ${n(moreRow.tasks_created)} created in ${WINDOW_DAYS}d`,
        bars: [
          { name: "Done", value: n(moreRow.tasks_done) },
          { name: "Created", value: n(moreRow.tasks_created) },
        ],
      },
      {
        id: "weekday_pattern",
        title: "Which weekdays students open the timer",
        whatYouGet:
          "Heat of focus starts by weekday — when to nudge or when Prism load is highest.",
        needs: "Focus session starts (already live).",
        status: started >= 5 ? "live" : "waiting",
        badge: started >= 5 ? "Live from DB" : "Ready — waiting on volume",
        now: `${started} sessions in window across weekdays`,
        bars: sessionsByWeekday.slice(0, 7).map((p) => ({
          name: ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
            Number(p.day)
          ] ?? p.day,
          value: p.value,
        })),
      },
    ];

    const uniqueStudiers = n(moreRow.unique_studiers);
    const meanSessionsPerStudier =
      uniqueStudiers === 0 ? null : Math.round((started / uniqueStudiers) * 10) / 10;
    const meanAdherence = nOrNull(moreRow.mean_adherence);
    const planAdherencePct =
      meanAdherence == null ? null : Math.round(meanAdherence * 1000) / 10;

    return {
      meta: {
        asOf,
        windowDays: WINDOW_DAYS,
        source: "aqademiq-postgres",
        vertical: "prism",
        error: null,
      },
      readiness: { checks, summary },
      outcomes: {
        sessionsStarted: started,
        sessionsCompleted: completed,
        timerFinishRate: pct(completed, started),
        validEfmSessions: validEfm,
        totalEfm: Math.round(totalEfm * 10) / 10,
        meanEfmPerValidSession:
          meanEfm == null ? null : Math.round(meanEfm * 10) / 10,
        padCount,
        padUsers: n(pad.pad_users),
        prismOnSessions: n(windowSessions.prism_on),
        prismOffSessions: n(windowSessions.prism_off),
        prismOnValidEfm: prismOnValid,
        prismOffValidEfm: prismOffValid,
        meanEfmPrismOn: meanOn == null ? null : Math.round(meanOn * 10) / 10,
        meanEfmPrismOff: meanOff == null ? null : Math.round(meanOff * 10) / 10,
        endedAtFilledPct,
        prismPresetCoveragePct,
        vasReached,
        vasEligible,
        vasRate: pct(vasReached, vasEligible),
        instrumentationNote:
          pauseNonzero === 0 && interruptNonzero === 0
            ? "Heads-up: the app almost never records pauses or interruptions, so we cannot tell “smooth focus” from “interrupted focus” yet. Real study minutes still use the simple formula."
            : `Some sessions recorded pauses (${pauseNonzero}) or interruptions (${interruptNonzero}).`,
        gaps: {
          sessionsTotal,
          completedUsableMins: completedNetInRange,
          completedUnusableMins: Math.max(completedTotal - completedNetInRange, 0),
          endedAtFilled,
          endedAtMissing: Math.max(sessionsTotal - endedAtFilled, 0),
          prismTagged: prismPresetSet,
          prismUntagged: Math.max(sessionsTotal - prismPresetSet, 0),
        },
        series: {
          efmDaily,
          padDaily,
          sessionsStartedDaily,
          sessionsCompletedDaily,
          moodCheckinsDaily,
          tasksCompletedDaily,
          sessionsByWeekday: sessionsByWeekday.map((p) => ({
            day: ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][
              Number(p.day)
            ] ?? p.day,
            value: p.value,
          })),
        },
        more: {
          uniqueStudiers,
          multiSessionUsers: n(moreRow.multi_session_users),
          meanSessionsPerStudier,
          sessionsWithTask: n(moreRow.sessions_with_task),
          sessionsWithCourse: n(moreRow.sessions_with_course),
          meanPlannedMins:
            nOrNull(moreRow.mean_planned) == null
              ? null
              : Math.round(n(moreRow.mean_planned) * 10) / 10,
          planAdherencePct,
          plannedVsActualPairs: n(moreRow.plan_pairs),
          moodCheckins: n(moreRow.mood_checkins),
          moodCheckinUsers: n(moreRow.mood_users),
          meanMoodScore:
            nOrNull(moreRow.mean_mood) == null
              ? null
              : Math.round(n(moreRow.mean_mood) * 10) / 10,
          sessionsWithMoodAfter: n(moreRow.mood_after_sessions),
          tasksCompletedWindow: n(moreRow.tasks_done),
          tasksCreatedWindow: n(moreRow.tasks_created),
          activeCourses: n(moreRow.active_courses),
          prismPresetsAvailable: n(moreRow.presets),
          adaSessionsWindow: n(moreRow.ada_sessions),
          notificationsWindow: n(moreRow.notifications),
        },
      },
      hypotheses,
      unlocks,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown metrics error";
    return emptyMetrics(message);
  }
}
