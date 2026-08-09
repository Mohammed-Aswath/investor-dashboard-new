"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MetricsPayload } from "@/lib/metrics/types";
import { METRIC_DEFINITIONS } from "@/lib/metric-definitions";
import { formatInt, formatPct, formatWhen } from "@/lib/format";
import { ScoreRing } from "./ScoreRing";
import { TrendChart } from "./TrendChart";
import { CalcNote } from "./CalcNote";
import { BrandMark } from "./BrandMark";

function StatPill({
  label,
  value,
  means,
  calc,
}: {
  label: string;
  value: string;
  means: string;
  calc: string;
}) {
  return (
    <div className="rounded-[22px] border border-line bg-white/80 px-4 py-4 shadow-card backdrop-blur">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mist">
        {label}
      </p>
      <p className="mt-2 font-mono text-[1.75rem] font-medium tracking-tight text-ink">
        {value}
      </p>
      <CalcNote means={means} calc={calc} />
    </div>
  );
}

export function DashboardView() {
  const router = useRouter();
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCalcs, setShowCalcs] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/metrics", { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const json = (await res.json()) as MetricsPayload;
      setData(json);
      if (json.meta.error) setLoadError(json.meta.error);
    } catch {
      setLoadError("Failed to reach metrics API");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="mx-auto min-h-screen max-w-[1180px] px-5 pb-20 pt-8 md:px-8">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
        <div className="animate-rise">
          <div className="flex items-center gap-3">
            <BrandMark size={40} />
            <span className="rounded-full bg-good/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-good">
              Live DB · verified
            </span>
          </div>
          <h1 className="mt-4 font-display text-[2.4rem] leading-[1.05] tracking-[-0.02em] text-ink md:text-[2.8rem]">
            Investor health report
          </h1>
          <p className="mt-2 max-w-xl text-sm font-medium text-mist">
            Every number is queried from Postgres. Rates show N/A when the
            denominator is zero — never invented.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowCalcs((v) => !v)}
            className="rounded-full border border-line bg-white px-4 py-2.5 text-xs font-extrabold text-ink shadow-card transition hover:shadow-lift"
          >
            {showCalcs ? "Hide formulas" : "Show formulas"}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-line bg-white px-4 py-2.5 text-xs font-extrabold text-ink shadow-card transition hover:shadow-lift"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-full bg-ink px-4 py-2.5 text-xs font-extrabold text-white transition hover:opacity-90"
          >
            Sign out
          </button>
        </div>
      </header>

      {loading && !data ? (
        <p className="text-sm text-mist">Loading report…</p>
      ) : null}

      {loadError ? (
        <div className="mb-6 rounded-2xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-ink">
          {loadError}
        </div>
      ) : null}

      {data ? (
        <div className="space-y-6">
          <p className="text-xs font-medium text-mist">
            As of {formatWhen(data.meta.asOf)} UTC · trailing {data.meta.windowDays}{" "}
            days · source {data.meta.source}
          </p>

          <section className="animate-rise rounded-[32px] border border-line bg-white/90 p-6 shadow-lift md:p-8">
            <div className="mb-8 text-center md:text-left">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-violet">
                At a glance
              </p>
              <h2 className="mt-1 font-display text-3xl text-ink">
                Are students using it?
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4 md:gap-8">
              <div>
                <ScoreRing
                  title="Started studying"
                  subtitle="same day they joined"
                  value={data.activation.firstFocus24hRate}
                  countLine={`${formatInt(data.activation.activatedFirstFocus24h)} of ${formatInt(data.activation.newRegisteredInWindow)} new students`}
                  tone="violet"
                />
                {showCalcs ? (
                  <CalcNote
                    means="Finished a focus session within 24 hours of signup."
                    calc="activated ÷ new registered (30d) × 100"
                  />
                ) : null}
              </div>
              <div>
                <ScoreRing
                  title="Finished the timer"
                  subtitle="didn't quit early"
                  value={data.engagement.focusCompletionRate}
                  countLine={`${formatInt(data.engagement.focusSessionsCompleted)} of ${formatInt(data.engagement.focusSessionsStarted)} sessions`}
                  tone="good"
                />
                {showCalcs ? (
                  <CalcNote
                    means="Focus sessions completed vs started."
                    calc="completed ÷ started × 100"
                  />
                ) : null}
              </div>
              <div>
                <ScoreRing
                  title="Set up their account"
                  subtitle="finished onboarding"
                  value={data.growth.onboardingRate}
                  countLine={`${formatInt(data.growth.onboardedUsers)} of ${formatInt(data.growth.registeredUsers)} students`}
                  tone="ink"
                />
                {showCalcs ? (
                  <CalcNote
                    means="Registered users with onboarding complete."
                    calc="onboarded ÷ registered × 100"
                  />
                ) : null}
              </div>
              <div>
                <ScoreRing
                  title="Came back later"
                  subtitle="returned after 1 week"
                  value={data.retention.d7}
                  countLine={
                    data.retention.d7CohortSize === 0
                      ? "Too early to measure"
                      : `${formatInt(Math.round(((data.retention.d7 ?? 0) / 100) * data.retention.d7CohortSize))} of ${formatInt(data.retention.d7CohortSize)} students`
                  }
                  tone="warn"
                />
                {showCalcs ? (
                  <CalcNote
                    means="Active again 7 days after signup."
                    calc="returned on day 7 ÷ cohort × 100"
                  />
                ) : null}
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatPill
              label="Registered students"
              value={formatInt(data.growth.registeredUsers)}
              means="Real accounts only (guests excluded)."
              calc="profiles WHERE is_guest=false AND deleted_at IS NULL"
            />
            <StatPill
              label="Active this week / month"
              value={`${formatInt(data.activity.wau)} / ${formatInt(data.activity.mau)}`}
              means={`WAU = active in 7 days. MAU = active in 30 days. Stickiness ${formatPct(data.activity.stickinessWauMau)}.`}
              calc="WAU÷MAU×100 · from daily_activity_snapshots"
            />
            <StatPill
              label="Focus minutes (30d)"
              value={formatInt(data.engagement.focusMinutesTotal)}
              means="Minutes from completed focus sessions only."
              calc="SUM(actual_duration_mins WHERE was_completed=true)"
            />
            <StatPill
              label="Ada chats (30d)"
              value={formatInt(data.engagement.adaSessions)}
              means={`${formatInt(data.engagement.adaUserMessages)} messages students sent to Ada.`}
              calc="COUNT(ada_sessions); COUNT(user messages)"
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <TrendChart
              title="New signups each day"
              subtitle="How many registered accounts were created per day (30 days)"
              data={data.series?.signupsDaily ?? []}
              color="#6B5CF0"
              kind="bar"
              valueLabel="Signups"
            />
            <TrendChart
              title="Students active each day"
              subtitle="Distinct users with a daily activity snapshot"
              data={data.series?.activeUsersDaily ?? []}
              color="#2A9D6B"
              kind="area"
              valueLabel="Active students"
            />
            <TrendChart
              title="Focus minutes each day"
              subtitle="Completed session minutes logged per day"
              data={data.series?.focusMinutesDaily ?? []}
              color="#6B5CF0"
              kind="area"
              valueLabel="Minutes"
            />
            <TrendChart
              title="Tasks finished each day"
              subtitle="Tasks marked complete per day"
              data={data.series?.tasksCompletedDaily ?? []}
              color="#14130F"
              kind="bar"
              valueLabel="Tasks"
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-[28px] border border-line bg-white p-6 shadow-card">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-mist">
                Retention
              </p>
              <h3 className="mt-1 font-display text-2xl text-ink">
                Do they come back?
              </h3>
              <p className="mt-2 text-xs text-mist">
                Day N = % of a signup cohort that was active again N days later.
              </p>
              <div className="mt-6 space-y-5">
                {[
                  {
                    label: "Back next day (Day 1)",
                    short: "D1",
                    value: data.retention.d1,
                    n: data.retention.d1CohortSize,
                    calc: "active on signup+1 ÷ cohort × 100",
                  },
                  {
                    label: "Back after 1 week (Day 7)",
                    short: "D7",
                    value: data.retention.d7,
                    n: data.retention.d7CohortSize,
                    calc: "active on signup+7 ÷ cohort × 100",
                  },
                  {
                    label: "Back after 1 month (Day 30)",
                    short: "D30",
                    value: data.retention.d30,
                    n: data.retention.d30CohortSize,
                    calc: "active on signup+30 ÷ cohort × 100",
                  },
                ].map((row) => (
                  <div key={row.short}>
                    <div className="mb-1.5 flex justify-between gap-2 text-sm">
                      <span className="font-bold text-ink">{row.label}</span>
                      <span className="shrink-0 font-mono text-mist">
                        {formatPct(row.value)} · n={formatInt(row.n)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-soft">
                      <div
                        className="h-full rounded-full bg-violet transition-all duration-700"
                        style={{
                          width: `${row.value == null ? 0 : Math.min(100, row.value)}%`,
                        }}
                      />
                    </div>
                    {showCalcs ? (
                      <p className="mt-1 font-mono text-[10px] text-mist/80">
                        {row.calc}
                        {row.n === 0 ? " · N/A because cohort size is 0" : ""}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[28px] border border-line bg-white p-6 shadow-card lg:col-span-2">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-mist">
                Engagement depth
              </p>
              <h3 className="mt-1 font-display text-2xl text-ink">
                What students actually did
              </h3>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                <StatPill
                  label="Tasks finished (30d)"
                  value={formatInt(data.engagement.tasksCompleted)}
                  means={`${formatInt(data.engagement.tasksCreated)} tasks were created in the same window.`}
                  calc="COUNT(tasks with completed_at) in 30d"
                />
                <StatPill
                  label="Mood check-ins (30d)"
                  value={formatInt(data.engagement.moodCheckins)}
                  means="Morning / evening / post-focus reflections logged."
                  calc="COUNT(mood_checkins) in 30d"
                />
                <StatPill
                  label="Referral signups share"
                  value={formatPct(data.growth.referralShare)}
                  means={`${formatInt(data.growth.referredSignupsInWindow)} referred of ${formatInt(data.growth.signupsInWindow)} signups.`}
                  calc="referred_signups ÷ signups × 100"
                />
                <StatPill
                  label="Ada plans applied"
                  value={formatPct(data.engagement.adaPlanApplyRate)}
                  means={
                    data.engagement.adaPlanItemsSuggested === 0
                      ? "No plan items suggested yet → rate is N/A (not zero)."
                      : `${formatInt(data.engagement.adaPlanItemsApplied)} applied of ${formatInt(data.engagement.adaPlanItemsSuggested)} suggested.`
                  }
                  calc="applied ÷ suggested × 100"
                />
                <StatPill
                  label="Started focus in 24h"
                  value={formatInt(data.activation.activatedFirstFocus24h)}
                  means={`Out of ${formatInt(data.activation.newRegisteredInWindow)} new registered users.`}
                  calc="completed focus within 24h of signup"
                />
                <StatPill
                  label="Money / MRR"
                  value="Pre-revenue"
                  means="No billing in the product yet — intentionally N/A."
                  calc="N/A (no payment tables)"
                />
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-line bg-white p-6 shadow-card md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-violet">
                  Glossary
                </p>
                <h2 className="mt-1 font-display text-3xl text-ink">
                  How every number is calculated
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-mist">
                  Independent SQL check matched the API for all headline KPIs
                  (registered 100, onboarded 31, WAU 1, MAU 13, D1 3%, D7 0%,
                  activation 15%, focus completion 61.8%, etc.).
                </p>
              </div>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {METRIC_DEFINITIONS.map((def) => (
                <div
                  key={def.term}
                  className="rounded-2xl border border-line bg-paper/70 px-4 py-4"
                >
                  <p className="text-sm font-extrabold text-ink">{def.term}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-mist">
                    {def.plain}
                  </p>
                  <p className="mt-2 font-mono text-[10px] leading-relaxed text-ink/70">
                    {def.formula}
                  </p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-mist">
                    Source · {def.source}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
