export type MetricDefinition = {
  term: string;
  plain: string;
  formula: string;
  source: string;
};

/** Plain-language definitions for every investor metric shown in the UI. */
export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    term: "Registered users",
    plain: "Students who created a real account (not guests), and have not deleted their account.",
    formula: "COUNT(profiles WHERE is_guest = false AND deleted_at IS NULL)",
    source: "profiles",
  },
  {
    term: "Onboarding rate",
    plain: "Share of registered users who finished onboarding.",
    formula: "onboarded_users ÷ registered_users × 100",
    source: "profiles.onboarding_complete",
  },
  {
    term: "Signups (30 days)",
    plain: "New registered accounts created in the last 30 days (UTC).",
    formula: "COUNT(registered profiles WHERE created_at ≥ now − 30 days)",
    source: "profiles.created_at",
  },
  {
    term: "DAU · Daily active users",
    plain: "Distinct students with activity recorded today (UTC).",
    formula: "COUNT DISTINCT user_id WHERE activity_date = today",
    source: "daily_activity_snapshots",
  },
  {
    term: "WAU · Weekly active users",
    plain: "Distinct students active at least once in the last 7 days.",
    formula: "COUNT DISTINCT user_id WHERE activity_date ≥ today − 6 days",
    source: "daily_activity_snapshots",
  },
  {
    term: "MAU · Monthly active users",
    plain: "Distinct students active at least once in the last 30 days.",
    formula: "COUNT DISTINCT user_id WHERE activity_date ≥ today − 29 days",
    source: "daily_activity_snapshots",
  },
  {
    term: "WAU / MAU stickiness",
    plain: "How often monthly users come back in a given week. Higher = stickier habit.",
    formula: "WAU ÷ MAU × 100",
    source: "derived",
  },
  {
    term: "Day 1 return (D1)",
    plain: "Of students who signed up recently enough to measure, what % came back the next calendar day.",
    formula: "users active on signup_date + 1 ÷ cohort size × 100",
    source: "profiles + daily_activity_snapshots",
  },
  {
    term: "Day 7 return (D7)",
    plain: "Of students who signed up at least 7 days ago (within the rolling cohort window), what % were active again on day 7 after signup.",
    formula: "users active on signup_date + 7 ÷ cohort size × 100",
    source: "profiles + daily_activity_snapshots",
  },
  {
    term: "Day 30 return (D30)",
    plain: "Same idea as D7, but on day 30 after signup. Shows N/A if the cohort size is 0 (app too new).",
    formula: "users active on signup_date + 30 ÷ cohort size × 100",
    source: "profiles + daily_activity_snapshots",
  },
  {
    term: "First focus after signup (≤24 hours)",
    plain: "Not “activity in the last 24 hours.” It means: after a student creates an account, did they complete a focus session within the next 24 hours? Measured for signups in the last 30 days. Example: 15 ÷ 100 = 15%.",
    formula: "users whose first completed focus is ≤ created_at + 24h ÷ new registered users (30d) × 100",
    source: "profiles.created_at + focus_sessions (was_completed = true)",
  },
  {
    term: "Focus quality / completion",
    plain: "Share of focus sessions that were finished (not abandoned) in the last 30 days.",
    formula: "completed_sessions ÷ started_sessions × 100",
    source: "focus_sessions",
  },
  {
    term: "Focus minutes",
    plain: "Total actual minutes from completed focus sessions in the last 30 days.",
    formula: "SUM(actual_duration_mins WHERE was_completed = true)",
    source: "focus_sessions",
  },
  {
    term: "Tasks completed",
    plain: "Tasks marked complete in the last 30 days (by created window for created/completed pair).",
    formula: "COUNT(tasks WHERE completed_at IS NOT NULL) in window",
    source: "tasks",
  },
  {
    term: "Ada sessions / messages",
    plain: "How many AI planner chats were opened, and how many user messages were sent.",
    formula: "COUNT(ada_sessions); COUNT(ada_messages WHERE role = 'user')",
    source: "ada_sessions, ada_messages",
  },
  {
    term: "Ada plan apply rate",
    plain: "Share of Ada-suggested plan items that were applied (or linked to a task). N/A if nothing was suggested.",
    formula: "applied ÷ suggested × 100",
    source: "ada_generated_plan_items",
  },
  {
    term: "Mood check-ins",
    plain: "Number of mood reflections logged in the last 30 days.",
    formula: "COUNT(mood_checkins in window)",
    source: "mood_checkins",
  },
  {
    term: "Referral share",
    plain: "Share of new signups that have a referred_by link.",
    formula: "referred_signups ÷ signups_in_window × 100",
    source: "profiles.referred_by",
  },
  {
    term: "Revenue / MRR",
    plain: "Not available yet — product has no billing tables. Shown as Pre-revenue / N/A on purpose.",
    formula: "N/A",
    source: "none",
  },
];
