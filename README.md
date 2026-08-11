# Prism Proof Desk

Password-gated internal tool for the Aqademiq team. It answers three questions about **Prism** (the focus-sound engine), using live Aqademiq Postgres:

1. **Setup checklist** — do we log enough to prove Prism helps?
2. **Study results** — what study behavior do we actually see?
3. **Research questions** — which claims can we test, and which are blocked?

This is **not** an investor dashboard.

Metric definitions: [`docs/PRISM_METRIC_REGISTRY.md`](docs/PRISM_METRIC_REGISTRY.md)

## Honesty rule

Every number comes from SQL against the live schema. Gaps show as Missing / Partial on the checklist — never invent causal “Prism lift.”

## Setup

```bash
cp .env.example .env
# fill DATABASE_URL, INVESTOR_DASHBOARD_PASSWORD, SESSION_SECRET

cd dashboard
npm install
npm run dev
```

Open [http://localhost:3100](http://localhost:3100).

Or from this folder: `npm run dev`.

## Security

- Do not commit `.env`
- Read-only SQL against production — treat credentials as secrets
