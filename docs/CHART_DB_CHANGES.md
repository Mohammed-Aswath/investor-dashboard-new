# Detailed DB / app changes so Proof Desk charts reflect real data

**Main table:** `public.focus_sessions`  
**Related:** `prism_presets`, `mood_checkins`, `tasks`, `courses`  
**New (for causal proof):** control-arm field or experiment table  

Live snapshot when this was written (~84 sessions): almost all completed rows have `actual_duration_mins = 0`, `ended_at` empty, Prism rarely tagged. Charts stay empty until the app **writes** these fields correctly (columns mostly already exist).

---

## 1. What “trusted study minutes” (EFM) needs

Proof Desk computes per completed session:

```
net = max(actual_duration_mins − paused_duration_mins, 0)
EFM = net / (1 + 0.15 × min(interruption_count, 20))
valid only if net BETWEEN 5 AND 240
```

Ideal later (when `ended_at` works):

```
gross = LEAST(actual_duration_mins, minutes between started_at and ended_at)
```

**If `actual_duration_mins` is 0 on finish → EFM invalid → almost every chart stays empty.**

---

## 2. Table: `focus_sessions` — field-by-field

| Column | Type | Today | What you must do in the app | Charts unlocked |
|---|---|---|---|---|
| `id` | uuid | OK | Keep | — |
| `user_id` | uuid | OK | Keep | Repeat studiers, PAD, return |
| `started_at` | timestamptz | OK | Set when timer starts | Weekday chart, all trends |
| `ended_at` | timestamptz | **0% filled** | Set when timer stops/finishes/abandons | Strict timing, better EFM |
| `was_completed` | boolean | OK | `true` only when user finishes the block as designed | Funnel “Finished” |
| `status` | varchar | OK | Keep consistent with completed / cancelled / etc. | Ops |
| `planned_duration_mins` | int | Usually set | Keep writing planned length at start | Plan vs actual |
| `actual_duration_mins` | int | **Mostly 0 on complete** | **CRITICAL:** write real elapsed study minutes on end (after subtracting pause if you store pause separately) | **Almost all insight charts** |
| `paused_duration_mins` | int | Mostly 0 | Increment for real pauses | Better EFM quality |
| `interruption_count` | int | Mostly 0 | Increment real interruptions | Better EFM quality |
| `prism_preset_id` | uuid FK → `prism_presets` | **~2/84** | Set when Prism sound is on; `NULL` when off | Prism on vs off |
| `task_id` | uuid FK → `tasks` | Partial (~19) | Always set when focus started from a task | Task donut |
| `course_id` | uuid FK → `courses` | **0** | Set when known (from task’s course or picker) | Course-linked study later |
| `mood_before` | smallint | 0 | Optional: score at session start | Feel / quality |
| `mood_after` | smallint | Rare | Optional: score at session end | Feel / quality |
| `session_rating` | smallint | 0 | Optional: 1–5 after session | Quality next to minutes |
| `notes` / `metadata` | text / jsonb | OK | Optional extras | — |

### App write rules (minimum)

**On focus START**

1. Insert row with `user_id`, `started_at = now()`, `planned_duration_mins`, `was_completed = false`.
2. If Prism playing → `prism_preset_id = <preset uuid>`; else `NULL`.
3. If started from task → `task_id`, and `course_id` from that task when available.

**On focus END (finish or stop)**

1. `ended_at = now()`.
2. `actual_duration_mins =` real minutes studied (not 0 if they studied).
3. Update `paused_duration_mins`, `interruption_count` if you tracked them.
4. `was_completed = true` if they completed the intended block; else false / status cancelled.
5. Keep or clear `prism_preset_id` to match whether sound was on for that session.

**Sanity target (new sessions):**

- ≥70% of `was_completed = true` rows have `actual_duration_mins` between 5 and 240  
- ≥90% have `ended_at` not null  
- Prism sessions always have `prism_preset_id`  

---

## 3. Table: `prism_presets`

| Column | Role |
|---|---|
| `id` | Referenced by `focus_sessions.prism_preset_id` |
| `name`, etc. | Catalog (already ~9 presets) |

**Change:** none to schema. App must **use** these ids when sound is on.

---

## 4. Table: `mood_checkins`

| Column | What to do |
|---|---|
| `user_id` | Keep |
| `focus_session_id` | **Set** whenever check-in is after/during a focus session |
| `mood_score` | Keep writing |
| `checkin_type`, `mood_label`, `checkin_date`, `created_at` | Keep |

**Optional on `focus_sessions`:** fill `mood_before` / `mood_after` for tighter pairing.

**Unlocks:** Mood alongside study; later “feel with Prism” probes.

---

## 5. Tables: `tasks` & `courses` (already healthy enough)

| Table | Fields Proof Desk uses | Action |
|---|---|---|
| `tasks` | `user_id`, `due_at` / `scheduled_start_at`, `completed_at`, `created_at`, `course_id` | Keep dating tasks; complete them as today |
| `courses` | `user_id`, `is_archived` | Keep non-archived courses for activation (VAS) |

**Change:** mainly link `focus_sessions.task_id` / `course_id` — not new task schema.

---

## 6. NEW for causal chart “Control vs Prism”

Columns/tables **do not exist** today for a fair control arm.

**Add one of:**

**Option A — column on session**

```sql
ALTER TABLE focus_sessions
  ADD COLUMN IF NOT EXISTS control_arm boolean NOT NULL DEFAULT false;
-- true = Prism actuation cut for this session (still log PSV later)
```

**Option B — experiment table**

```sql
CREATE TABLE experiment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  focus_session_id uuid NOT NULL REFERENCES focus_sessions(id),
  experiment_key text NOT NULL,      -- e.g. 'prism_control_v1'
  arm text NOT NULL,                 -- 'control' | 'actuated'
  assigned_at timestamptz NOT NULL DEFAULT now()
);
```

**App:** randomly assign ~10–20% sessions to control (no Prism sound / no actuation), store arm, still create `focus_sessions` with full duration logging.

**Unlocks:** only chart that can claim *Prism caused* better study.

---

## 7. NEW optional: `engine_version`

```sql
ALTER TABLE focus_sessions
  ADD COLUMN IF NOT EXISTS engine_version text;
```

Write build id / git hash when Prism runs. Unlocks version A/B later.

---

## 8. Chart → exact dependency map

| Insight chart | Must have | Nice to have |
|---|---|---|
| Trusted study minutes over time | `actual_duration_mins` usable + `was_completed` + `started_at` | `ended_at`, pause/interrupt |
| Timer → trusted funnel | same | — |
| Prism on vs off | usable minutes **and** `prism_preset_id` on/off | — |
| Productive study days | usable EFM summing ≥20 / user-day | — |
| Return within 7 days | PAD + later sessions for same `user_id` | — |
| Started studying for real | usable minutes + `courses` + dated `tasks` | — |
| Planned vs delivered | `planned_duration_mins` + usable `actual_duration_mins` | — |
| Focus attached to tasks | `task_id` filled often | `course_id` |
| Weekday starts | `started_at` (exists) | minutes gate currently waits on #1 |
| Mood pulse | `mood_checkins` rows | `focus_session_id` link |
| Repeat studiers | `user_id` + multiple sessions | minutes gate |
| Control vs Prism | **new** control arm + usable minutes | PSV logs (CORE-001) |

---

## 9. Suggested engineering checklist (start order)

1. **Fix duration write path** in mobile/API when focus ends → `actual_duration_mins`, `ended_at`, `was_completed`.  
2. **Verify** with SQL:

```sql
SELECT
  COUNT(*) FILTER (WHERE was_completed) AS completed,
  COUNT(*) FILTER (
    WHERE was_completed
      AND actual_duration_mins BETWEEN 5 AND 240
  ) AS usable,
  COUNT(*) FILTER (WHERE ended_at IS NOT NULL) AS with_end,
  COUNT(*) FILTER (WHERE prism_preset_id IS NOT NULL) AS with_prism
FROM focus_sessions
WHERE started_at > now() - interval '7 days';
```

3. **Prism tag** on start/stop whenever sound is used.  
4. **task_id / course_id** on start from planner.  
5. **mood_checkins.focus_session_id** when check-in follows focus.  
6. **control_arm** experiment when you want causal proof.  
7. Refresh Prism Proof Desk → charts Empty → Live.

---

## 10. What you do *not* need to invent

- Do not fake historical 0-minute rows (optional backfill only if you know true duration).  
- Do not invent PSV / authority tables for Phase-1 chart lighting (needed for full CORE-001 science later).  
- Venues / other products — out of scope.

---

## Quick “done” definition

For **new** completed sessions after the fix:

| Check | Target |
|---|---|
| `actual_duration_mins` in 5–240 | ≥70% of completes |
| `ended_at` present | ≥90% |
| Prism sessions have `prism_preset_id` | ~100% of Prism-on |
| Proof Desk “Trusted minutes” / funnel | Live after refresh |

That is everything required for the data to **reflect** on the desk.
