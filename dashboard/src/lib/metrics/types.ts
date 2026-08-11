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
    series: {
      efmDaily: DayPoint[];
      padDaily: DayPoint[];
    };
  };
  hypotheses: Hypothesis[];
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
      series: { efmDaily: [], padDaily: [] },
    },
    hypotheses: [],
  };
}
