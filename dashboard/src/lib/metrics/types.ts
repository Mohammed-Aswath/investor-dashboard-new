export type NullableNumber = number | null;

export type ReadinessStatus = "green" | "amber" | "red";

export type ReadinessCheck = {
  id: string;
  label: string;
  status: ReadinessStatus;
  /** One-line: what broke / what’s missing (root cause) */
  rootCause: string;
  /** One-line proof from the DB (numbers) */
  proof: string;
  /** One-line fix */
  fix: string;
  /** 1 = fix first */
  priority: number;
};

export type HypothesisStatus = "testable" | "weak" | "blocked";

export type Hypothesis = {
  id: string;
  claim: string;
  status: HypothesisStatus;
  detail: string;
  evidence: Record<string, number | null>;
};

/** Analyses wired to live SQL — light up when DB tracking is fixed */
export type UnlockStatus = "live" | "waiting" | "blocked";

export type UnlockInsight = {
  id: string;
  title: string;
  /** What Prism Proof Desk will show once unlocked */
  whatYouGet: string;
  /** What must be fixed in the product/DB */
  needs: string;
  status: UnlockStatus;
  /** Short label for badge */
  badge: string;
  /** One-line truth from DB right now */
  now: string;
  /** Optional bar pairs for a mini chart (name/value) */
  bars: Array<{ name: string; value: number }>;
};

export type DayPoint = {
  day: string;
  value: number;
};

export type MetricsPayload = {
  meta: {
    asOf: string;
    windowDays: number;
    source: string;
    vertical: "prism";
    error: string | null;
  };
  readiness: {
    checks: ReadinessCheck[];
    summary: {
      green: number;
      amber: number;
      red: number;
    };
  };
  outcomes: {
    sessionsStarted: number;
    sessionsCompleted: number;
    timerFinishRate: NullableNumber;
    validEfmSessions: number;
    totalEfm: number;
    meanEfmPerValidSession: NullableNumber;
    padCount: number;
    padUsers: number;
    prismOnSessions: number;
    prismOffSessions: number;
    prismOnValidEfm: number;
    prismOffValidEfm: number;
    meanEfmPrismOn: NullableNumber;
    meanEfmPrismOff: NullableNumber;
    endedAtFilledPct: NullableNumber;
    prismPresetCoveragePct: NullableNumber;
    vasReached: number;
    vasEligible: number;
    vasRate: NullableNumber;
    instrumentationNote: string;
    /** Counts for “what’s missing” charts */
    gaps: {
      sessionsTotal: number;
      completedUsableMins: number;
      completedUnusableMins: number;
      endedAtFilled: number;
      endedAtMissing: number;
      prismTagged: number;
      prismUntagged: number;
    };
    series: {
      efmDaily: DayPoint[];
      padDaily: DayPoint[];
      sessionsStartedDaily: DayPoint[];
      sessionsCompletedDaily: DayPoint[];
      moodCheckinsDaily: DayPoint[];
      tasksCompletedDaily: DayPoint[];
      sessionsByWeekday: DayPoint[];
    };
    /** Extra live metrics from Aqademiq tables */
    more: {
      uniqueStudiers: number;
      multiSessionUsers: number;
      meanSessionsPerStudier: NullableNumber;
      sessionsWithTask: number;
      sessionsWithCourse: number;
      meanPlannedMins: NullableNumber;
      planAdherencePct: NullableNumber;
      plannedVsActualPairs: number;
      moodCheckins: number;
      moodCheckinUsers: number;
      meanMoodScore: NullableNumber;
      sessionsWithMoodAfter: number;
      tasksCompletedWindow: number;
      tasksCreatedWindow: number;
      activeCourses: number;
      prismPresetsAvailable: number;
      adaSessionsWindow: number;
      notificationsWindow: number;
    };
  };
  hypotheses: Hypothesis[];
  /** Pre-built “when DB is fixed” insights — already computing from SQL */
  unlocks: UnlockInsight[];
};

export function pct(
  numer: number | null | undefined,
  denom: number | null | undefined,
): NullableNumber {
  if (numer == null || denom == null || denom === 0) return null;
  return Math.round((1000 * numer) / denom) / 10;
}

export function emptyMetrics(error: string | null): MetricsPayload {
  return {
    meta: {
      asOf: new Date().toISOString(),
      windowDays: 30,
      source: "unavailable",
      vertical: "prism",
      error,
    },
    readiness: {
      checks: [],
      summary: { green: 0, amber: 0, red: 0 },
    },
    outcomes: {
      sessionsStarted: 0,
      sessionsCompleted: 0,
      timerFinishRate: null,
      validEfmSessions: 0,
      totalEfm: 0,
      meanEfmPerValidSession: null,
      padCount: 0,
      padUsers: 0,
      prismOnSessions: 0,
      prismOffSessions: 0,
      prismOnValidEfm: 0,
      prismOffValidEfm: 0,
      meanEfmPrismOn: null,
      meanEfmPrismOff: null,
      endedAtFilledPct: null,
      prismPresetCoveragePct: null,
      vasReached: 0,
      vasEligible: 0,
      vasRate: null,
      instrumentationNote: "",
      gaps: {
        sessionsTotal: 0,
        completedUsableMins: 0,
        completedUnusableMins: 0,
        endedAtFilled: 0,
        endedAtMissing: 0,
        prismTagged: 0,
        prismUntagged: 0,
      },
      series: {
        efmDaily: [],
        padDaily: [],
        sessionsStartedDaily: [],
        sessionsCompletedDaily: [],
        moodCheckinsDaily: [],
        tasksCompletedDaily: [],
        sessionsByWeekday: [],
      },
      more: {
        uniqueStudiers: 0,
        multiSessionUsers: 0,
        meanSessionsPerStudier: null,
        sessionsWithTask: 0,
        sessionsWithCourse: 0,
        meanPlannedMins: null,
        planAdherencePct: null,
        plannedVsActualPairs: 0,
        moodCheckins: 0,
        moodCheckinUsers: 0,
        meanMoodScore: null,
        sessionsWithMoodAfter: 0,
        tasksCompletedWindow: 0,
        tasksCreatedWindow: 0,
        activeCourses: 0,
        prismPresetsAvailable: 0,
        adaSessionsWindow: 0,
        notificationsWindow: 0,
      },
    },
    hypotheses: [],
    unlocks: [],
  };
}
