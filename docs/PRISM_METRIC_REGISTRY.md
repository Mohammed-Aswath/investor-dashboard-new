# Prism Proof Desk — Metric Registry (Phase 1)

Companion to **PRISM-MEAS-CORE-001** and the Aqademiq metrics quick reference.  
Frozen for Phase 1 against a **live DB audit** (2026-08-09). Scope is **Prism only**.

## CORE-001 concepts (instrumentation)

| Concept | Meaning | In DB today? |
|---|---|---|
| Session | Contiguous engine actuation period | Partial via `focus_sessions` |
| PSV | Prism State Vector (arousal, valence, cognitive load, recovery) | **No** |
| Authority | Per-dimension modulation depth | **No** |
| Arm / control | Fixed % sessions with actuation cut; PCE still logs | **No** |
| Probe | Sparse ground-truth self-report | **No** |
| Engine version | Version/hash on every record | **No** |

## Phase-1 computable metrics

### EFM — Effective Focus Minutes (M15)

Per `focus_sessions` row with `was_completed = true`:

```
gross = actual_duration_mins
        # Ideal: LEAST(actual_duration_mins, ended_at − started_at)
        # Live audit: ended_at is null on all rows → fallback to actual only
net   = MAX(gross − paused_duration_mins, 0)
EFM   = net / (1 + 0.15 × LEAST(interruption_count, 20))
valid iff net BETWEEN 5 AND 240
```

**Data gaps:**

- `ended_at` null → cannot `LEAST(actual, ended−started)`; fallback to `actual_duration_mins` only.
- Live audit: most completed rows have `actual_duration_mins = 0` → few valid EFM sessions (net must be ∈ [5,240]).

### PAD — Productive Active Day

User-local/UTC day with ≥1 valid EFM session **and** day-total EFM ≥ 20.

### Prism proxy (associational only)

`prism_on` = `prism_preset_id IS NOT NULL`.  
Not a control arm. Live coverage was ~2/77 sessions at audit — underpowered for H1.

### Timer finish rate

`COUNT(was_completed) / COUNT(*)` over focus sessions in the window.

### VAS (simplified) — Started for real

User reaches VAS if within 14 days of first activity they have:

1. ≥1 `courses` with `is_archived = false`
2. ≥3 `tasks` with `due_at` or `scheduled_start_at`
3. ≥2 valid EFM sessions totaling ≥40 EFM
4. Activity on ≥3 distinct study days (from valid EFM session dates)

## Explicitly not Phase-1 heroes

| Metric | Why |
|---|---|
| Causal Prism lift | Needs P1–P4 + P6 |
| Ada plan acceptance (M38) | 0 `ada_generated_plan_items` at audit |
| Strong FES | Pause/interrupt fields unused (~0) |
| Investor signup / D7 / MRR | Wrong product |

## Hypotheses (Phase 1)

| ID | Claim | Status rule |
|---|---|---|
| H1 | Prism-on sessions have higher mean EFM than Prism-off | Weak if n_prism < 30 |
| H2 | Control arm vs actuated raises EFM | Blocked until control arm exists |
| H3 | Higher PAD predicts activity in the following 7 days | Testable on current data |
