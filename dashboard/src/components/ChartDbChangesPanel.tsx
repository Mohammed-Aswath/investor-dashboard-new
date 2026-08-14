"use client";

export type ChartDbChange = {
  chart: string;
  change: string;
  field: string;
  priority: number;
};

/** Single source for UI + docs: what to change so each chart lights up */
export const CHART_DB_CHANGES: ChartDbChange[] = [
  {
    priority: 1,
    chart: "Trusted study minutes over time",
    field: "focus_sessions.actual_duration_mins",
    change:
      "When the timer stops or finishes, save the real minutes (not 0). Also keep paused_duration_mins / interruption_count honest.",
  },
  {
    priority: 2,
    chart: "From timer open → trusted Prism time",
    field: "focus_sessions.actual_duration_mins (+ ended_at)",
    change:
      "Same duration fix. Funnel’s last bar rises when finished sessions have usable minutes (5–240).",
  },
  {
    priority: 3,
    chart: "Session end time (supports all minute charts)",
    field: "focus_sessions.ended_at",
    change:
      "Write the exact end timestamp when focus ends. Enables strict EFM (start→end) later.",
  },
  {
    priority: 4,
    chart: "Prism on vs off — average study minutes",
    field: "focus_sessions.prism_preset_id",
    change:
      "Always save preset id when Prism sound is on; leave null when off. Needs usable minutes on both sides (~30+ each).",
  },
  {
    priority: 5,
    chart: "Productive study days",
    field: "usable EFM from actual_duration_mins",
    change:
      "No new column — lights up once daily trusted minutes ≥ 20 for users (depends on priority 1).",
  },
  {
    priority: 6,
    chart: "Come back within 7 days after a productive day",
    field: "focus_sessions.started_at + usable minutes",
    change:
      "Fix minutes first; students must keep starting sessions so return rate can be computed.",
  },
  {
    priority: 7,
    chart: "Planned minutes vs delivered minutes",
    field: "planned_duration_mins + actual_duration_mins",
    change:
      "planned is often already set — fill actual on complete so adherence % is real.",
  },
  {
    priority: 8,
    chart: "Started studying for real",
    field: "courses + dated tasks + usable focus minutes",
    change:
      "Courses/tasks mostly exist. Activation % becomes meaningful after minutes logging works.",
  },
  {
    priority: 9,
    chart: "Focus attached to real tasks",
    field: "focus_sessions.task_id (and course_id)",
    change:
      "When focus starts from a task, always write task_id (and course_id when known).",
  },
  {
    priority: 10,
    chart: "When students start focus (weekday)",
    field: "focus_sessions.started_at",
    change:
      "Already logged. Chart unlocks with the minutes gate (or after you ship #1).",
  },
  {
    priority: 11,
    chart: "Mood check-ins alongside study",
    field: "mood_checkins.focus_session_id (+ mood_before/after)",
    change:
      "Keep writing mood_checkins; link focus_session_id. Optionally fill mood_before / mood_after on the session.",
  },
  {
    priority: 12,
    chart: "One-time vs repeat studiers",
    field: "focus_sessions.user_id + started_at",
    change: "Already logged. Lights after trusted-minutes gate opens.",
  },
  {
    priority: 13,
    chart: "Fair proof — control vs Prism",
    field: "NEW control_arm / experiment assignment on session",
    change:
      "Randomly turn Prism off for a % of sessions and store that assignment. Only then can we claim cause.",
  },
  {
    priority: 14,
    chart: "Which Prism version helped (later)",
    field: "focus_sessions.engine_version",
    change: "Write engine version/hash on every session when you ship Prism builds.",
  },
];

export function ChartDbChangesPanel() {
  const starters = CHART_DB_CHANGES.filter((c) => c.priority <= 4);
  const rest = CHART_DB_CHANGES.filter((c) => c.priority > 4);

  return (
    <section className="space-y-4">
      <div className="rounded-[22px] border border-ink/10 bg-white px-5 py-5 shadow-card">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mist">
          Start in the DB / app · so every chart can light up
        </p>
        <h2 className="mt-2 text-lg font-bold text-ink">
          What to change so Proof Desk charts reflect real Prism help
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          Charts are wired. They stay empty until these fields are filled
          properly. Do{" "}
          <span className="font-semibold text-ink">1 → 4 first</span>, refresh
          the desk, then continue.
        </p>

        <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.14em] text-ink">
          Start here (must-do)
        </p>
        <ol className="mt-3 space-y-3">
          {starters.map((row) => (
            <li
              key={row.priority}
              className="flex gap-3 rounded-2xl border border-[#E85476]/20 bg-[#E85476]/5 px-4 py-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                {row.priority}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">{row.chart}</p>
                <p className="mt-1 font-mono text-[11px] text-mist">{row.field}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink/85">
                  {row.change}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.14em] text-ink">
          Then (every remaining chart)
        </p>
        <ul className="mt-3 space-y-2">
          {rest.map((row) => (
            <li
              key={row.priority}
              className="rounded-2xl border border-line bg-paper/60 px-4 py-3 text-sm"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[10px] font-bold text-mist">
                  #{row.priority}
                </span>
                <span className="font-bold text-ink">{row.chart}</span>
              </div>
              <p className="mt-1 font-mono text-[11px] text-mist">{row.field}</p>
              <p className="mt-1 text-mist">{row.change}</p>
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-2xl border border-good/25 bg-good/10 px-4 py-3 text-sm text-ink/85">
          <p className="font-semibold text-ink">Done check</p>
          <p className="mt-1 text-mist">
            Recent completed sessions:{" "}
            <code className="text-xs">actual_duration_mins</code> in 5–240,{" "}
            <code className="text-xs">ended_at</code> set,{" "}
            <code className="text-xs">prism_preset_id</code> set when sound was
            on. Then open{" "}
            <span className="font-semibold text-ink">Did Prism help?</span> and
            refresh — charts flip Empty → Live.
          </p>
        </div>
      </div>
    </section>
  );
}
