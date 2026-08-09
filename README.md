# Aqademiq Investor Analytics

Separate from the Aqademiq mobile app and Nest/Supabase API. This folder holds:

- SQL KPI definitions (`extract_kpis.sql`)
- Offline calculators (`compute_investor_kpis.py`, `compute_projections.py`)
- **Investor dashboard** (`dashboard/`) — Whoop/Opal-inspired, password-gated UI over the **same Postgres** as the product backend

## Honesty rule

Every dashboard number is queried from the database. Missing credentials, query failures, or empty cohorts surface as **errors / 0 / N/A**. Nothing is invented for investor slides.

## Setup

1. Copy env template and fill real values:

```bash
cp .env.example .env
```

Required:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Same Supabase pooler URL as `aqademiq-backend` |
| `INVESTOR_DASHBOARD_PASSWORD` | Shared investor login password |
| `SESSION_SECRET` | Long random string for signing the session cookie |

2. Install and run the dashboard:

```bash
cd dashboard
npm install
npm run dev
```

Open [http://localhost:3100](http://localhost:3100) → enter the password.

## What the dashboard shows

- Growth: registered, guests, onboarding rate, signups, referral share
- Activity: DAU / WAU / MAU + stickiness
- Retention: D1 / D7 / D30 (snapshot-based; cohort size shown)
- Activation: first completed focus within 24h
- Engagement: focus, tasks, Ada, mood
- Monetization: **Pre-revenue / N/A** until billing exists

Window defaults to the last **30 days** (UTC).

If `daily_activity_snapshots` has no rows but users completed focus/tasks/mood, MAU falls back to that behavior set and the UI labels the source.

## Offline tools (optional)

```bash
# After filling inputs.json from SQL extracts
python3 compute_investor_kpis.py inputs.json

# Projection model (assumptions only — not measured)
python3 compute_projections.py projection_assumptions.json
```

## Security notes

- Do not commit `.env`
- Dashboard is read-only SQL; still treat credentials as production secrets
- Prefer sharing over a private URL / VPN for external investors
