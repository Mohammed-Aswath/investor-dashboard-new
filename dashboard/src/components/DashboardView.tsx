"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  HypothesisStatus,
  MetricsPayload,
  ReadinessStatus,
} from "@/lib/metrics/types";
import { formatInt, formatPct, formatWhen } from "@/lib/format";
import { TrendChart } from "./TrendChart";
import { BrandMark } from "./BrandMark";
import { AskBox } from "./AskBox";

type Tab = "readiness" | "outcomes" | "hypotheses";

const TAB_META: Record<
  Tab,
  { nav: string; name: string; question: string; shows: string; useFor: string }
> = {
  readiness: {
    nav: "1 · Setup checklist",
    name: "Setup checklist",
    question: "What’s broken, and what do we fix first?",
    shows:
      "Live problems in our measuring (not a Prism quality score). Each card = root cause + proof from the database + fix.",
    useFor:
      "Start with priority 1. When engineering fixes logging, refresh — cards turn Ready by themselves.",
  },
  outcomes: {
    nav: "2 · Study results",
    name: "Study results",
    question: "What did students actually do in Aqademiq?",
    shows:
      "Counts from real focus sessions: how many timers finished, how many real study minutes we can trust, how many productive days, how often Prism sound was tagged on, and whether people looked like “real starters” in their first two weeks.",
    useFor:
      "Use this to spot product and data problems (for example: timers finish but minutes = 0). After you fix logging, watch these numbers weekly to see if studying grows. Do not read this page as “Prism lift” — it is behavior + data quality, not proof of cause.",
  },
  hypotheses: {
    nav: "3 · Research questions",
    name: "Research questions",
    question: "Which Prism questions can we ask the data today?",
    shows:
      "Three research bets. Each says whether we can test it, we lack data, or we are blocked until logging exists. Small evidence numbers under each card show why.",
    useFor:
      "Use this to decide what to build next so a question moves from Blocked → Not enough data → We can test this. Only then collect enough sessions to answer. Never treat a Blocked card as a failed experiment — it means the experiment was never instrumented.",
  },
};

function statusColor(status: ReadinessStatus | HypothesisStatus): string {
  if (status === "green" || status === "testable") return "text-good";
  if (status === "amber" || status === "weak") return "text-amber-600";
  return "text-[#E85476]";
}

function statusWord(status: ReadinessStatus | HypothesisStatus): string {
  if (status === "green") return "Ready";
  if (status === "amber") return "Partial";
  if (status === "red") return "Missing";
  if (status === "testable") return "We can test this";
  if (status === "weak") return "Not enough data yet";
  return "Blocked — need more logging";
}

function StatusDot({ status }: { status: ReadinessStatus | HypothesisStatus }) {
  const tone =
    status === "green" || status === "testable"
      ? "bg-good"
      : status === "amber" || status === "weak"
        ? "bg-amber-500"
        : "bg-[#E85476]";
  return <span className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} />;
}

function Stat({
  name,
  value,
  whatItMeans,
  whatToDo,
}: {
  name: string;
  value: string;
  whatItMeans: string;
  whatToDo: string;
}) {
  return (
    <div className="rounded-[22px] border border-line bg-white/80 px-5 py-5 shadow-card backdrop-blur">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mist">
        {name}
      </p>
      <p className="mt-2 font-mono text-[1.75rem] font-medium tracking-tight text-ink">
        {value}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink/80">
        <span className="font-semibold text-ink">What this means: </span>
        {whatItMeans}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-mist">
        <span className="font-semibold text-ink/70">What you can do: </span>
        {whatToDo}
      </p>
    </div>
  );
}

const EVIDENCE_LABELS: Record<string, string> = {
  n_prism_valid: "Usable sessions with Prism on",
  n_off_valid: "Usable sessions with Prism off",
  mean_efm_prism_on: "Average real study minutes (Prism on)",
  mean_efm_prism_off: "Average real study minutes (Prism off)",
  control_arm_present: "Fair comparison group exists? (1 = yes, 0 = no)",
  pad_days: "Productive days we checked",
  returned_within_7d: "Came back within a week",
  return_rate_pct: "Came-back rate (%)",
};

export function DashboardView() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("readiness");
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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
      setLoadError("Could not load numbers from the database.");
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

  const meta = TAB_META[tab];

  return (
    <div className="mx-auto min-h-screen max-w-[1180px] px-5 pb-20 pt-8 md:px-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="animate-rise max-w-3xl">
          <div className="flex items-center gap-3">
            <BrandMark size={40} />
            <span className="rounded-full bg-ink/5 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-mist">
              Prism · internal tool
            </span>
          </div>
          <h1 className="mt-4 font-display text-4xl tracking-tight text-ink md:text-5xl">
            Prism Proof Desk
          </h1>
          <p className="mt-3 text-base font-medium leading-relaxed text-ink/85">
            A simple place to see whether we can <em>prove</em> that Prism (the
            focus-sound engine inside Aqademiq) helps students study — and what
            to fix if we cannot prove it yet.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-line bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-ink"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-full bg-ink px-4 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-white"
          >
            Log out
          </button>
        </div>
      </header>

      <section className="mb-8 animate-rise rounded-[28px] border border-line bg-white/95 px-6 py-6 shadow-card">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mist">
          Start here · big picture
        </p>
        <h2 className="mt-2 text-xl font-bold text-ink">
          What is this, in everyday words?
        </h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-mist">
          <p>
            <span className="font-semibold text-ink">Aqademiq</span> is the study
            app. Students start focus timers, add courses and tasks, and can play{" "}
            <span className="font-semibold text-ink">Prism</span> focus sound
            while they work.
          </p>
          <p>
            <span className="font-semibold text-ink">Prism Proof Desk</span> does
            not sell Prism and does not show investor growth charts. It only
            looks at Aqademiq’s database and helps the team answer:{" "}
            <em>“Do we have the right logs to prove Prism helps — and what do
            we see so far?”</em>
          </p>
          <p>
            Think of three drawers:
          </p>
          <ol className="list-decimal space-y-2 pl-5 text-ink/80">
            <li>
              <span className="font-semibold text-ink">Setup checklist</span> —
              are the measuring tools installed?
            </li>
            <li>
              <span className="font-semibold text-ink">Study results</span> —
              what did people do in the last 30 days?
            </li>
            <li>
              <span className="font-semibold text-ink">Research questions</span> —
              which Prism claims can we test with that data?
            </li>
          </ol>
          <p>
            <span className="font-semibold text-ink">Important:</span> if study
            minutes look tiny, that often means the app saved{" "}
            <em>0 minutes</em> on finished timers — a logging bug — not that
            nobody studied. Always read the checklist first.
          </p>
        </div>
      </section>

      <nav className="mb-6 flex flex-wrap gap-2">
        {(Object.keys(TAB_META) as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-[0.12em] transition ${
              tab === id
                ? "bg-ink text-white"
                : "border border-line bg-white/70 text-mist hover:text-ink"
            }`}
          >
            {TAB_META[id].nav}
          </button>
        ))}
      </nav>

      <section className="mb-6 rounded-[22px] border border-line bg-white/90 px-5 py-5 shadow-card">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mist">
          This page · {meta.name}
        </p>
        <h2 className="mt-2 text-lg font-bold text-ink">{meta.question}</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink/80">
          <span className="font-semibold text-ink">What it shows: </span>
          {meta.shows}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          <span className="font-semibold text-ink/70">What you can do with it: </span>
          {meta.useFor}
        </p>
      </section>

      {loading && !data ? (
        <p className="text-sm font-medium text-mist">
          Loading live numbers from Aqademiq…
        </p>
      ) : null}

      {loadError ? (
        <div className="mb-6 rounded-2xl border border-[#E85476]/30 bg-[#E85476]/10 px-4 py-3 text-sm font-medium text-[#E85476]">
          {loadError}
        </div>
      ) : null}

      {data ? (
        <>
          <p className="mb-6 text-xs font-medium text-mist">
            Numbers updated {formatWhen(data.meta.asOf)} · last{" "}
            {data.meta.windowDays} days of live Aqademiq data
          </p>

          {tab === "readiness" ? (
            <section className="animate-rise space-y-5">
              {(() => {
                const ordered = [...data.readiness.checks].sort(
                  (a, b) => a.priority - b.priority,
                );
                const broken = ordered.filter((c) => c.status !== "green");
                const ok = ordered.filter((c) => c.status === "green");
                const top = broken.slice(0, 3);

                return (
                  <>
                    <div
                      className={`rounded-[22px] border px-5 py-5 ${
                        broken.length
                          ? "border-[#E85476]/30 bg-[#E85476]/8"
                          : "border-good/30 bg-good/10"
                      }`}
                    >
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mist">
                        Verdict (from live database)
                      </p>
                      <p className="mt-2 text-xl font-bold text-ink">
                        {broken.length
                          ? "We cannot prove Prism helps yet."
                          : "Measuring tools look ready — fair tests can start."}
                      </p>
                      <p className="mt-2 text-sm text-mist">
                        {broken.length
                          ? "Not because Prism failed — because our measuring is broken or missing. Students use timers; we don’t save the science we need."
                          : "Refresh anytime; this re-checks the database."}
                      </p>
                      <p className="mt-3 text-sm font-medium text-ink">
                        {broken.length} problem{broken.length === 1 ? "" : "s"} ·{" "}
                        {ok.length} ready
                      </p>
                    </div>

                    {top.length > 0 ? (
                      <div className="rounded-[22px] border border-line bg-white px-5 py-5 shadow-card">
                        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mist">
                          Root causes · fix these first
                        </p>
                        <ol className="mt-4 space-y-4">
                          {top.map((c) => (
                            <li key={c.id} className="flex gap-3">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                                {c.priority}
                              </span>
                              <div>
                                <p className="font-bold text-ink">{c.label}</p>
                                <p className="mt-1 text-sm text-ink/85">
                                  {c.rootCause}
                                </p>
                                <p className="mt-1 text-sm text-mist">
                                  <span className="font-semibold text-ink/70">
                                    Proof:{" "}
                                  </span>
                                  {c.proof}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}

                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-ink">
                        All issues (simple)
                      </p>
                      <p className="text-xs text-mist">
                        Each card = root cause · proof from DB · fix. Sorted by
                        priority.
                      </p>
                      {ordered.map((check) => (
                        <article
                          key={check.id}
                          className={`rounded-[20px] border px-4 py-4 ${
                            check.status === "green"
                              ? "border-good/35 bg-good/5"
                              : check.status === "amber"
                                ? "border-amber-500/35 bg-amber-500/5"
                                : "border-[#E85476]/25 bg-white"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-ink/5 px-2 py-0.5 font-mono text-[10px] font-bold text-mist">
                              #{check.priority}
                            </span>
                            <StatusDot status={check.status} />
                            <h3 className="text-base font-bold text-ink">
                              {check.label}
                            </h3>
                            <span
                              className={`text-[10px] font-extrabold uppercase tracking-[0.12em] ${statusColor(check.status)}`}
                            >
                              {statusWord(check.status)}
                            </span>
                          </div>
                          <dl className="mt-3 space-y-2 text-sm">
                            <div>
                              <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-mist">
                                Root cause
                              </dt>
                              <dd className="mt-0.5 font-medium text-ink">
                                {check.rootCause}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-mist">
                                Proof (from database)
                              </dt>
                              <dd className="mt-0.5 text-mist">{check.proof}</dd>
                            </div>
                            <div>
                              <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-mist">
                                {check.status === "green" ? "Keep doing" : "Fix"}
                              </dt>
                              <dd className="mt-0.5 text-ink/80">{check.fix}</dd>
                            </div>
                          </dl>
                        </article>
                      ))}
                    </div>
                  </>
                );
              })()}
            </section>
          ) : null}

          {tab === "outcomes" ? (
            <section className="animate-rise space-y-8">
              <div className="rounded-[22px] border border-line bg-paper/80 px-5 py-4 text-sm leading-relaxed text-mist">
                <p className="font-semibold text-ink">How to use Study results</p>
                <p className="mt-2">
                  Each card has a big number, then “what this means” and “what you
                  can do.” If Real study minutes is near zero while many timers
                  finished, believe the checklist (bad duration logging), not
                  “students never study.”
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Stat
                  name="Real study minutes"
                  value={formatInt(Math.round(data.outcomes.totalEfm))}
                  whatItMeans={`Total minutes we trust after cleaning pauses and ignoring tiny/huge sessions. Only ${formatInt(data.outcomes.validEfmSessions)} session(s) currently qualify (average ${data.outcomes.meanEfmPerValidSession ?? "—"} minutes). Official short name: EFM.`}
                  whatToDo="If this is tiny while many timers finished, fix duration logging first. After that, watch this total grow week to week as a health signal for studying — still not proof Prism caused the growth."
                />
                <Stat
                  name="Productive study days"
                  value={formatInt(data.outcomes.padCount)}
                  whatItMeans={`A day counts when someone got at least 20 real study minutes that day. ${formatInt(data.outcomes.padUsers)} user(s) had such a day. Official short name: PAD.`}
                  whatToDo="Use this as “did real studying happen?” After minutes logging works, rising productive days means the habit is sticking. Pair with Research question 3 (coming back next week)."
                />
                <Stat
                  name="Finished the timer"
                  value={formatPct(data.outcomes.timerFinishRate)}
                  whatItMeans={`${formatInt(data.outcomes.sessionsCompleted)} of ${formatInt(data.outcomes.sessionsStarted)} focus sessions were marked completed. This is about finishing the timer UI, not about Prism quality.`}
                  whatToDo="If finish rate is healthy but Real study minutes is not, the product flow works and the measurement fields do not — send that to engineering."
                />
                <Stat
                  name="Started studying for real"
                  value={formatPct(data.outcomes.vasRate)}
                  whatItMeans={`${formatInt(data.outcomes.vasReached)} of ${formatInt(data.outcomes.vasEligible)} people who began looked like real users in their first 14 days (course + dated tasks + several study days with enough minutes). Official short name: VAS.`}
                  whatToDo="Low % means most people dabble then leave. Improve onboarding and early study habits. Do not blame Prism until Setup checklist can support a fair test."
                />
                <Stat
                  name="Prism sound on vs off"
                  value={`${formatInt(data.outcomes.prismOnSessions)} on · ${formatInt(data.outcomes.prismOffSessions)} off`}
                  whatItMeans="How many focus sessions saved a Prism sound preset. This is only a tag in the database — not a scientific control group."
                  whatToDo="If almost everything is “off” or untagged, teach the app to always record Prism on/off. Until then, ignore on-vs-off averages as marketing."
                />
                <Stat
                  name="Average minutes · Prism on vs off"
                  value={`${data.outcomes.meanEfmPrismOn ?? "—"} vs ${data.outcomes.meanEfmPrismOff ?? "—"}`}
                  whatItMeans={`Side-by-side average real study minutes. Usable sample sizes: Prism on = ${data.outcomes.prismOnValidEfm}, off = ${data.outcomes.prismOffValidEfm}. Tiny samples make the comparison meaningless.`}
                  whatToDo="Only discuss this after dozens of usable sessions on both sides — and remember Research question 2 still needs a true fair comparison group for proof."
                />
              </div>

              {data.outcomes.instrumentationNote ? (
                <p className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-900">
                  {data.outcomes.instrumentationNote}
                </p>
              ) : null}

              <div>
                <p className="mb-3 text-sm font-semibold text-ink">
                  Trends over the last {data.meta.windowDays} days
                </p>
                <p className="mb-4 text-sm leading-relaxed text-mist">
                  Charts show day-by-day totals. Empty or flat charts usually mean
                  few sessions had usable minutes — again, check the Setup
                  checklist.
                </p>
                <div className="grid gap-6 lg:grid-cols-2">
                  <TrendChart
                    title="Real study minutes by day"
                    subtitle="Only sessions with usable duration"
                    data={data.outcomes.series.efmDaily}
                    valueLabel="Minutes"
                  />
                  <TrendChart
                    title="Productive days by calendar day"
                    subtitle="How many user-days hit 20+ real minutes"
                    data={data.outcomes.series.padDaily}
                    kind="bar"
                    valueLabel="Days"
                  />
                </div>
              </div>
            </section>
          ) : null}

          {tab === "hypotheses" ? (
            <section className="animate-rise space-y-4">
              <AskBox />

              <div className="rounded-[22px] border border-line bg-paper/80 px-5 py-4 text-sm leading-relaxed text-mist">
                <p className="font-semibold text-ink">How to read each research card</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    <span className="font-semibold text-good">We can test this</span>{" "}
                    — enough raw material to look; still be careful with small samples.
                  </li>
                  <li>
                    <span className="font-semibold text-amber-600">
                      Not enough data yet
                    </span>{" "}
                    — question is clear, sample is too small.
                  </li>
                  <li>
                    <span className="font-semibold text-[#E85476]">
                      Blocked — need more logging
                    </span>{" "}
                    — the experiment was never set up in the product.
                  </li>
                </ul>
              </div>

              {data.hypotheses.map((h) => (
                <article
                  key={h.id}
                  className="rounded-[22px] border border-line bg-white/80 px-5 py-5 shadow-card"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusDot status={h.status} />
                    <span className="font-mono text-xs font-bold text-mist">
                      Research {h.id}
                    </span>
                    <span
                      className={`text-[10px] font-extrabold uppercase tracking-[0.14em] ${statusColor(h.status)}`}
                    >
                      {statusWord(h.status)}
                    </span>
                  </div>
                  <h2 className="mt-3 text-lg font-bold text-ink">{h.claim}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-ink/80">
                    <span className="font-semibold text-ink">What this is asking: </span>
                    {h.detail}
                  </p>
                  <p className="mt-3 text-[10px] font-extrabold uppercase tracking-[0.14em] text-mist">
                    Evidence from the database
                  </p>
                  <dl className="mt-2 flex flex-wrap gap-4">
                    {Object.entries(h.evidence).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-mist">
                          {EVIDENCE_LABELS[k] ?? k}
                        </dt>
                        <dd className="font-mono text-sm text-ink">
                          {v == null ? "—" : v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}

              <div className="rounded-[22px] border border-line bg-white/90 px-5 py-4 text-sm leading-relaxed text-mist">
                <p className="font-semibold text-ink">What you can do with these cards</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    Share Blocked cards with engineering as “please add this
                    logging,” not as “Prism failed.”
                  </li>
                  <li>
                    Share Not-enough-data cards as “keep shipping + fix minutes
                    first,” then re-check in a few weeks.
                  </li>
                  <li>
                    Only celebrate a result after a card is testable{" "}
                    <em>and</em> sample sizes are large enough to trust.
                  </li>
                </ul>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
