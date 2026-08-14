"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  HypothesisStatus,
  MetricsPayload,
  ReadinessStatus,
  UnlockStatus,
} from "@/lib/metrics/types";
import { formatInt, formatPct, formatWhen } from "@/lib/format";
import { BrandMark } from "./BrandMark";
import { AskBox } from "./AskBox";
import { InsightCharts } from "./InsightCharts";
import { ChartDbChangesPanel } from "./ChartDbChangesPanel";

type Tab = "readiness" | "outcomes" | "hypotheses";

const TAB_META: Record<
  Tab,
  { nav: string; name: string; question: string; shows: string; useFor: string }
> = {
  readiness: {
    nav: "1 · Is Prism time tracked?",
    name: "Is Prism time tracked properly?",
    question: "Are we saving Prism + study time the right way?",
    shows:
      "Live DB check: minutes, end times, Prism on/off tags, fair comparison group. Each card = root cause + proof + fix.",
    useFor:
      "Fix priority 1 first (minutes). Until tracking is Ready, we cannot answer “how did Prism help students?”",
  },
  outcomes: {
    nav: "2 · Did Prism help?",
    name: "Did Prism help students?",
    question: "What study + Prism signals do we see in the live DB?",
    shows:
      "All numbers from Aqademiq Postgres: timers, real study minutes, Prism tagged sessions, gap charts. This is what we can see so far — not a claim that Prism caused it.",
    useFor:
      "If gap charts show broken minutes / untagged Prism, believe that over “students didn’t study.” After tracking is fixed, watch these to see if Prism-on sessions look better.",
  },
  hypotheses: {
    nav: "3 · Can we prove it?",
    name: "Can we prove Prism helped?",
    question: "Which “Prism helped” questions can we answer with DB data today?",
    shows:
      "Research bets from live counts. Most stay blocked/weak until Prism time is tracked properly and a fair comparison exists.",
    useFor:
      "Use Ask Gemini for plain-language answers with full DB context. Don’t claim proof while cards say blocked or not enough data.",
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

function unlockBadgeClass(status: UnlockStatus): string {
  if (status === "live") return "text-good";
  if (status === "waiting") return "text-amber-600";
  return "text-[#E85476]";
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
            Main motive:{" "}
            <em>How did Prism help Aqademiq students?</em> — and first:{" "}
            <em>Is Prism / study time tracked properly in the live database?</em>
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

      {data ? (
        <section className="mb-8 animate-rise rounded-[28px] border border-line bg-white/95 px-6 py-6 shadow-card">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mist">
            Main motive · from live Aqademiq database
          </p>
          <h2 className="mt-2 text-xl font-bold text-ink">
            How did Prism help Aqademiq students?
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[#E85476]/25 bg-[#E85476]/8 px-4 py-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-mist">
                Q1 · Is Prism / study time tracked properly?
              </p>
              <p className="mt-2 text-lg font-bold text-ink">
                {data.readiness.summary.red > 0 || data.readiness.summary.amber > 0
                  ? "No — not yet"
                  : "Yes — tracking looks ready"}
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-mist">
                <li>
                  Usable study minutes:{" "}
                  <span className="font-semibold text-ink">
                    {data.outcomes.gaps.completedUsableMins} of{" "}
                    {data.outcomes.gaps.completedUsableMins +
                      data.outcomes.gaps.completedUnusableMins}{" "}
                    finished timers
                  </span>
                </li>
                <li>
                  Session end time saved:{" "}
                  <span className="font-semibold text-ink">
                    {data.outcomes.gaps.endedAtFilled} of{" "}
                    {data.outcomes.gaps.sessionsTotal}
                  </span>
                </li>
                <li>
                  Prism sound tagged:{" "}
                  <span className="font-semibold text-ink">
                    {data.outcomes.gaps.prismTagged} of{" "}
                    {data.outcomes.gaps.sessionsTotal}
                  </span>
                </li>
                <li>
                  Checklist:{" "}
                  <span className="font-semibold text-ink">
                    {data.readiness.summary.red} missing ·{" "}
                    {data.readiness.summary.amber} partial ·{" "}
                    {data.readiness.summary.green} ready
                  </span>
                </li>
              </ul>
            </div>
            <div className="rounded-2xl border border-line bg-paper/80 px-4 py-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-mist">
                Q2 · How did Prism help students?
              </p>
              <p className="mt-2 text-lg font-bold text-ink">
                {data.outcomes.prismOnValidEfm >= 30 &&
                data.readiness.summary.red === 0
                  ? "We can start comparing — still be careful with cause"
                  : "Cannot prove yet"}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-mist">
                Honest answer from the DB today: we see{" "}
                <span className="font-semibold text-ink">
                  {formatInt(data.outcomes.sessionsStarted)} sessions started
                </span>
                ,{" "}
                <span className="font-semibold text-ink">
                  {formatInt(data.outcomes.prismOnSessions)} with Prism tagged
                </span>
                , and only{" "}
                <span className="font-semibold text-ink">
                  {formatInt(data.outcomes.validEfmSessions)} with usable study
                  minutes
                </span>
                . Without proper Prism-time tracking + a fair comparison group,
                “Prism helped” would be a guess — not proof.
              </p>
              <p className="mt-3 text-sm font-medium text-ink">
                All charts and counts below are from the live DB — not placeholders,
                not an ML model.
              </p>
            </div>
          </div>
          <ol className="mt-5 list-decimal space-y-1 pl-5 text-sm text-mist">
            <li>
              <span className="font-semibold text-ink">Page 1</span> — Is Prism
              time tracked properly?
            </li>
            <li>
              <span className="font-semibold text-ink">Page 2</span> — What do we
              see about study + Prism (and where data is missing)?
            </li>
            <li>
              <span className="font-semibold text-ink">Page 3</span> — Can we prove
              Prism helped? (or what’s blocking proof)
            </li>
          </ol>
        </section>
      ) : null}

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
              <ChartDbChangesPanel />
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
              <ChartDbChangesPanel />
              <div className="rounded-[22px] border border-line bg-paper/80 px-5 py-4 text-sm leading-relaxed text-mist">
                <p className="font-semibold text-ink">
                  Charts for “How did Prism help students?”
                </p>
                <p className="mt-2">
                  Below are the best insight charts for that question. They stay{" "}
                  <span className="font-semibold text-ink">empty on purpose</span>{" "}
                  until the DB tracks trusted study / Prism time. You update
                  logging — refresh — they draw. No fake lines from broken 0-minute
                  rows.
                </p>
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-ink">
                  Roadmap · what each chart will unlock
                </p>
                <p className="mb-3 text-xs text-mist">
                  Same analyses as the empty plots — status from live SQL (no
                  nested charts here).
                </p>
                <ul className="grid gap-2 md:grid-cols-2">
                  {data.unlocks.map((u) => (
                    <li
                      key={u.id}
                      className="rounded-2xl border border-line bg-white/90 px-4 py-3 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusDot
                          status={
                            u.status === "live"
                              ? "green"
                              : u.status === "waiting"
                                ? "amber"
                                : "red"
                          }
                        />
                        <span className="font-bold text-ink">{u.title}</span>
                        <span
                          className={`text-[10px] font-extrabold uppercase tracking-[0.12em] ${unlockBadgeClass(u.status)}`}
                        >
                          {u.status}
                        </span>
                      </div>
                      <p className="mt-1.5 text-mist">{u.whatYouGet}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <InsightCharts data={data} />

              <div>
                <p className="mb-2 text-sm font-semibold text-ink">
                  Quick numbers (live DB · not charts)
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Stat
                    name="Sessions started"
                    value={formatInt(data.outcomes.sessionsStarted)}
                    whatItMeans="People opened the focus timer."
                    whatToDo="Context only until minutes are trusted."
                  />
                  <Stat
                    name="Trusted study minutes"
                    value={formatInt(Math.round(data.outcomes.totalEfm))}
                    whatItMeans={`${formatInt(data.outcomes.validEfmSessions)} usable sessions.`}
                    whatToDo="Should jump after duration logging is fixed."
                  />
                  <Stat
                    name="Prism tagged sessions"
                    value={formatInt(data.outcomes.prismOnSessions)}
                    whatItMeans={`of ${formatInt(data.outcomes.sessionsStarted)} started.`}
                    whatToDo="Need tags + minutes before Prism-on charts fill."
                  />
                  <Stat
                    name="Unique studiers"
                    value={formatInt(data.outcomes.more.uniqueStudiers)}
                    whatItMeans={`${formatInt(data.outcomes.more.multiSessionUsers)} repeats.`}
                    whatToDo="Habit base for Prism impact later."
                  />
                  <Stat
                    name="Tasks completed"
                    value={formatInt(data.outcomes.more.tasksCompletedWindow)}
                    whatItMeans="Aqademiq output in the same window."
                    whatToDo="Pair with focus minutes once clean."
                  />
                  <Stat
                    name="Mood check-ins"
                    value={formatInt(data.outcomes.more.moodCheckins)}
                    whatItMeans={`Avg score ${data.outcomes.more.meanMoodScore ?? "—"}.`}
                    whatToDo="Soft signal next to Prism-on days later."
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
