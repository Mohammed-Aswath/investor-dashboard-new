"use client";

import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MetricsPayload } from "@/lib/metrics/types";
import { CHART_DB_CHANGES } from "./ChartDbChangesPanel";

type ChartKind =
  | "area"
  | "bar"
  | "line"
  | "dual-bar"
  | "funnel"
  | "donut"
  | "weekday";

type InsightDef = {
  id: string;
  title: string;
  chartType: string;
  /** One sentence: what this chart answers */
  asks: string;
  /** Why it matters for Prism / Aqademiq */
  means: string;
  /** What “good” looks like when DB is clean */
  goodLooksLike: string;
  /** Match title in CHART_DB_CHANGES */
  dbChangeTitle: string;
  kind: ChartKind;
};

const INSIGHTS: InsightDef[] = [
  {
    id: "efm_trend",
    title: "Trusted study minutes over time",
    chartType: "Area chart",
    asks: "Are Aqademiq students accumulating real focus minutes week by week?",
    means:
      "Base health of study time after we trust duration logging. If this stays flat while timers finish, minutes are still broken.",
    goodLooksLike: "Rising or steady daily EFM — not a near-zero line.",
    dbChangeTitle: "Trusted study minutes over time",
    kind: "area",
  },
  {
    id: "prism_lift",
    title: "Prism on vs off — average study minutes",
    chartType: "Grouped bars",
    asks: "Do sessions with Prism sound show higher average trusted minutes?",
    means:
      "First direct answer to “how did Prism help?” — associational only until a control arm exists.",
    goodLooksLike: "Two solid bars with large n on both sides (30+ each).",
    dbChangeTitle: "Prism on vs off — average study minutes",
    kind: "dual-bar",
  },
  {
    id: "funnel_quality",
    title: "From timer open → trusted Prism time",
    chartType: "Funnel bars",
    asks: "Where do we lose the signal between using the app and measurable study?",
    means:
      "Shows the measurement leak: started → finished → usable minutes. The drop to the last step is the root tracking issue.",
    goodLooksLike: "Last bar close to the finished bar (most completes have real minutes).",
    dbChangeTitle: "From timer open → trusted Prism time",
    kind: "funnel",
  },
  {
    id: "pad_trend",
    title: "Productive study days",
    chartType: "Bar chart",
    asks: "How many student-days actually hit a meaningful study threshold (20+ trusted minutes)?",
    means: "Habit depth — not just opening the timer, but a real study day.",
    goodLooksLike: "Regular bars across the month, not one spike.",
    dbChangeTitle: "Productive study days",
    kind: "bar",
  },
  {
    id: "return_7d",
    title: "Come back within 7 days after a productive day",
    chartType: "Conversion bars",
    asks: "After a good study day, do students return the next week?",
    means: "Retention tied to real study — core Aqademiq loop Prism should support.",
    goodLooksLike: "High “returned” share once PAD volume exists.",
    dbChangeTitle: "Come back within 7 days after a productive day",
    kind: "dual-bar",
  },
  {
    id: "control_proof",
    title: "Fair proof — control vs Prism",
    chartType: "Grouped bars",
    asks: "When Prism is randomly off for some sessions, do actuated sessions still win on minutes?",
    means:
      "Only chart that can support “Prism caused help.” Needs a control arm in the product.",
    goodLooksLike: "Two cohorts with similar volume; Prism bar higher with confidence.",
    dbChangeTitle: "Fair proof — control vs Prism",
    kind: "dual-bar",
  },
  {
    id: "weekday_load",
    title: "When students start focus (weekday)",
    chartType: "Category bars",
    asks: "Which days do students open the timer most?",
    means: "Timing for nudges and when Prism load matters most.",
    goodLooksLike: "Clear weekday pattern (e.g. heavier Mon–Thu).",
    dbChangeTitle: "When students start focus (weekday)",
    kind: "weekday",
  },
  {
    id: "activation",
    title: "Started studying for real",
    chartType: "Conversion bars",
    asks: "What share of new students become real studiers in their first 2 weeks?",
    means: "Activation quality of Aqademiq — Prism can only help people who stick.",
    goodLooksLike: "Rising % as onboarding + minutes logging improve.",
    dbChangeTitle: "Started studying for real",
    kind: "dual-bar",
  },
  {
    id: "plan_adhere",
    title: "Planned minutes vs delivered minutes",
    chartType: "Line + bars",
    asks: "Do students finish the study block they planned?",
    means: "Discipline / session quality signal next to Prism.",
    goodLooksLike: "Adherence near 100% on many sessions with both fields filled.",
    dbChangeTitle: "Planned minutes vs delivered minutes",
    kind: "line",
  },
  {
    id: "task_link",
    title: "Focus attached to real tasks",
    chartType: "Donut",
    asks: "Is Prism time spent on planned work or empty timers?",
    means: "Links engine time to Aqademiq coursework — more meaningful impact story.",
    goodLooksLike: "Most sessions have a task_id.",
    dbChangeTitle: "Focus attached to real tasks",
    kind: "donut",
  },
  {
    id: "mood_pulse",
    title: "Mood check-ins alongside study",
    chartType: "Area chart",
    asks: "How are students feeling across the same window as focus?",
    means: "Soft wellbeing signal to pair later with Prism-on days (not proof alone).",
    goodLooksLike: "Steady check-in volume; can overlay with EFM once minutes are clean.",
    dbChangeTitle: "Mood check-ins alongside study",
    kind: "area",
  },
  {
    id: "repeat_habit",
    title: "One-time vs repeat studiers",
    chartType: "Donut",
    asks: "Are people coming back for a second focus session?",
    means: "Early habit — Prism’s value shows up if repeat rate grows with good minutes.",
    goodLooksLike: "Healthy share of multi-session users.",
    dbChangeTitle: "One-time vs repeat studiers",
    kind: "donut",
  },
];

function shortDay(day: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(day)) {
    const d = new Date(`${day}T00:00:00Z`);
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  }
  return day;
}

function EmptyPlot({ asks }: { asks: string }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-paper/70 px-6 text-center">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mist">
        Empty on purpose · waiting for clean DB
      </p>
      <p className="mt-3 max-w-sm text-sm font-medium leading-relaxed text-ink/80">
        {asks}
      </p>
      <p className="mt-2 max-w-sm text-xs leading-relaxed text-mist">
        Chart stays blank until trusted Prism / study-time fields are filled.
        After you update the DB, refresh — it draws automatically.
      </p>
    </div>
  );
}

function InsightCard({
  def,
  ready,
  children,
}: {
  def: InsightDef;
  ready: boolean;
  children: ReactNode;
}) {
  const db = CHART_DB_CHANGES.find((c) => c.chart === def.dbChangeTitle);
  return (
    <article className="rounded-[28px] border border-line bg-white p-5 shadow-card md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-mist">
            {def.chartType}
          </p>
          <h3 className="mt-1 text-[15px] font-extrabold tracking-tight text-ink">
            {def.title}
          </h3>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] ${
            ready ? "bg-good/15 text-good" : "bg-ink/5 text-mist"
          }`}
        >
          {ready ? "Live" : "Empty · ready"}
        </span>
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div>
          <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-mist">
            What it asks
          </dt>
          <dd className="mt-0.5 font-medium text-ink">{def.asks}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-mist">
            Why it matters
          </dt>
          <dd className="mt-0.5 text-mist">{def.means}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-mist">
            Good looks like
          </dt>
          <dd className="mt-0.5 text-mist">{def.goodLooksLike}</dd>
        </div>
        {db ? (
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
            <dt className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-amber-800">
              DB / app change to light this up
            </dt>
            <dd className="mt-1 font-mono text-[11px] text-ink/70">{db.field}</dd>
            <dd className="mt-1 text-sm text-ink/85">{db.change}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-5">{ready ? children : <EmptyPlot asks={def.asks} />}</div>
    </article>
  );
}

const TOOLTIP = {
  borderRadius: 12,
  border: "1px solid rgba(20,19,15,0.1)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
  fontSize: 12,
} as const;

export function InsightCharts({ data }: { data: MetricsPayload }) {
  const o = data.outcomes;
  /** Master gate: keep insight plots empty until trusted study minutes exist */
  const minutesClean =
    o.gaps.completedUsableMins + o.gaps.completedUnusableMins > 0 &&
    o.gaps.completedUsableMins /
      (o.gaps.completedUsableMins + o.gaps.completedUnusableMins) >=
      0.7;
  const prismCompareReady =
    minutesClean && o.prismOnValidEfm >= 30 && o.prismOffValidEfm >= 30;
  const padReady = minutesClean && o.padCount >= 5;
  const h3 = data.hypotheses.find((h) => h.id === "H3");
  const returned = h3?.evidence.returned_within_7d ?? 0;
  const padDays = h3?.evidence.pad_days ?? 0;
  const returnReady = minutesClean && padDays >= 5;
  const controlReady = false; // needs product control arm
  const weekdayReady = minutesClean && o.sessionsStarted >= 20;
  const activationReady = minutesClean && o.vasEligible >= 20;
  const planReady = minutesClean && o.more.plannedVsActualPairs >= 20;
  const taskReady = minutesClean && o.sessionsStarted >= 20;
  const moodReady = minutesClean && o.more.moodCheckins >= 30;
  const repeatReady = minutesClean && o.more.uniqueStudiers >= 10;

  const efmSeries = o.series.efmDaily.map((p) => ({
    ...p,
    label: shortDay(p.day),
  }));
  const padSeries = o.series.padDaily.map((p) => ({
    ...p,
    label: shortDay(p.day),
  }));
  const moodSeries = o.series.moodCheckinsDaily.map((p) => ({
    ...p,
    label: shortDay(p.day),
  }));

  const readyMap: Record<string, boolean> = {
    efm_trend: minutesClean && efmSeries.some((p) => p.value > 0),
    prism_lift: prismCompareReady,
    funnel_quality: minutesClean,
    pad_trend: padReady,
    return_7d: returnReady,
    control_proof: controlReady,
    weekday_load: weekdayReady,
    activation: activationReady,
    plan_adhere: planReady,
    task_link: taskReady,
    mood_pulse: moodReady,
    repeat_habit: repeatReady,
  };

  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-ink">
        Best insight charts · built for clean Prism time
      </p>
      <p className="mb-6 max-w-3xl text-sm leading-relaxed text-mist">
        These are the charts that matter for{" "}
        <span className="font-semibold text-ink">
          “How did Prism help Aqademiq students?”
        </span>{" "}
        They stay <span className="font-semibold text-ink">empty on purpose</span>{" "}
        until the DB tracks trusted study / Prism time. Update logging, refresh —
        they fill themselves. No fake lines.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        <InsightCard def={INSIGHTS[0]} ready={readyMap.efm_trend}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={efmSeries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="efmFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2F6F4E" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2F6F4E" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#ECEAE7" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#4A4742", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#4A4742", fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={TOOLTIP} />
                <Area type="monotone" dataKey="value" name="EFM" stroke="#2F6F4E" strokeWidth={2.4} fill="url(#efmFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </InsightCard>

        <InsightCard def={INSIGHTS[1]} ready={readyMap.prism_lift}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: "Prism on", value: o.meanEfmPrismOn ?? 0 },
                  { name: "Prism off", value: o.meanEfmPrismOff ?? 0 },
                ]}
                margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
              >
                <CartesianGrid stroke="#ECEAE7" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#4A4742", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#4A4742", fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={TOOLTIP} />
                <Bar dataKey="value" name="Avg minutes" radius={[8, 8, 0, 0]}>
                  <Cell fill="#2F6F4E" />
                  <Cell fill="#C45C26" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </InsightCard>

        <InsightCard def={INSIGHTS[2]} ready={readyMap.funnel_quality}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={[
                  { name: "Started", value: o.sessionsStarted },
                  { name: "Finished", value: o.sessionsCompleted },
                  { name: "Trusted mins", value: o.validEfmSessions },
                ]}
                margin={{ top: 8, right: 16, left: 12, bottom: 0 }}
              >
                <CartesianGrid stroke="#ECEAE7" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#4A4742", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={88} tick={{ fill: "#4A4742", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                  <Cell fill="#4A4742" />
                  <Cell fill="#C45C26" />
                  <Cell fill="#2F6F4E" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </InsightCard>

        <InsightCard def={INSIGHTS[3]} ready={readyMap.pad_trend}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={padSeries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="#ECEAE7" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#4A4742", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#4A4742", fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={TOOLTIP} />
                <Bar dataKey="value" name="PAD" fill="#6B5CF0" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </InsightCard>

        <InsightCard def={INSIGHTS[4]} ready={readyMap.return_7d}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: "Returned ≤7d", value: Number(returned) || 0 },
                  { name: "No return", value: Math.max(Number(padDays) - Number(returned), 0) },
                ]}
                margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
              >
                <CartesianGrid stroke="#ECEAE7" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#4A4742", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#4A4742", fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={TOOLTIP} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  <Cell fill="#2F6F4E" />
                  <Cell fill="#E85476" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </InsightCard>

        <InsightCard def={INSIGHTS[5]} ready={readyMap.control_proof}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: "Control (no Prism)", value: 0 },
                  { name: "Prism on", value: 0 },
                ]}
                margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
              >
                <CartesianGrid stroke="#ECEAE7" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#4A4742", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#4A4742", fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={TOOLTIP} />
                <Bar dataKey="value" fill="#C4C0B8" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </InsightCard>

        <InsightCard def={INSIGHTS[6]} ready={readyMap.weekday_load}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={o.series.sessionsByWeekday}
                margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
              >
                <CartesianGrid stroke="#ECEAE7" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "#4A4742", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#4A4742", fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={TOOLTIP} />
                <Bar dataKey="value" name="Starts" fill="#4A4742" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </InsightCard>

        <InsightCard def={INSIGHTS[7]} ready={readyMap.activation}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: "Activated", value: o.vasReached },
                  { name: "Not yet", value: Math.max(o.vasEligible - o.vasReached, 0) },
                ]}
                margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
              >
                <CartesianGrid stroke="#ECEAE7" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#4A4742", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#4A4742", fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={TOOLTIP} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  <Cell fill="#2F6F4E" />
                  <Cell fill="#E85476" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </InsightCard>

        <InsightCard def={INSIGHTS[8]} ready={readyMap.plan_adhere}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={[
                  {
                    name: "Plan vs actual",
                    planned: o.more.meanPlannedMins ?? 0,
                    adherence: o.more.planAdherencePct ?? 0,
                  },
                ]}
                margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
              >
                <CartesianGrid stroke="#ECEAE7" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#4A4742", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#4A4742", fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={TOOLTIP} />
                <Legend />
                <Bar dataKey="planned" name="Avg planned min" fill="#4A4742" radius={[8, 8, 0, 0]} />
                <Line dataKey="adherence" name="Adherence %" stroke="#2F6F4E" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </InsightCard>

        <InsightCard def={INSIGHTS[9]} ready={readyMap.task_link}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "With task", value: o.more.sessionsWithTask },
                    {
                      name: "No task",
                      value: Math.max(o.sessionsStarted - o.more.sessionsWithTask, 0),
                    },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  <Cell fill="#2F6F4E" />
                  <Cell fill="#E8E4DC" />
                </Pie>
                <Tooltip contentStyle={TOOLTIP} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </InsightCard>

        <InsightCard def={INSIGHTS[10]} ready={readyMap.mood_pulse}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={moodSeries} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="moodFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3D5A80" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#3D5A80" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#ECEAE7" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#4A4742", fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#4A4742", fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip contentStyle={TOOLTIP} />
                <Area type="monotone" dataKey="value" name="Check-ins" stroke="#3D5A80" strokeWidth={2.4} fill="url(#moodFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </InsightCard>

        <InsightCard def={INSIGHTS[11]} ready={readyMap.repeat_habit}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: "Repeat (2+)", value: o.more.multiSessionUsers },
                    {
                      name: "Once only",
                      value: Math.max(
                        o.more.uniqueStudiers - o.more.multiSessionUsers,
                        0,
                      ),
                    },
                  ]}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  <Cell fill="#6B5CF0" />
                  <Cell fill="#E8E4DC" />
                </Pie>
                <Tooltip contentStyle={TOOLTIP} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </InsightCard>
      </div>
    </div>
  );
}
