import { getPool, queryOne } from "../db";
import {
  emptyMetrics,
  pct,
  type DayPoint,
  type Hypothesis,
  type MetricsPayload,
  type ReadinessCheck,
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
        series: { efmDaily, padDaily },
      },
      hypotheses,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown metrics error";
    return emptyMetrics(message);
  }
}
