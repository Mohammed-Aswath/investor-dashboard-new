export type NullableNumber = number | null;

export type DayPoint = {
  day: string; // YYYY-MM-DD
  value: number;
};

export type MetricsPayload = {
  meta: {
    asOf: string;
    windowDays: number;
    source: string;
    preRelease: boolean;
    error: string | null;
  };
  growth: {
    registeredUsers: number;
    guestUsers: number;
    onboardedUsers: number;
    onboardingRate: NullableNumber;
    signupsInWindow: number;
    guestsInWindow: number;
    referredSignupsInWindow: number;
    referralShare: NullableNumber;
  };
  activity: {
    dau: number;
    wau: number;
    mau: number;
    mauBehaviorFallback: number;
    mauSource: "daily_activity_snapshots" | "behavior_fallback";
    stickinessDauMau: NullableNumber;
    stickinessWauMau: NullableNumber;
  };
  retention: {
    d1: NullableNumber;
    d1CohortSize: number;
    d7: NullableNumber;
    d7CohortSize: number;
    d30: NullableNumber;
    d30CohortSize: number;
  };
  activation: {
    newRegisteredInWindow: number;
    activatedFirstFocus24h: number;
    firstFocus24hRate: NullableNumber;
    guestsCompletedFocusStillGuest: number;
    registeredWithCompletedFocus: number;
  };
  engagement: {
    focusSessionsStarted: number;
    focusSessionsCompleted: number;
    focusCompletionRate: NullableNumber;
    focusMinutesTotal: number;
    tasksCreated: number;
    tasksCompleted: number;
    adaSessions: number;
    adaUserMessages: number;
    adaPlanItemsSuggested: number;
    adaPlanItemsApplied: number;
    adaPlanApplyRate: NullableNumber;
    moodCheckins: number;
    referralRedemptions: number;
  };
  monetization: {
    status: "pre-revenue";
    mrrUsd: null;
    payingCustomers: null;
    arpuUsd: null;
  };
  series: {
    signupsDaily: DayPoint[];
    activeUsersDaily: DayPoint[];
    focusMinutesDaily: DayPoint[];
    tasksCompletedDaily: DayPoint[];
  };
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
      preRelease: true,
      error,
    },
    growth: {
      registeredUsers: 0,
      guestUsers: 0,
      onboardedUsers: 0,
      onboardingRate: null,
      signupsInWindow: 0,
      guestsInWindow: 0,
      referredSignupsInWindow: 0,
      referralShare: null,
    },
    activity: {
      dau: 0,
      wau: 0,
      mau: 0,
      mauBehaviorFallback: 0,
      mauSource: "daily_activity_snapshots",
      stickinessDauMau: null,
      stickinessWauMau: null,
    },
    retention: {
      d1: null,
      d1CohortSize: 0,
      d7: null,
      d7CohortSize: 0,
      d30: null,
      d30CohortSize: 0,
    },
    activation: {
      newRegisteredInWindow: 0,
      activatedFirstFocus24h: 0,
      firstFocus24hRate: null,
      guestsCompletedFocusStillGuest: 0,
      registeredWithCompletedFocus: 0,
    },
    engagement: {
      focusSessionsStarted: 0,
      focusSessionsCompleted: 0,
      focusCompletionRate: null,
      focusMinutesTotal: 0,
      tasksCreated: 0,
      tasksCompleted: 0,
      adaSessions: 0,
      adaUserMessages: 0,
      adaPlanItemsSuggested: 0,
      adaPlanItemsApplied: 0,
      adaPlanApplyRate: null,
      moodCheckins: 0,
      referralRedemptions: 0,
    },
    monetization: {
      status: "pre-revenue",
      mrrUsd: null,
      payingCustomers: null,
      arpuUsd: null,
    },
    series: {
      signupsDaily: [],
      activeUsersDaily: [],
      focusMinutesDaily: [],
      tasksCompletedDaily: [],
    },
  };
}
